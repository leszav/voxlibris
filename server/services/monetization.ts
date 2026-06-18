import crypto from 'node:crypto';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db.js';
import { logger } from '../lib/logger.js';
import { getPublicBaseUrl } from '../lib/public-base-url.js';
import {
  commerceEntitlements,
  commerceOrders,
  commercePaymentEvents,
  commercePayments,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  paymentProviders,
  users,
  type CommerceProduct,
  type CommercePrice,
  type CommerceScopeType,
  type PaymentProviderCode,
  type PaymentProviderConfig,
} from '../../shared/schema.js';

type Credentials = Record<string, string>;
type CheckoutInput = { userId: string; product: CommerceProduct; price: CommercePrice; orderId: string; paymentId: string; userEmail?: string };
type CheckoutResult = { provider: PaymentProviderCode; confirmationUrl: string; providerPaymentId: string };
type PaymentNotificationResult = { eventId: string; providerPaymentId: string; status: 'succeeded' | 'failed' | 'cancelled' | 'refunded'; paymentMethodToken?: string };

export interface PaymentProvider {
  code: PaymentProviderCode;
  createCheckout(input: CheckoutInput, credentials: Credentials): Promise<CheckoutResult>;
  verifyNotification(rawBody: string, headers: Request['headers'], credentials: Credentials, body: unknown): Promise<boolean>;
  parseNotification(body: unknown): PaymentNotificationResult;
}

function encryptCredentials(credentials: Credentials) {
  const key = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!key || key.length < 32) throw new Error('PAYMENT_CREDENTIALS_KEY должен быть не короче 32 символов');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(key).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptCredentials(value: string): Credentials {
  const key = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!key || key.length < 32) throw new Error('PAYMENT_CREDENTIALS_KEY должен быть не короче 32 символов');
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(key).digest(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8')) as Credentials;
}

async function yookassaPaymentVerified(paymentId: string, credentials: Credentials) {
  const authorization = yookassaAuthorization(credentials);
  if (!paymentId || !authorization) return false;
  const response = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authorization },
  });
  if (!response.ok) return false;
  const payment = await response.json() as { id?: string; status?: string };
  return payment.id === paymentId && ['succeeded', 'canceled'].includes(String(payment.status));
}

function yookassaAuthorization(credentials: Credentials) {
  const shopId = credentials.shopId?.trim();
  const apiKey = (credentials.apiKey ?? credentials.secretKey)?.trim();
  if (!shopId || !apiKey) return null;
  return `Basic ${Buffer.from(`${shopId}:${apiKey}`).toString('base64')}`;
}

function parseYookassaNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yookassaReceipt(input: CheckoutInput, credentials: Credentials) {
  if (credentials.receiptEnabled !== 'true') return undefined;
  const email = input.userEmail?.trim();
  if (!email) throw new Error('Для 54-ФЗ чека ЮKassa требуется email пользователя');

  const receipt: Record<string, unknown> = {
    customer: { email },
    items: [{
      description: input.product.title.slice(0, 128),
      quantity: '1.000',
      amount: { value: input.price.amountRub.toFixed(2), currency: 'RUB' },
      vat_code: parseYookassaNumber(credentials.vatCode, 1),
      payment_subject: credentials.paymentSubject || 'service',
      payment_mode: credentials.paymentMode || 'full_payment',
    }],
  };

  if (credentials.taxSystemCode) receipt.tax_system_code = parseYookassaNumber(credentials.taxSystemCode, 0);
  return receipt;
}

