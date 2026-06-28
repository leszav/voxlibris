import { and, count, desc, eq, gte, lte, ilike } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository.js';
import {
  clubMembers,
  commerceEntitlementActions,
  commerceEntitlements,
  commerceFeatureRegistry,
  commerceLedgerEntries,
  commerceOrders,
  commercePaymentEvents,
  commercePayments,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  commerceSubscriptions,
  paymentProviders,
  readerClubTariffAssignments,
  users,
  type CommerceEntitlementActionType,
  type InsertCommerceFeatureRegistryItem,
  type InsertCommercePrice,
  type InsertCommerceProduct,
  type InsertCommerceProductFeature,
} from '../../shared/schema.js';

type AuditListFilter = { status?: string; limit?: number; offset?: number };
type OrderAuditListFilter = AuditListFilter & { userId?: string; productId?: string; dateFrom?: Date; dateTo?: Date };
type PaymentAuditListFilter = AuditListFilter & { providerId?: string; providerPaymentId?: string; dateFrom?: Date; dateTo?: Date };
type LedgerAuditListFilter = AuditListFilter & { paymentId?: string; orderId?: string; clubId?: string; readerUserId?: string; entryType?: string };
type SubscriptionListFilter = AuditListFilter & { entitlementId?: string; userId?: string; productId?: string; period?: string; search?: string };

function auditLimit(limit?: number) {
  return Math.min(Math.max(limit ?? 100, 1), 200);
}

function auditOffset(offset?: number) {
  return Math.max(offset ?? 0, 0);
}

function safePayment(payment: typeof commercePayments.$inferSelect) {
  const { paymentMethodToken: _hidden, ...safe } = payment;
  return { ...safe, amountUnit: 'rub' as const };
}

function ledgerAmountSum(ledger: Array<typeof commerceLedgerEntries.$inferSelect>) {
  return ledger.reduce((total, entry) => total + entry.amountKopecks, 0);
}

export class CommerceRepository extends BaseRepository {
  listFeatureRegistry() {
    return this.db.select().from(commerceFeatureRegistry).orderBy(commerceFeatureRegistry.category, commerceFeatureRegistry.key);
  }

  async upsertFeatureRegistry(input: InsertCommerceFeatureRegistryItem) {
    const [feature] = await this.db.insert(commerceFeatureRegistry).values(input).onConflictDoUpdate({
      target: commerceFeatureRegistry.key,
      set: { ...input, updatedAt: new Date() },
    }).returning();
    return feature;
  }

  async updateFeatureRegistry(key: string, input: Partial<Omit<InsertCommerceFeatureRegistryItem, 'key'>>) {
    const [feature] = await this.db.update(commerceFeatureRegistry).set({ ...input, updatedAt: new Date() }).where(eq(commerceFeatureRegistry.key, key)).returning();
    return feature;
  }

  listProducts() {
    return this.db.select().from(commerceProducts).orderBy(commerceProducts.sortOrder, commerceProducts.createdAt);
  }

  async createProduct(input: InsertCommerceProduct & { prices?: Array<Omit<InsertCommercePrice, 'productId'>>; features?: Array<Omit<InsertCommerceProductFeature, 'productId'>> }) {
    const { prices = [], features = [], ...productInput } = input;
    return this.db.transaction(async (tx) => {
      const [product] = await tx.insert(commerceProducts).values(productInput).returning();
      if (prices.length > 0) await tx.insert(commercePrices).values(prices.map((price) => ({ ...price, productId: product.id })));
      if (features.length > 0) await tx.insert(commerceProductFeatures).values(features.map((feature) => ({ ...feature, productId: product.id })));
      return product;
    });
  }

