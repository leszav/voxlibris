import crypto from 'node:crypto';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db.js';
import { logger } from '../lib/logger.js';
import { getPublicBaseUrl } from '../lib/public-base-url.js';
import { commerceEntitlementEnd } from './commerce-periods.js';
import { emailService } from './email-service.js';
import {
  clubMembers,
  clubs,
  commerceEntitlements,
  commerceLedgerEntries,
  commerceOrders,
  commercePaymentEvents,
  commercePayments,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  paymentProviders,
  readerClubTariffAssignments,
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
type PaymentNotificationResult = { eventId: string; providerPaymentId: string; status: 'succeeded' | 'failed' | 'cancelled' | 'refunded'; paymentMethodToken?: string; fiscalReceiptId?: string; fiscalReceiptUrl?: string };

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

async function ensureReaderClubMembership(tx: DbExecutor, product: CommerceProduct, userId: string) {
  if (product.scopeType !== 'reader_club' || !product.scopeId) return;
  const [club] = await tx.select({ id: clubs.id, type: clubs.type }).from(clubs).where(eq(clubs.id, product.scopeId)).limit(1);
  if (!club || club.type !== 'reader-led') return;

  const [member] = await tx.select({ id: clubMembers.id, isActive: clubMembers.isActive }).from(clubMembers)
    .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, userId)))
    .limit(1);
  if (member?.isActive) return;
  if (member) {
    await tx.update(clubMembers).set({ isActive: true }).where(eq(clubMembers.id, member.id));
    return;
  }
  await tx.insert(clubMembers).values({ clubId: club.id, userId, role: 'member', joinedAt: new Date(), isActive: true });
}

async function createReaderClubLedger(tx: DbExecutor, product: CommerceProduct, order: typeof commerceOrders.$inferSelect, payment: typeof commercePayments.$inferSelect) {
  if (product.scopeType !== 'reader_club' || !product.scopeId || payment.amountRub <= 0) return;
  const [existing] = await tx.select({ id: commerceLedgerEntries.id }).from(commerceLedgerEntries).where(eq(commerceLedgerEntries.paymentId, payment.id)).limit(1);
  if (existing) return;

  const [assignment] = await tx.select({ readerShareBps: readerClubTariffAssignments.readerShareBps, acquiringFeeBps: readerClubTariffAssignments.acquiringFeeBps }).from(readerClubTariffAssignments)
    .where(and(
      eq(readerClubTariffAssignments.productId, product.id),
      eq(readerClubTariffAssignments.clubId, product.scopeId),
      eq(readerClubTariffAssignments.status, 'active'),
    ))
    .limit(1);
  if (!assignment) return;

  const [club] = await tx.select({ ownerId: clubs.ownerId }).from(clubs).where(eq(clubs.id, product.scopeId)).limit(1);
  const gross = payment.amountRub * 100;
  const acquiringFee = Math.round(gross * assignment.acquiringFeeBps / 10000);
  const net = gross - acquiringFee;
  const readerEarning = Math.round(net * assignment.readerShareBps / 10000);
  const platformFee = net - readerEarning;

  await tx.insert(commerceLedgerEntries).values([
    { paymentId: payment.id, orderId: order.id, productId: product.id, clubId: product.scopeId, entryType: 'acquiring_fee', amountKopecks: acquiringFee, shareBps: assignment.acquiringFeeBps, status: 'available' },
    { paymentId: payment.id, orderId: order.id, productId: product.id, clubId: product.scopeId, readerUserId: club?.ownerId, entryType: 'reader_earning', amountKopecks: readerEarning, shareBps: assignment.readerShareBps, status: 'available' },
    { paymentId: payment.id, orderId: order.id, productId: product.id, clubId: product.scopeId, entryType: 'platform_fee', amountKopecks: platformFee, status: 'available' },
  ]);
}

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

function formatPeriod(period: CommercePrice['period']) {
  const labels: Record<CommercePrice['period'], string> = { one_time: 'разово', week: 'неделя', month: 'месяц', quarter: 'квартал', year: 'год' };
  return labels[period] ?? period;
}