const yookassaProvider: PaymentProvider = {
  code: 'yookassa',
  async createCheckout(input, credentials) {
    const authorization = yookassaAuthorization(credentials);
    if (!authorization) throw new Error('Не настроены ID магазина и API-key ЮKassa');
    const receipt = yookassaReceipt(input, credentials);
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'Idempotence-Key': input.paymentId,
      },
      body: JSON.stringify({
        amount: { value: input.price.amountRub.toFixed(2), currency: 'RUB' },
        capture: true,
        save_payment_method: input.price.period !== 'one_time',
        confirmation: { type: 'redirect', return_url: credentials.returnUrl },
        description: input.product.title,
        metadata: { orderId: input.orderId, paymentId: input.paymentId, productId: input.product.id },
        ...(receipt ? { receipt } : {}),
      }),
    });
    const data = await response.json() as { id?: string; confirmation?: { confirmation_url?: string }; description?: string };
    if (!response.ok) throw new Error(data.description || `ЮKassa вернула HTTP ${response.status}`);
    if (!data.id || !data.confirmation?.confirmation_url) throw new Error('ЮKassa не вернула ссылку подтверждения платежа');
    return { provider: 'yookassa', confirmationUrl: data.confirmation?.confirmation_url ?? '', providerPaymentId: String(data.id ?? '') };
  },
  async verifyNotification(_raw, _headers, credentials, body) {
    const event = body as { object?: { id?: string } };
    return yookassaPaymentVerified(String(event.object?.id ?? ''), credentials);
  },
  parseNotification(body) {
    const event = body as { event?: string; object?: { id?: string; status?: string; payment_method?: { id?: string } } };
    const status = event.object?.status === 'succeeded' ? 'succeeded' : event.object?.status === 'canceled' ? 'cancelled' : 'failed';
    return { eventId: `${event.event ?? 'payment'}:${event.object?.id ?? ''}:${status}`, providerPaymentId: String(event.object?.id ?? ''), status, paymentMethodToken: event.object?.payment_method?.id };
  },
};

const strategies = [yookassaProvider];

export class PaymentGatewayService {
  async listProviders() { return db.select().from(paymentProviders).orderBy(paymentProviders.priority); }
  safeCredentials(provider: PaymentProviderConfig) {
    const credentials = decryptCredentials(provider.encryptedCredentials);
    const { apiKey: _apiKey, secretKey: _secretKey, ...safeCredentials } = credentials;
    return safeCredentials;
  }
  async saveProvider(input: { code: PaymentProviderCode; name: string; credentials: Credentials; status?: 'active' | 'inactive'; priority?: number }) {
    // Проверяем, существует ли уже провайдер с таким кодом
    const [existing] = await db.select().from(paymentProviders).where(eq(paymentProviders.code, input.code)).limit(1);
    
    if (existing) {
      // UPDATE: merge credentials с существующими, если API-key не передан
      let finalCredentials = input.credentials;
      if (!input.credentials.apiKey && !input.credentials.secretKey) {
        const existingCredentials = decryptCredentials(existing.encryptedCredentials);
        finalCredentials = { ...input.credentials, ...Object.fromEntries(Object.entries(existingCredentials).filter(([key]) => key === 'apiKey' || key === 'secretKey')) };
      }
      
      if (input.status === 'active' && existing.status !== 'active') {
        await db.update(paymentProviders).set({ status: 'inactive' }).where(eq(paymentProviders.status, 'active'));
      }
      
      return db.update(paymentProviders)
        .set({
          name: input.name,
          encryptedCredentials: encryptCredentials(finalCredentials),
          status: input.status ?? existing.status,
          priority: input.priority ?? existing.priority,
          updatedAt: new Date(),
        })
        .where(eq(paymentProviders.id, existing.id))
        .returning();
    }
    
    // INSERT: новый провайдер
    if (input.status === 'active') await db.update(paymentProviders).set({ status: 'inactive' }).where(eq(paymentProviders.status, 'active'));
    return db.insert(paymentProviders).values({ ...input, encryptedCredentials: encryptCredentials(input.credentials) }).returning();
  }
  async setActive(id: string) {
    await db.update(paymentProviders).set({ status: 'inactive' }).where(eq(paymentProviders.status, 'active'));
    return db.update(paymentProviders).set({ status: 'active', updatedAt: new Date() }).where(eq(paymentProviders.id, id)).returning();
  }
  strategy(code: PaymentProviderCode) {
    const strategy = strategies.find((item) => item.code === code);
    if (!strategy) throw new Error('Платёжный провайдер не поддерживается');
    return strategy;
  }
  credentials(provider: PaymentProviderConfig) { return decryptCredentials(provider.encryptedCredentials); }
  async activeProviders() { return db.select().from(paymentProviders).where(and(eq(paymentProviders.status, 'active'), eq(paymentProviders.code, 'yookassa'))).orderBy(paymentProviders.priority); }
}