  async getProductDetails(id: string) {
    const [product] = await this.db.select().from(commerceProducts).where(eq(commerceProducts.id, id)).limit(1);
    if (!product) return null;
    const [prices, features] = await Promise.all([
      this.db.select().from(commercePrices).where(eq(commercePrices.productId, product.id)).orderBy(commercePrices.amountRub),
      this.db.select().from(commerceProductFeatures).where(eq(commerceProductFeatures.productId, product.id)).orderBy(commerceProductFeatures.sortOrder),
    ]);
    return { ...product, prices, features };
  }

  async updateProduct(id: string, input: Partial<InsertCommerceProduct>) {
    const [product] = await this.db.update(commerceProducts).set({ ...input, updatedAt: new Date() }).where(eq(commerceProducts.id, id)).returning();
    return product;
  }

  async deleteArchivedProduct(id: string) {
    const [product] = await this.db.delete(commerceProducts)
      .where(and(eq(commerceProducts.id, id), eq(commerceProducts.status, 'archived')))
      .returning();
    return product;
  }

  async archivedProductDeleteBlockers(id: string) {
    const [[orders], [subscriptions], [ledger], [assignments], [entitlements]] = await Promise.all([
      this.db.select({ total: count() }).from(commerceOrders).where(eq(commerceOrders.productId, id)),
      this.db.select({ total: count() }).from(commerceSubscriptions).where(eq(commerceSubscriptions.productId, id)),
      this.db.select({ total: count() }).from(commerceLedgerEntries).where(eq(commerceLedgerEntries.productId, id)),
      this.db.select({ total: count() }).from(readerClubTariffAssignments).where(eq(readerClubTariffAssignments.productId, id)),
      this.db.select({ total: count() }).from(commerceEntitlements).where(eq(commerceEntitlements.sourceId, id)),
    ]);
    return {
      orders: orders.total,
      subscriptions: subscriptions.total,
      ledgerEntries: ledger.total,
      readerClubTariffAssignments: assignments.total,
      entitlements: entitlements.total,
    };
  }

  async productExists(id: string) {
    const [product] = await this.db.select({ id: commerceProducts.id }).from(commerceProducts).where(eq(commerceProducts.id, id)).limit(1);
    return Boolean(product);
  }

  async createPrice(productId: string, input: Omit<InsertCommercePrice, 'productId'>) {
    const [price] = await this.db.insert(commercePrices).values({ ...input, productId }).returning();
    return price;
  }

  async updatePrice(id: string, input: Partial<InsertCommercePrice>) {
    const [price] = await this.db.update(commercePrices).set({ ...input, updatedAt: new Date() }).where(eq(commercePrices.id, id)).returning();
    return price;
  }

  async createProductFeature(productId: string, input: Omit<InsertCommerceProductFeature, 'productId'>) {
    const [feature] = await this.db.insert(commerceProductFeatures).values({ ...input, productId }).returning();
    return feature;
  }

  async updateProductFeature(id: string, input: Partial<InsertCommerceProductFeature>) {
    const [feature] = await this.db.update(commerceProductFeatures).set({ ...input, updatedAt: new Date() }).where(eq(commerceProductFeatures.id, id)).returning();
    return feature;
  }

  async deleteProductFeature(id: string) {
    const [feature] = await this.db.delete(commerceProductFeatures).where(eq(commerceProductFeatures.id, id)).returning();
    return feature;
  }

