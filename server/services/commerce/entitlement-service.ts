import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { CommerceFeatureRegistryItem, CommerceProductFeature, CommerceScopeType } from '../../../shared/schema.js';

export type EntitlementErrorCode = 'MISSING_ENTITLEMENT' | 'LIMIT_EXCEEDED' | 'READER_CLUB_ACCESS_REQUIRED';

export type EntitlementContext = {
  scopeType?: CommerceScopeType;
  scopeId?: string | null;
  now?: Date;
};

export type EntitlementCheckResult = {
  allowed: boolean;
  featureKey: string;
  value: boolean | number | string | unknown | null;
  used?: number;
  limit?: number;
  code?: EntitlementErrorCode;
};

type FeatureSource = Pick<CommerceProductFeature, 'featureKey' | 'valueType' | 'valueBool' | 'valueInt' | 'valueText' | 'valueJson'>;
type RegistrySource = Pick<CommerceFeatureRegistryItem, 'key' | 'scopeType' | 'valueType' | 'defaultBool' | 'defaultInt' | 'defaultText' | 'defaultJson'>;
type ActiveEntitlement = { feature: FeatureSource | null };

export type EntitlementStore = {
  findActiveEntitlement(input: { userId: string; featureKey: string; scopeType: CommerceScopeType; scopeId: string | null; now: Date }): Promise<ActiveEntitlement | null>;
  findActiveSubscriptionFeature(input: { userId: string; featureKey: string; scopeType: CommerceScopeType; scopeId: string | null; now: Date }): Promise<FeatureSource | null>;
  findRegistryFeature(featureKey: string): Promise<RegistrySource | null>;
};

export class EntitlementError extends Error {
  readonly code: EntitlementErrorCode;
  readonly featureKey: string;

  constructor(code: EntitlementErrorCode, message: string, featureKey: string) {
    super(message);
    this.code = code;
    this.featureKey = featureKey;
  }
}

export class EntitlementService {
  private readonly store: EntitlementStore;

  constructor(store: EntitlementStore = new DrizzleEntitlementStore()) {
    this.store = store;
  }

  async can(userId: string, featureKey: string, context: EntitlementContext = {}): Promise<EntitlementCheckResult> {
    const registry = await this.store.findRegistryFeature(featureKey);
    const scopeType = context.scopeType ?? registry?.scopeType ?? 'platform';
    const scopeId = context.scopeId ?? null;
    const now = context.now ?? new Date();

    const subscriptionFeature = await this.store.findActiveSubscriptionFeature({ userId, featureKey, scopeType, scopeId, now });
    if (subscriptionFeature) {
      const value = featureValue(subscriptionFeature);
      return { allowed: isAllowed(value), featureKey, value };
    }

    const entitlement = await this.store.findActiveEntitlement({ userId, featureKey, scopeType, scopeId, now });
    if (entitlement) {
      const value = entitlement.feature ? featureValue(entitlement.feature) : registry ? registryValue(registry) : true;
      return { allowed: isAllowed(value), featureKey, value };
    }

    if (featureKey === 'reader_club_access') {
      return { allowed: false, featureKey, value: false, code: 'READER_CLUB_ACCESS_REQUIRED' };
    }

    if (!registry) {
      return { allowed: false, featureKey, value: null, code: 'MISSING_ENTITLEMENT' };
    }

    const value = registryValue(registry);
    return { allowed: isAllowed(value), featureKey, value, code: isAllowed(value) ? undefined : 'MISSING_ENTITLEMENT' };
  }

  async assertCan(userId: string, featureKey: string, context: EntitlementContext = {}) {
    const result = await this.can(userId, featureKey, context);
    if (!result.allowed) throw new EntitlementError(result.code ?? 'MISSING_ENTITLEMENT', 'Доступ к функции недоступен', featureKey);
  }

  async getLimit(userId: string, featureKey: string, context: EntitlementContext = {}) {
    const result = await this.can(userId, featureKey, context);
    return typeof result.value === 'number' ? result.value : null;
  }

  async assertLimit(userId: string, featureKey: string, used: number, context: EntitlementContext = {}) {
    const limit = await this.getLimit(userId, featureKey, context);
    if (limit !== null && used >= limit) throw new EntitlementError('LIMIT_EXCEEDED', 'Лимит тарифа исчерпан', featureKey);
  }
}

function isAllowed(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return value !== null && value !== undefined;
}

function featureValue(feature: FeatureSource) {
  if (feature.valueType === 'integer') return feature.valueInt;
  if (feature.valueType === 'string') return feature.valueText;
  if (feature.valueType === 'json') return feature.valueJson;
  return feature.valueBool ?? true;
}