export class CommerceService {
  async listPublicPlatformProducts() {
    return this.listPublicProducts({ type: 'platform_subscription' });
  }

  async listPublicProducts(filter: { type?: CommerceProduct['type']; scopeType?: CommerceScopeType; scopeId?: string | null } = {}) {
    const conditions = [eq(commerceProducts.status, 'active'), eq(commerceProducts.visibility, 'public')];
    if (filter.type) conditions.push(eq(commerceProducts.type, filter.type));
    if (filter.scopeType) conditions.push(eq(commerceProducts.scopeType, filter.scopeType));
    if (filter.scopeId !== undefined) conditions.push(filter.scopeId ? eq(commerceProducts.scopeId, filter.scopeId) : isNull(commerceProducts.scopeId));

    const rows = await db.select({ product: commerceProducts, price: commercePrices, feature: commerceProductFeatures })
      .from(commerceProducts)
      .leftJoin(commercePrices, and(eq(commercePrices.productId, commerceProducts.id), eq(commercePrices.status, 'active')))
      .leftJoin(commerceProductFeatures, eq(commerceProductFeatures.productId, commerceProducts.id))
      .where(and(...conditions))
      .orderBy(asc(commerceProducts.sortOrder), asc(commercePrices.amountRub), asc(commerceProductFeatures.sortOrder));

    const products = new Map<string, CommerceProduct & { prices: CommercePrice[]; features: Array<{ label: string; featureKey: string; isHighlighted: boolean }> }>();
    for (const row of rows) {
      const item = products.get(row.product.id) ?? { ...row.product, prices: [], features: [] };
      if (row.price && !item.prices.some((price) => price.id === row.price!.id)) item.prices.push(row.price);
      if (row.feature && !item.features.some((feature) => feature.featureKey === row.feature!.featureKey)) {
        item.features.push({ label: row.feature.label, featureKey: row.feature.featureKey, isHighlighted: row.feature.isHighlighted });
      }
      products.set(row.product.id, item);
    }
    return [...products.values()];
  }

  async hasEntitlement(userId: string, scopeType: CommerceScopeType, scopeId: string | null, featureKey: string) {
    const now = new Date();
    const [row] = await db.select({ id: commerceEntitlements.id }).from(commerceEntitlements)
      .where(and(
        eq(commerceEntitlements.userId, userId),
        eq(commerceEntitlements.scopeType, scopeType),
        scopeId ? eq(commerceEntitlements.scopeId, scopeId) : isNull(commerceEntitlements.scopeId),
        eq(commerceEntitlements.featureKey, featureKey),
        eq(commerceEntitlements.status, 'active'),
        or(isNull(commerceEntitlements.endsAt), sql`${commerceEntitlements.endsAt} > ${now}`),
      )).limit(1);
    return Boolean(row);
  }

  async createCheckout(userId: string, productId: string, priceId?: string) {
    const [product] = await db.select().from(commerceProducts).where(and(eq(commerceProducts.id, productId), eq(commerceProducts.status, 'active'))).limit(1);
    if (!product) throw new Error('Продукт не найден');
    const [price] = await db.select().from(commercePrices).where(and(eq(commercePrices.productId, product.id), priceId ? eq(commercePrices.id, priceId) : eq(commercePrices.isDefault, true), eq(commercePrices.status, 'active'))).limit(1);
    if (!price) throw new Error('Цена не найдена');
    if (price.amountRub === 0) return this.grantFreeAccess(userId, product, price);

    const gateway = new PaymentGatewayService();
    const providers = await gateway.activeProviders();
    const [order] = await db.insert(commerceOrders).values({ userId, productId: product.id, priceId: price.id, amountRub: price.amountRub }).returning();
    const [payment] = await db.insert(commercePayments).values({ orderId: order.id, amountRub: price.amountRub }).returning();
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const returnUrl = await getPublicBaseUrl();

    for (const provider of providers) {
      try {
        const credentials = { ...gateway.credentials(provider), returnUrl };
        const result = await gateway.strategy(provider.code).createCheckout({ userId, product, price, orderId: order.id, paymentId: payment.id, userEmail: user?.email }, credentials);
        await db.update(commercePayments).set({ providerId: provider.id, providerPaymentId: result.providerPaymentId }).where(eq(commercePayments.id, payment.id));
        return result;
      } catch (error) { logger.warn({ provider: provider.code, error }, 'Payment provider checkout failed'); }
    }
    throw new Error('Нет доступного платёжного шлюза');
  }