  async listSubscriptions(filter: SubscriptionListFilter = {}) {
    const conditions = [
      filter.entitlementId ? eq(commerceEntitlements.id, filter.entitlementId) : undefined,
      filter.status ? eq(commerceEntitlements.status, filter.status as typeof commerceEntitlements.$inferSelect.status) : undefined,
      filter.userId ? eq(commerceEntitlements.userId, filter.userId) : undefined,
      filter.productId ? eq(commerceOrders.productId, filter.productId) : undefined,
      filter.period ? eq(commercePrices.period, filter.period as typeof commercePrices.$inferSelect.period) : undefined,
      filter.search ? ilike(users.email, `%${filter.search}%`) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRow] = await this.db.select({ total: count() })
      .from(commerceEntitlements)
      .leftJoin(users, eq(users.id, commerceEntitlements.userId))
      .leftJoin(commercePayments, eq(commercePayments.id, commerceEntitlements.sourceId))
      .leftJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
      .leftJoin(commercePrices, eq(commercePrices.id, commerceOrders.priceId))
      .where(where);

    const items = await this.db.select({
      entitlement: commerceEntitlements,
      user: { id: users.id, username: users.username, email: users.email },
      product: { id: commerceProducts.id, title: commerceProducts.title, type: commerceProducts.type, scopeType: commerceProducts.scopeType, scopeId: commerceProducts.scopeId },
      price: { id: commercePrices.id, amountRub: commercePrices.amountRub, period: commercePrices.period },
      order: { id: commerceOrders.id, status: commerceOrders.status },
      payment: { id: commercePayments.id, providerPaymentId: commercePayments.providerPaymentId, status: commercePayments.status, fiscalReceiptUrl: commercePayments.fiscalReceiptUrl },
    })
      .from(commerceEntitlements)
      .leftJoin(users, eq(users.id, commerceEntitlements.userId))
      .leftJoin(commercePayments, eq(commercePayments.id, commerceEntitlements.sourceId))
      .leftJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
      .leftJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
      .leftJoin(commercePrices, eq(commercePrices.id, commerceOrders.priceId))
      .where(where)
      .orderBy(desc(commerceEntitlements.createdAt))
      .limit(auditLimit(filter.limit))
      .offset(auditOffset(filter.offset));

    return { items, total: totalRow?.total ?? 0 };
  }

  async updateSubscriptionAction(input: { entitlementId: string; adminUserId: string; actionType: CommerceEntitlementActionType; reason: string }) {
    return this.db.transaction(async (tx) => {
      const [entitlement] = await tx.select().from(commerceEntitlements).where(eq(commerceEntitlements.id, input.entitlementId)).limit(1);
      if (!entitlement) return null;
      if (input.actionType === 'restore' && !['revoked', 'deleted'].includes(entitlement.status)) return { conflict: true as const, entitlement };
      if (input.actionType === 'delete_revoked' && entitlement.status !== 'revoked') return { conflict: true as const, entitlement };
      if (['revoke_now', 'cancel_at_period_end'].includes(input.actionType) && entitlement.status !== 'active') return { conflict: true as const, entitlement };
      if (input.actionType === 'cancel_at_period_end' && !entitlement.endsAt) return { conflict: true as const, entitlement };
      if (input.actionType === 'cancel_at_period_end' && entitlement.renewalStatus === 'cancel_at_period_end') return { conflict: true as const, entitlement };

      const now = new Date();
      const newEndsAt = input.actionType === 'revoke_now' ? now : entitlement.endsAt;
      const newStatus = input.actionType === 'restore' ? 'active' : input.actionType === 'delete_revoked' ? 'deleted' : input.actionType === 'revoke_now' ? 'revoked' : 'active';
      const renewalStatus = input.actionType === 'cancel_at_period_end' ? 'cancel_at_period_end' : input.actionType === 'restore' ? 'active' : entitlement.renewalStatus;
      const renewalCancelledAt = input.actionType === 'cancel_at_period_end' ? now : input.actionType === 'restore' ? null : entitlement.renewalCancelledAt;
      const [updated] = await tx.update(commerceEntitlements).set({
        status: newStatus,
        renewalStatus,
        renewalCancelledAt,
        endsAt: newEndsAt,
        updatedAt: now,
      }).where(eq(commerceEntitlements.id, input.entitlementId)).returning();

      const [action] = await tx.insert(commerceEntitlementActions).values({
        entitlementId: entitlement.id,
        userId: entitlement.userId,
        adminUserId: input.adminUserId,
        actionType: input.actionType,
        reason: input.reason,
        previousStatus: entitlement.status,
        newStatus: updated.status,
        previousEndsAt: entitlement.endsAt,
        newEndsAt: updated.endsAt,
      }).returning();
      return { entitlement: updated, action };
    });
  }