function registryValue(feature: RegistrySource) {
  if (feature.valueType === 'integer') return feature.defaultInt;
  if (feature.valueType === 'string') return feature.defaultText;
  if (feature.valueType === 'json') return feature.defaultJson;
  return feature.defaultBool ?? false;
}

class DrizzleEntitlementStore implements EntitlementStore {
  private async db() {
    return (await import('../../db.js')).db;
  }

  private async schema() {
    return import('../../../shared/schema.js');
  }

  async findActiveEntitlement(input: { userId: string; featureKey: string; scopeType: CommerceScopeType; scopeId: string | null; now: Date }) {
    const db = await this.db();
    const { commerceEntitlements } = await this.schema();
    const { commerceOrders, commercePayments, commerceProductFeatures } = await this.schema();
    const rows = await db.select({ entitlement: commerceEntitlements, directFeature: commerceProductFeatures }).from(commerceEntitlements)
      .leftJoin(commerceProductFeatures, and(
        eq(commerceProductFeatures.featureKey, commerceEntitlements.featureKey),
        eq(commerceProductFeatures.productId, commerceEntitlements.sourceId),
        eq(commerceProductFeatures.isActive, true),
      ))
      .where(and(
        eq(commerceEntitlements.userId, input.userId),
        eq(commerceEntitlements.featureKey, input.featureKey),
        eq(commerceEntitlements.scopeType, input.scopeType),
        input.scopeId ? eq(commerceEntitlements.scopeId, input.scopeId) : isNull(commerceEntitlements.scopeId),
        eq(commerceEntitlements.status, 'active'),
        or(isNull(commerceEntitlements.endsAt), gt(commerceEntitlements.endsAt, input.now)),
      ))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.directFeature) return { feature: row.directFeature };

    if (row.entitlement.sourceType === 'payment' && row.entitlement.sourceId) {
      const paymentRows = await db.select({ feature: commerceProductFeatures }).from(commercePayments)
        .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
        .innerJoin(commerceProductFeatures, and(
          eq(commerceProductFeatures.productId, commerceOrders.productId),
          eq(commerceProductFeatures.featureKey, input.featureKey),
          eq(commerceProductFeatures.isActive, true),
        ))
        .where(or(eq(commercePayments.id, row.entitlement.sourceId), eq(commerceOrders.id, row.entitlement.sourceId)))
        .limit(1);
      if (paymentRows[0]?.feature) return { feature: paymentRows[0].feature };

      const orderRows = await db.select({ feature: commerceProductFeatures }).from(commerceOrders)
        .innerJoin(commerceProductFeatures, and(
          eq(commerceProductFeatures.productId, commerceOrders.productId),
          eq(commerceProductFeatures.featureKey, input.featureKey),
          eq(commerceProductFeatures.isActive, true),
        ))
        .where(eq(commerceOrders.id, row.entitlement.sourceId))
        .limit(1);
      return { feature: orderRows[0]?.feature ?? null };
    }

    return { feature: null };
  }

  async findActiveSubscriptionFeature(input: { userId: string; featureKey: string; scopeType: CommerceScopeType; scopeId: string | null; now: Date }) {
    const db = await this.db();
    const { commercePrices, commerceProductFeatures, commerceProducts, commerceSubscriptions } = await this.schema();
    const rows = await db.select({ feature: commerceProductFeatures }).from(commerceSubscriptions)
      .innerJoin(commerceProducts, eq(commerceProducts.id, commerceSubscriptions.productId))
      .innerJoin(commercePrices, eq(commercePrices.id, commerceSubscriptions.priceId))
      .innerJoin(commerceProductFeatures, eq(commerceProductFeatures.productId, commerceProducts.id))
      .where(and(
        eq(commerceSubscriptions.userId, input.userId),
        eq(commerceSubscriptions.status, 'active'),
        or(isNull(commerceSubscriptions.currentPeriodEnd), gt(commerceSubscriptions.currentPeriodEnd, input.now), gt(commerceSubscriptions.graceUntil, input.now)),
        eq(commerceProducts.scopeType, input.scopeType),
        input.scopeId ? eq(commerceProducts.scopeId, input.scopeId) : isNull(commerceProducts.scopeId),
        eq(commerceProductFeatures.featureKey, input.featureKey),
        eq(commerceProductFeatures.isActive, true),
      ))
      .limit(1);
    return rows[0]?.feature ?? null;
  }

  async findRegistryFeature(featureKey: string) {
    const db = await this.db();
    const { commerceFeatureRegistry } = await this.schema();
    const rows = await db.select().from(commerceFeatureRegistry)
      .where(and(eq(commerceFeatureRegistry.key, featureKey), eq(commerceFeatureRegistry.isActive, true)))
      .limit(1);
    return rows[0] ?? null;
  }
}