  private async grantFreeAccess(userId: string, product: CommerceProduct, price: CommercePrice) {
    const [order] = await db.insert(commerceOrders).values({ userId, productId: product.id, priceId: price.id, amountRub: 0, status: 'paid' }).returning();
    await this.grantProductEntitlements(userId, product, 'payment', order.id);
    return { provider: null, confirmationUrl: '', providerPaymentId: '', granted: true };
  }

  async grantProductEntitlements(userId: string, product: CommerceProduct, sourceType: 'payment' | 'subscription' | 'promo' | 'admin_grant' | 'migration', sourceId?: string) {
    const features = await db.select().from(commerceProductFeatures).where(eq(commerceProductFeatures.productId, product.id));
    const granted = [];
    for (const feature of features) {
      const [existing] = await db.select({ id: commerceEntitlements.id }).from(commerceEntitlements)
        .where(and(
          eq(commerceEntitlements.userId, userId),
          eq(commerceEntitlements.scopeType, product.scopeType),
          product.scopeId ? eq(commerceEntitlements.scopeId, product.scopeId) : isNull(commerceEntitlements.scopeId),
          eq(commerceEntitlements.featureKey, feature.featureKey),
          eq(commerceEntitlements.status, 'active'),
        ))
        .limit(1);
      if (existing) continue;
      const [entitlement] = await db.insert(commerceEntitlements).values({
        userId,
        scopeType: product.scopeType,
        scopeId: product.scopeId,
        featureKey: feature.featureKey,
        sourceType,
        sourceId,
      }).returning();
      granted.push(entitlement);
    }
    return granted;
  }

  async adminGrantProductAccess(input: { userId: string; productId: string; adminUserId: string; sourceType: 'promo' | 'admin_grant' }) {
    const [product] = await db.select().from(commerceProducts).where(eq(commerceProducts.id, input.productId)).limit(1);
    if (!product) throw new Error('Продукт не найден');
    const granted = await this.grantProductEntitlements(input.userId, product, input.sourceType, input.productId);
    if (granted.length > 0) {
      await db.update(commerceEntitlements)
        .set({ createdBy: input.adminUserId, updatedAt: new Date() })
        .where(and(
          eq(commerceEntitlements.userId, input.userId),
          eq(commerceEntitlements.sourceType, input.sourceType),
          eq(commerceEntitlements.sourceId, input.productId),
          eq(commerceEntitlements.status, 'active'),
        ));
    }
    return granted;
  }

  async revokeEntitlement(entitlementId: string) {
    const [entitlement] = await db.update(commerceEntitlements)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(commerceEntitlements.id, entitlementId))
      .returning();
    if (!entitlement) throw new Error('Доступ не найден');
    return entitlement;
  }
}

export const SubscriptionService = CommerceService;