  listOrders(filter: OrderAuditListFilter = {}) {
    const conditions = [
      filter.status ? eq(commerceOrders.status, filter.status as typeof commerceOrders.$inferSelect.status) : undefined,
      filter.userId ? eq(commerceOrders.userId, filter.userId) : undefined,
      filter.productId ? eq(commerceOrders.productId, filter.productId) : undefined,
      filter.dateFrom ? gte(commerceOrders.createdAt, filter.dateFrom) : undefined,
      filter.dateTo ? lte(commerceOrders.createdAt, filter.dateTo) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
    return this.db.select().from(commerceOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(commerceOrders.createdAt))
      .limit(auditLimit(filter.limit));
  }

  async getOrderAudit(id: string) {
    const [order] = await this.db.select().from(commerceOrders).where(eq(commerceOrders.id, id)).limit(1);
    if (!order) return null;
    const [product, price, payments, entitlements, ledger] = await Promise.all([
      this.db.select().from(commerceProducts).where(eq(commerceProducts.id, order.productId)).limit(1),
      this.db.select().from(commercePrices).where(eq(commercePrices.id, order.priceId)).limit(1),
      this.db.select().from(commercePayments).where(eq(commercePayments.orderId, id)).orderBy(desc(commercePayments.createdAt)),
      this.db.select().from(commerceEntitlements).where(eq(commerceEntitlements.userId, order.userId)).orderBy(desc(commerceEntitlements.createdAt)),
      this.db.select().from(commerceLedgerEntries).where(eq(commerceLedgerEntries.orderId, id)).orderBy(desc(commerceLedgerEntries.createdAt)),
    ]);
    return { order: { ...order, amountUnit: 'rub' as const }, product: product[0] ?? null, price: price[0] ?? null, payments: payments.map(safePayment), entitlements, ledger: ledger.map((entry) => ({ ...entry, amountUnit: 'kopecks' as const })) };
  }

  listPayments(filter: PaymentAuditListFilter = {}) {
    const conditions = [
      filter.status ? eq(commercePayments.status, filter.status as typeof commercePayments.$inferSelect.status) : undefined,
      filter.providerId ? eq(commercePayments.providerId, filter.providerId) : undefined,
      filter.providerPaymentId ? eq(commercePayments.providerPaymentId, filter.providerPaymentId) : undefined,
      filter.dateFrom ? gte(commercePayments.createdAt, filter.dateFrom) : undefined,
      filter.dateTo ? lte(commercePayments.createdAt, filter.dateTo) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
    return this.db.select().from(commercePayments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(commercePayments.createdAt))
      .limit(auditLimit(filter.limit))
      .then((items) => items.map(safePayment));
  }

  async getPaymentAudit(id: string) {
    const [payment] = await this.db.select().from(commercePayments).where(eq(commercePayments.id, id)).limit(1);
    if (!payment) return null;
    return this.paymentAuditChain(payment);
  }

  listPaymentEvents(filter: PaymentAuditListFilter = {}) {
    const conditions = [
      filter.status ? eq(commercePaymentEvents.status, filter.status as typeof commercePaymentEvents.$inferSelect.status) : undefined,
      filter.providerPaymentId ? eq(commercePaymentEvents.providerPaymentId, filter.providerPaymentId) : undefined,
      filter.dateFrom ? gte(commercePaymentEvents.receivedAt, filter.dateFrom) : undefined,
      filter.dateTo ? lte(commercePaymentEvents.receivedAt, filter.dateTo) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
    return this.db.select().from(commercePaymentEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(commercePaymentEvents.receivedAt))
      .limit(auditLimit(filter.limit));
  }

  listLedgerEntries(filter: LedgerAuditListFilter = {}) {
    const conditions = [
      filter.status ? eq(commerceLedgerEntries.status, filter.status as typeof commerceLedgerEntries.$inferSelect.status) : undefined,
      filter.paymentId ? eq(commerceLedgerEntries.paymentId, filter.paymentId) : undefined,
      filter.orderId ? eq(commerceLedgerEntries.orderId, filter.orderId) : undefined,
      filter.clubId ? eq(commerceLedgerEntries.clubId, filter.clubId) : undefined,
      filter.readerUserId ? eq(commerceLedgerEntries.readerUserId, filter.readerUserId) : undefined,
      filter.entryType ? eq(commerceLedgerEntries.entryType, filter.entryType as typeof commerceLedgerEntries.$inferSelect.entryType) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
    return this.db.select().from(commerceLedgerEntries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(commerceLedgerEntries.createdAt))
      .limit(auditLimit(filter.limit))
      .then((items) => items.map((entry) => ({ ...entry, amountUnit: 'kopecks' as const })));
  }

  async getPaymentAuditChain(paymentId: string) {
    const [payment] = await this.db.select().from(commercePayments).where(eq(commercePayments.id, paymentId)).limit(1);
    if (!payment) return null;
    return this.paymentAuditChain(payment);
  }

  private async paymentAuditChain(payment: typeof commercePayments.$inferSelect) {
    const [order] = await this.db.select().from(commerceOrders).where(eq(commerceOrders.id, payment.orderId)).limit(1);
    const [provider] = payment.providerId ? await this.db.select({ id: paymentProviders.id, code: paymentProviders.code, name: paymentProviders.name, status: paymentProviders.status }).from(paymentProviders).where(eq(paymentProviders.id, payment.providerId)).limit(1) : [null];
    const [events, entitlements, ledger, tariffAssignments, memberships] = await Promise.all([
      payment.providerPaymentId ? this.db.select().from(commercePaymentEvents).where(eq(commercePaymentEvents.providerPaymentId, payment.providerPaymentId)).orderBy(desc(commercePaymentEvents.receivedAt)) : Promise.resolve([]),
      this.db.select().from(commerceEntitlements).where(eq(commerceEntitlements.sourceId, payment.id)).orderBy(desc(commerceEntitlements.createdAt)),
      this.db.select().from(commerceLedgerEntries).where(eq(commerceLedgerEntries.paymentId, payment.id)).orderBy(desc(commerceLedgerEntries.createdAt)),
      order ? this.db.select().from(readerClubTariffAssignments).where(eq(readerClubTariffAssignments.productId, order.productId)).orderBy(desc(readerClubTariffAssignments.createdAt)) : Promise.resolve([]),
      order ? this.db.select().from(clubMembers).where(and(eq(clubMembers.userId, order.userId), eq(clubMembers.isActive, true))).orderBy(desc(clubMembers.joinedAt)) : Promise.resolve([]),
    ]);
    const expectedKopecks = payment.amountRub * 100;
    const actualKopecks = ledgerAmountSum(ledger);
    return {
      payment: safePayment(payment),
      provider,
      order: order ? { ...order, amountUnit: 'rub' as const } : null,
      events,
      entitlements,
      tariffAssignments,
      memberships,
      ledger: ledger.map((entry) => ({ ...entry, amountUnit: 'kopecks' as const })),
      diagnostics: {
        hasOrder: Boolean(order),
        hasProvider: Boolean(provider),
        hasProviderEvent: events.length > 0,
        hasEntitlement: entitlements.length > 0,
        hasMembershipOrGrant: memberships.length > 0 || entitlements.some((item) => item.sourceType === 'admin_grant' || item.sourceType === 'promo'),
        hasLedgerEntries: ledger.length > 0,
        ledgerAmountKopecks: actualKopecks,
        paymentAmountKopecks: expectedKopecks,
        ledgerAmountMatchesPayment: ledger.length === 0 ? null : actualKopecks === expectedKopecks,
      },
    };
  }
}