function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function subscriptionEmailHtml(input: { title: string; amountRub: number; period: CommercePrice['period']; receiptUrl?: string | null }) {
  const receiptLink = input.receiptUrl
    ? `<p><a class="button" href="${escapeEmailHtml(input.receiptUrl)}">Открыть чек</a></p>`
    : '';
  const content = `
    <h2>Подписка успешно оформлена</h2>
    <p>Спасибо, что выбрали VoxLibris. Доступ по подписке активирован.</p>
    <div class="highlight">
      <p><strong>Тариф:</strong> ${escapeEmailHtml(input.title)}</p>
      <p><strong>Стоимость:</strong> ${input.amountRub.toLocaleString('ru-RU')} ₽ / ${formatPeriod(input.period)}</p>
    </div>
    ${receiptLink ? `<div class="button-wrap">${receiptLink}</div>` : ''}
    <div class="info">
      <strong>Как отказаться от подписки</strong><br>
      Откройте профиль или раздел управления подпиской и отмените продление. Если раздел ещё недоступен, напишите в поддержку VoxLibris — мы отключим продление вручную.
    </div>
  `;
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Подписка VoxLibris оформлена</title><style>
body,table,td,p,a,h1,h2,h3{margin:0;padding:0}table{border-spacing:0;border-collapse:collapse}body{font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;color:#3D2B1F;background:#F5F2ED}a{color:#8B5A2B;text-decoration:underline}.wrapper{width:100%;max-width:600px;margin:0 auto;padding:40px 20px}.card{background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(92,64,51,.08)}.header{background:#5C4033;padding:32px 40px;text-align:center}.header-icon{width:48px;height:48px;margin:0 auto 12px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px}.header-title{font-family:"Playfair Display",serif;font-size:24px;font-weight:600;color:#FFFFFF;margin:0}.body{padding:40px}.body h2{font-family:"Playfair Display",serif;font-size:20px;font-weight:600;color:#5C4033;margin:0 0 16px}.body p{margin:0 0 16px;color:#3D2B1F}.highlight{background:#F7F3ED;border-left:3px solid #D4A574;padding:16px 20px;margin:20px 0;border-radius:0 8px 8px 0}.button{display:inline-block;background:#5C4033;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px}.button-wrap{text-align:center;margin:28px 0}.info{background:#F7F3ED;border-radius:8px;padding:16px 20px;margin:20px 0;font-size:14px;color:#8B7355}.footer{padding:24px 40px;text-align:center;border-top:1px solid #E8DFD5;background:#F7F3ED}.footer-logo{font-family:"Playfair Display",serif;font-size:16px;font-weight:600;color:#5C4033;margin-bottom:8px}.footer-text{font-size:13px;color:#8B7355;margin:0}.footer-link{color:#C49565}@media(max-width:640px){.wrapper{padding:20px 16px}.header{padding:24px 20px}.body{padding:24px 20px}.footer{padding:20px}}
</style></head><body><div class="wrapper"><div class="card"><div class="header"><div class="header-icon">📚</div><h1 class="header-title">VoxLibris</h1></div><div class="body">${content}</div><div class="footer"><div class="footer-logo">VoxLibris</div><p class="footer-text">Платформа для книжных клубов<br>Это автоматическое письмо, отвечать не нужно.<br><a class="footer-link" href="mailto:support@voxlibris.ru">support@voxlibris.ru</a></p></div></div></div></body></html>`;
}

async function sendSubscriptionEmail(input: { email: string; title: string; amountRub: number; period: CommercePrice['period']; receiptUrl?: string | null }) {
  const text = [
    `Подписка успешно оформлена: ${input.title}.`,
    `Стоимость: ${input.amountRub.toLocaleString('ru-RU')} ₽ / ${formatPeriod(input.period)}.`,
    input.receiptUrl ? `Чек: ${input.receiptUrl}` : null,
    '',
    'Как отказаться от подписки: откройте профиль или раздел управления подпиской и отмените продление. Если раздел ещё недоступен, напишите в поддержку VoxLibris — мы отключим продление вручную.',
  ].filter(Boolean).join('\n');
  const ok = await emailService.sendEmail({
    to: input.email,
    subject: `Подписка VoxLibris оформлена: ${input.title}`,
    html: subscriptionEmailHtml(input),
    text,
  });
  if (!ok) throw new Error('EmailService не отправил письмо о подписке');
}

async function sendSubscriptionEmailForPayment(paymentId: string) {
  const [row] = await db.select({
    email: users.email,
    title: commerceProducts.title,
    amountRub: commercePrices.amountRub,
    period: commercePrices.period,
    receiptUrl: commercePayments.fiscalReceiptUrl,
  })
    .from(commercePayments)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .innerJoin(users, eq(users.id, commerceOrders.userId))
    .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .innerJoin(commercePrices, eq(commercePrices.id, commerceOrders.priceId))
    .where(eq(commercePayments.id, paymentId))
    .limit(1);
  if (!row?.email) return;
  await sendSubscriptionEmail(row);
}

async function yookassaPaymentVerified(paymentId: string, credentials: Credentials) {
  const authorization = yookassaAuthorization(credentials);
  if (!paymentId || !authorization) return false;
  const response = await fetch(`${yookassaApiBaseUrl()}/v3/payments/${encodeURIComponent(paymentId)}`, {
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

function yookassaApiBaseUrl() {
  if (process.env.NODE_ENV !== 'production' && process.env.YOOKASSA_API_BASE_URL) {
    return process.env.YOOKASSA_API_BASE_URL.replace(/\/+$/, '');
  }
  return 'https://api.yookassa.ru';
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
    const response = await fetch(`${yookassaApiBaseUrl()}/v3/payments`, {
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
    const event = body as { event?: string; object?: { id?: string; status?: string; payment_method?: { id?: string }; metadata?: { fiscalReceiptId?: string; fiscalReceiptUrl?: string } } };
    const status = event.object?.status === 'succeeded' ? 'succeeded' : event.object?.status === 'canceled' ? 'cancelled' : 'failed';
    return {
      eventId: `${event.event ?? 'payment'}:${event.object?.id ?? ''}:${status}`,
      providerPaymentId: String(event.object?.id ?? ''),
      status,
      paymentMethodToken: event.object?.payment_method?.id,
      fiscalReceiptId: event.object?.metadata?.fiscalReceiptId,
      fiscalReceiptUrl: event.object?.metadata?.fiscalReceiptUrl,
    };
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
      .leftJoin(commerceProductFeatures, and(eq(commerceProductFeatures.productId, commerceProducts.id), eq(commerceProductFeatures.isActive, true)))
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
    const [row] = await db.select({ id: commerceEntitlements.id }).from(commerceEntitlements)
      .where(and(
        eq(commerceEntitlements.userId, userId),
        eq(commerceEntitlements.scopeType, scopeType),
        scopeId ? eq(commerceEntitlements.scopeId, scopeId) : isNull(commerceEntitlements.scopeId),
        eq(commerceEntitlements.featureKey, featureKey),
        eq(commerceEntitlements.status, 'active'),
        or(isNull(commerceEntitlements.endsAt), sql`${commerceEntitlements.endsAt} > now()`),
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
    const baseUrl = await getPublicBaseUrl();
    const returnUrl = product.scopeType === 'reader_club' && product.scopeId
      ? `${baseUrl}/payment/success?clubId=${encodeURIComponent(product.scopeId)}`
      : `${baseUrl}/payment/success`;

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
    await this.grantProductEntitlements(userId, product, price, 'payment', order.id);
    await ensureReaderClubMembership(db, product, userId);
    return { provider: null, confirmationUrl: '', providerPaymentId: '', granted: true };
  }

  async grantProductEntitlements(userId: string, product: CommerceProduct, price: CommercePrice, sourceType: 'payment' | 'subscription' | 'promo' | 'admin_grant' | 'migration', sourceId?: string) {
    const features = await db.select().from(commerceProductFeatures).where(and(eq(commerceProductFeatures.productId, product.id), eq(commerceProductFeatures.isActive, true)));
    const granted = [];
    for (const feature of features) {
      const [existing] = await db.select({ id: commerceEntitlements.id, endsAt: commerceEntitlements.endsAt }).from(commerceEntitlements)
        .where(and(
          eq(commerceEntitlements.userId, userId),
          eq(commerceEntitlements.scopeType, product.scopeType),
          product.scopeId ? eq(commerceEntitlements.scopeId, product.scopeId) : isNull(commerceEntitlements.scopeId),
          eq(commerceEntitlements.featureKey, feature.featureKey),
          eq(commerceEntitlements.status, 'active'),
        ))
        .limit(1);
      if (existing && price.period === 'one_time') continue;
      if (existing) {
        const [entitlement] = await db.update(commerceEntitlements)
          .set({ endsAt: commerceEntitlementEnd(price, existing.endsAt), sourceType, sourceId, updatedAt: new Date() })
          .where(eq(commerceEntitlements.id, existing.id))
          .returning();
        granted.push(entitlement);
        continue;
      }
      const [entitlement] = await db.insert(commerceEntitlements).values({
        userId,
        scopeType: product.scopeType,
        scopeId: product.scopeId,
        featureKey: feature.featureKey,
        sourceType,
        sourceId,
        endsAt: commerceEntitlementEnd(price, null),
      }).returning();
      granted.push(entitlement);
    }
    return granted;
  }

  async adminGrantProductAccess(input: { userId: string; productId: string; adminUserId: string; sourceType: 'promo' | 'admin_grant' }) {
    const [product] = await db.select().from(commerceProducts).where(eq(commerceProducts.id, input.productId)).limit(1);
    if (!product) throw new Error('Продукт не найден');
    const [price] = await db.select().from(commercePrices).where(and(eq(commercePrices.productId, product.id), eq(commercePrices.isDefault, true), eq(commercePrices.status, 'active'))).limit(1);
    if (!price) throw new Error('Цена не найдена');
    const granted = await this.grantProductEntitlements(input.userId, product, price, input.sourceType, input.productId);
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
        await tx.update(commercePayments).set({ status: event.status, paymentMethodToken: event.paymentMethodToken, fiscalReceiptId: event.fiscalReceiptId, fiscalReceiptUrl: event.fiscalReceiptUrl, updatedAt: new Date() }).where(eq(commercePayments.id, payment.id));
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
          const [price] = await tx.select().from(commercePrices).where(eq(commercePrices.id, order.priceId)).limit(1);
          if (!price) throw new Error('Цена не найдена');
          const features = await tx.select().from(commerceProductFeatures).where(and(eq(commerceProductFeatures.productId, product.id), eq(commerceProductFeatures.isActive, true)));
          for (const feature of features) {
            const [existing] = await tx.select({ id: commerceEntitlements.id, endsAt: commerceEntitlements.endsAt }).from(commerceEntitlements)
              .where(and(
                eq(commerceEntitlements.userId, order.userId),
                eq(commerceEntitlements.scopeType, product.scopeType),
                product.scopeId ? eq(commerceEntitlements.scopeId, product.scopeId) : isNull(commerceEntitlements.scopeId),
                eq(commerceEntitlements.featureKey, feature.featureKey),
                eq(commerceEntitlements.status, 'active'),
              ))
              .limit(1);
            if (existing && price.period === 'one_time') continue;
            if (existing) {
              await tx.update(commerceEntitlements)
                .set({ endsAt: commerceEntitlementEnd(price, existing.endsAt), sourceType: 'payment', sourceId: payment.id, updatedAt: new Date() })
                .where(eq(commerceEntitlements.id, existing.id));
              continue;
            }
            await tx.insert(commerceEntitlements).values({
              userId: order.userId,
              scopeType: product.scopeType,
              scopeId: product.scopeId,
              featureKey: feature.featureKey,
              sourceType: 'payment',
              sourceId: payment.id,
              endsAt: commerceEntitlementEnd(price, null),
            });
          }
          await ensureReaderClubMembership(tx, product, order.userId);
          await createReaderClubLedger(tx, product, order, payment);
        }
        await tx.update(commercePaymentEvents).set({ status: 'processed', processedAt: new Date() }).where(eq(commercePaymentEvents.id, paymentEvent.id));
      });
      if (event.status === 'succeeded') {
        const [payment] = await db.select({ id: commercePayments.id }).from(commercePayments).where(eq(commercePayments.providerPaymentId, event.providerPaymentId)).limit(1);
        if (payment) {
          await sendSubscriptionEmailForPayment(payment.id).catch((error) => logger.warn({ paymentId: payment.id, error }, 'Subscription email failed'));
        }
      }
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