export class PaymentNotificationProcessorService {
  async process(providerCode: PaymentProviderCode, rawBody: string, body: unknown, headers: Request['headers']) {
    const gateway = new PaymentGatewayService();
    const [provider] = (await gateway.listProviders()).filter((item) => item.code === providerCode);
    if (!provider) throw new Error('Провайдер не найден');
    const strategy = gateway.strategy(providerCode);
    if (!await strategy.verifyNotification(rawBody, headers, gateway.credentials(provider), body)) throw new Error('Неверная подпись платёжного уведомления');
    const event = strategy.parseNotification(body);
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const inserted = await db.insert(commercePaymentEvents).values({ providerCode, providerEventId: event.eventId, providerPaymentId: event.providerPaymentId, eventType: event.status, payloadHash }).onConflictDoNothing().returning();
    if (inserted.length === 0) return;
    const paymentEvent = inserted[0];

    try {
      await db.transaction(async (tx) => {
        const [payment] = await tx.select().from(commercePayments).where(eq(commercePayments.providerPaymentId, event.providerPaymentId)).limit(1);
        if (!payment) {
          await tx.update(commercePaymentEvents).set({ status: 'processed', processedAt: new Date() }).where(eq(commercePaymentEvents.id, paymentEvent.id));
          return;
        }
        await tx.update(commercePayments).set({ status: event.status, paymentMethodToken: event.paymentMethodToken, updatedAt: new Date() }).where(eq(commercePayments.id, payment.id));
        if (event.status !== 'succeeded') {
          await tx.update(commercePaymentEvents).set({ status: 'processed', processedAt: new Date() }).where(eq(commercePaymentEvents.id, paymentEvent.id));
          return;
        }

        const [order] = await tx.select().from(commerceOrders).where(eq(commerceOrders.id, payment.orderId)).limit(1);
        if (!order) {
          await tx.update(commercePaymentEvents).set({ status: 'processed', processedAt: new Date() }).where(eq(commercePaymentEvents.id, paymentEvent.id));
          return;
        }
        await tx.update(commerceOrders).set({ status: 'paid', updatedAt: new Date() }).where(eq(commerceOrders.id, order.id));
        const [product] = await tx.select().from(commerceProducts).where(eq(commerceProducts.id, order.productId)).limit(1);
        if (product) {
          const features = await tx.select().from(commerceProductFeatures).where(eq(commerceProductFeatures.productId, product.id));
          for (const feature of features) {
            const [existing] = await tx.select({ id: commerceEntitlements.id }).from(commerceEntitlements)
              .where(and(
                eq(commerceEntitlements.userId, order.userId),
                eq(commerceEntitlements.scopeType, product.scopeType),
                product.scopeId ? eq(commerceEntitlements.scopeId, product.scopeId) : isNull(commerceEntitlements.scopeId),
                eq(commerceEntitlements.featureKey, feature.featureKey),
                eq(commerceEntitlements.status, 'active'),
              ))
              .limit(1);
            if (existing) continue;
            await tx.insert(commerceEntitlements).values({
              userId: order.userId,
              scopeType: product.scopeType,
              scopeId: product.scopeId,
              featureKey: feature.featureKey,
              sourceType: 'payment',
              sourceId: payment.id,
            });
          }
        }
        await tx.update(commercePaymentEvents).set({ status: 'processed', processedAt: new Date() }).where(eq(commercePaymentEvents.id, paymentEvent.id));
      });
    } catch (error) {
      await db.update(commercePaymentEvents)
        .set({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Unknown payment event processing error' })
        .where(eq(commercePaymentEvents.id, paymentEvent.id));
      throw error;
    }
  }
}

export function requireEntitlement(input: { scopeType: CommerceScopeType; scopeId?: string | null; featureKey: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Требуется аутентификация' });
    if (req.user.role === 'admin') return next();
    const allowed = await new CommerceService().hasEntitlement(req.user.userId, input.scopeType, input.scopeId ?? null, input.featureKey);
    return allowed ? next() : res.status(403).json({ message: 'Требуется доступ', code: 'ENTITLEMENT_REQUIRED', feature: input.featureKey });
  };
}

export function requireSubscription(featureKey: string) {
  return requireEntitlement({ scopeType: 'platform', scopeId: null, featureKey });
}

export async function financialDashboard() {
  const [summary] = await db.select({
    revenue: sql<number>`coalesce(sum(case when ${commercePayments.status} = 'succeeded' then ${commercePayments.amountRub} else 0 end), 0)`,
    activeSubscriptions: sql<number>`(select count(*) from commerce_subscriptions where status = 'active')`,
    cancelledSubscriptions: sql<number>`(select count(*) from commerce_subscriptions where status = 'cancelled')`,
  }).from(commercePayments).where(sql`${commercePayments.createdAt} >= now() - interval '30 days'`);
  const revenue = Number(summary?.revenue ?? 0);
  const active = Number(summary?.activeSubscriptions ?? 0);
  const cancelled = Number(summary?.cancelledSubscriptions ?? 0);
  const recent = await db.select().from(commercePayments).orderBy(desc(commercePayments.createdAt)).limit(10);
  return { revenue, mrr: revenue, arr: revenue * 12, churn: active + cancelled > 0 ? cancelled / (active + cancelled) : 0, conversion: active, recent };
}
