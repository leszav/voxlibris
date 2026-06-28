import express from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { jwtAuth, requireAdmin } from '../jwt-middleware.js';
import { AdminCommerceService } from '../services/commerce/admin-commerce-service.js';
import { CommerceService, financialDashboard, PaymentGatewayService, PaymentNotificationProcessorService } from '../services/monetization.js';
import { commerceEntitlements, commerceOrders, commercePayments, commercePrices, commerceProductFeatures, commerceProducts, readerClubTariffAssignments, readerClubTariffRequests, readerClubTariffTemplates, type PaymentProviderCode } from '../../shared/schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';

const router = express.Router();

function modalDismissed(metadata: unknown) {
  return Boolean(metadata && typeof metadata === 'object' && 'subscriptionModalDismissedAt' in metadata);
}

const productSchema = z.object({
  type: z.enum(['platform_subscription', 'club_subscription', 'reader_club_subscription', 'ticket', 'recording_access', 'donation']),
  scopeType: z.enum(['platform', 'club', 'reader_club', 'session', 'recording', 'reader']),
  scopeId: z.string().optional().nullable(),
  code: z.string().min(1).max(100),
  title: z.string().min(1).max(180),
  description: z.string().optional().nullable(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  visibility: z.enum(['public', 'private']).default('private'),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
  prices: z.array(z.object({ amountRub: z.number().int().min(0), period: z.enum(['one_time', 'week', 'month', 'quarter', 'year']), isDefault: z.boolean().default(false) })).default([]),
  features: z.array(z.object({
    label: z.string().min(1),
    featureKey: z.string().min(1).max(120),
    valueType: z.enum(['boolean', 'integer', 'string', 'json']).default('boolean'),
    valueBool: z.boolean().optional().nullable(),
    valueInt: z.number().int().optional().nullable(),
    valueText: z.string().optional().nullable(),
    valueJson: z.unknown().optional().nullable(),
    resetPeriod: z.enum(['day', 'week', 'month', 'year']).optional().nullable(),
    sortOrder: z.number().int().default(0),
    isHighlighted: z.boolean().default(false),
  })).default([]),
});

const providerSchema = z.object({
  code: z.literal('yookassa'),
  name: z.string().min(1).max(120),
  credentials: z.record(z.string(), z.string()),
  status: z.enum(['active', 'inactive']).optional(),
  priority: z.number().int().optional(),
});

const productsQuerySchema = z.object({
  type: z.enum(['platform_subscription', 'club_subscription', 'reader_club_subscription', 'ticket', 'recording_access', 'donation']).optional(),
  scopeType: z.enum(['platform', 'club', 'reader_club', 'session', 'recording', 'reader']).optional(),
  scopeId: z.string().optional(),
});

const featureRegistrySchema = z.object({
  key: z.string().min(1).max(120),
  title: z.string().min(1).max(180),
  description: z.string().optional().nullable(),
  category: z.string().min(1).max(60),
  scopeType: z.enum(['platform', 'club', 'reader_club', 'session', 'recording', 'reader']),
  valueType: z.enum(['boolean', 'integer', 'string', 'json']).default('boolean'),
  defaultBool: z.boolean().optional().nullable(),
  defaultInt: z.number().int().optional().nullable(),
  defaultText: z.string().optional().nullable(),
  defaultJson: z.unknown().optional().nullable(),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

const priceSchema = z.object({
  amountRub: z.number().int().min(0),
  period: z.enum(['one_time', 'week', 'month', 'quarter', 'year']),
  status: z.enum(['active', 'archived']).default('active'),
  isDefault: z.boolean().default(false),
});

const productFeatureSchema = z.object({
  label: z.string().min(1),
  featureKey: z.string().min(1).max(120),
  valueType: z.enum(['boolean', 'integer', 'string', 'json']).default('boolean'),
  valueBool: z.boolean().optional().nullable(),
  valueInt: z.number().int().optional().nullable(),
  valueText: z.string().optional().nullable(),
  valueJson: z.unknown().optional().nullable(),
  resetPeriod: z.enum(['day', 'week', 'month', 'year']).optional().nullable(),
  sortOrder: z.number().int().default(0),
  isHighlighted: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const grantSchema = z.object({
  userId: z.string().min(1),
  productId: z.string().min(1),
  sourceType: z.enum(['promo', 'admin_grant']).default('admin_grant'),
});

const auditListQuerySchema = z.object({
  status: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  providerPaymentId: z.string().min(1).optional(),
  paymentId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  clubId: z.string().min(1).optional(),
  readerUserId: z.string().min(1).optional(),
  entryType: z.string().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const subscriptionListQuerySchema = auditListQuerySchema.extend({
  period: z.enum(['one_time', 'week', 'month', 'quarter', 'year']).optional(),
  search: z.string().min(1).max(120).optional(),
});

const subscriptionActionSchema = z.object({
  actionType: z.enum(['revoke_now', 'cancel_at_period_end', 'restore', 'delete_revoked']),
  reason: z.string().trim().min(3).max(1000),
});

const readerClubTariffTemplateSchema = z.object({
  title: z.string().min(1).max(180),
  description: z.string().optional().nullable(),
  amountRub: z.number().int().positive(),
  period: z.enum(['week', 'month', 'quarter', 'year']),
  readerShareBps: z.number().int().min(0).max(10000),
  acquiringFeeBps: z.number().int().min(0).max(10000).default(0),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  visibility: z.enum(['public', 'private']).default('private'),
  sortOrder: z.number().int().default(0),
});

const tariffRequestReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  readerShareBps: z.number().int().min(0).max(10000).default(7000),
  acquiringFeeBps: z.number().int().min(0).max(10000).default(350),
  reviewComment: z.string().optional().nullable(),
});

router.get('/plans', async (_req, res) => {
  res.json(await new CommerceService().listPublicPlatformProducts());
});

router.get('/products', async (req, res) => {
  const query = productsQuerySchema.parse(req.query);
  res.json(await new CommerceService().listPublicProducts(query));
});

router.post('/checkout', jwtAuth, async (req, res, next) => {
  try {
    const { productId, priceId } = z.object({ productId: z.string().min(1), priceId: z.string().min(1).optional() }).parse(req.body);
    res.json(await new CommerceService().createCheckout(req.user!.userId, productId, priceId));
  } catch (error) { next(error); }
});

router.get('/payments/:providerPaymentId/summary', jwtAuth, async (req, res) => {
  const [row] = await db.select({
    paymentId: commercePayments.id,
    providerPaymentId: commercePayments.providerPaymentId,
    paymentStatus: commercePayments.status,
    receiptUrl: commercePayments.fiscalReceiptUrl,
    orderStatus: commerceOrders.status,
    productTitle: commerceProducts.title,
    amountRub: commercePrices.amountRub,
    period: commercePrices.period,
    metadata: commercePayments.metadata,
  })
    .from(commercePayments)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .innerJoin(commercePrices, eq(commercePrices.id, commerceOrders.priceId))
    .where(and(eq(commercePayments.providerPaymentId, req.params.providerPaymentId), eq(commerceOrders.userId, req.user!.userId)))
    .limit(1);
  if (!row) return res.status(404).json({ message: 'Платёж не найден' });
  return res.json({ ...row, subscriptionModalDismissed: modalDismissed(row.metadata), metadata: undefined });
});

router.post('/payments/:providerPaymentId/dismiss-subscription-modal', jwtAuth, async (req, res) => {
  const [row] = await db.select({ paymentId: commercePayments.id })
    .from(commercePayments)
    .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .where(and(eq(commercePayments.providerPaymentId, req.params.providerPaymentId), eq(commerceOrders.userId, req.user!.userId)))
    .limit(1);
  if (!row) return res.status(404).json({ message: 'Платёж не найден' });
  await db.update(commercePayments)
    .set({ metadata: sql`jsonb_set(${commercePayments.metadata}, '{subscriptionModalDismissedAt}', to_jsonb(now()::text), true)` })
    .where(eq(commercePayments.id, row.paymentId));
  return res.json({ ok: true });
});

router.get('/me/subscriptions', jwtAuth, async (req, res) => {
  const rows = await db.select({
    entitlementId: commerceEntitlements.id,
    featureKey: commerceEntitlements.featureKey,
    status: commerceEntitlements.status,
    renewalStatus: commerceEntitlements.renewalStatus,
    renewalCancelledAt: commerceEntitlements.renewalCancelledAt,
    startsAt: commerceEntitlements.startsAt,
    endsAt: commerceEntitlements.endsAt,
    paymentId: commercePayments.id,
    providerPaymentId: commercePayments.providerPaymentId,
    receiptUrl: commercePayments.fiscalReceiptUrl,
    productTitle: commerceProducts.title,
    amountRub: commercePrices.amountRub,
    period: commercePrices.period,
  })
    .from(commerceEntitlements)
    .innerJoin(commercePayments, eq(commercePayments.id, commerceEntitlements.sourceId))
    .innerJoin(commerceOrders, eq(commerceOrders.id, commercePayments.orderId))
    .innerJoin(commerceProducts, eq(commerceProducts.id, commerceOrders.productId))
    .innerJoin(commercePrices, eq(commercePrices.id, commerceOrders.priceId))
    .where(and(
      eq(commerceEntitlements.userId, req.user!.userId),
      eq(commerceEntitlements.scopeType, 'platform'),
      eq(commerceEntitlements.sourceType, 'payment'),
      eq(commerceEntitlements.status, 'active'),
    ))
    .orderBy(desc(commerceEntitlements.createdAt));
  res.json(rows);
});

router.post('/me/subscriptions/:entitlementId/cancel', jwtAuth, async (req, res) => {
  const [entitlement] = await db.select({ id: commerceEntitlements.id })
    .from(commerceEntitlements)
    .where(and(
      eq(commerceEntitlements.id, req.params.entitlementId),
      eq(commerceEntitlements.userId, req.user!.userId),
      eq(commerceEntitlements.scopeType, 'platform'),
      eq(commerceEntitlements.sourceType, 'payment'),
      eq(commerceEntitlements.status, 'active'),
    ))
    .limit(1);
  if (!entitlement) return res.status(404).json({ message: 'Активная подписка не найдена' });
  const result = await new AdminCommerceService().manageSubscription({
    entitlementId: entitlement.id,
    adminUserId: req.user!.userId,
    actionType: 'cancel_at_period_end',
    reason: 'Пользователь отменил продление подписки',
    initiatedBy: 'user',
  });
  return res.json({ ok: true, result });
});

router.post('/webhooks/:provider', async (req, res, next) => {
  try {
    if (req.params.provider !== 'yookassa') return res.status(404).json({ message: 'Платёжный провайдер не поддерживается' });
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    await new PaymentNotificationProcessorService().process(req.params.provider as PaymentProviderCode, rawBody, req.body, req.headers);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/admin/features', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await new AdminCommerceService().listFeatures());
});

router.post('/admin/features', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await new AdminCommerceService().saveFeature(featureRegistrySchema.parse(req.body)));
  } catch (error) { next(error); }
});

router.patch('/admin/features/:key', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().updateFeature(req.params.key, featureRegistrySchema.partial().omit({ key: true }).parse(req.body)));
  } catch (error) { next(error); }
});

router.get('/admin/products', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await new AdminCommerceService().listProducts());
});

router.post('/admin/products', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await new AdminCommerceService().createProduct(productSchema.parse(req.body)));
  } catch (error) { next(error); }
});

router.get('/admin/products/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().getProductDetails(req.params.id));
  } catch (error) { next(error); }
});

router.patch('/admin/products/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    const { prices: _prices, features: _features, ...payload } = productSchema.partial().parse(req.body);
    res.json(await new AdminCommerceService().updateProduct(req.params.id, payload));
  } catch (error) { next(error); }
});

router.delete('/admin/products/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().deleteArchivedProduct(req.params.id));
  } catch (error) { next(error); }
});

router.post('/admin/products/:id/prices', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await new AdminCommerceService().createPrice(req.params.id, priceSchema.parse(req.body)));
  } catch (error) { next(error); }
});

router.patch('/admin/prices/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().updatePrice(req.params.id, priceSchema.partial().parse(req.body)));
  } catch (error) { next(error); }
});

router.post('/admin/products/:id/features', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await new AdminCommerceService().createProductFeature(req.params.id, productFeatureSchema.parse(req.body)));
  } catch (error) { next(error); }
});

router.patch('/admin/product-features/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().updateProductFeature(req.params.id, productFeatureSchema.partial().parse(req.body)));
  } catch (error) { next(error); }
});

router.delete('/admin/product-features/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().deleteProductFeature(req.params.id));
  } catch (error) { next(error); }
});

router.get('/admin/reader-club-tariff-templates', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await db.select().from(readerClubTariffTemplates).orderBy(readerClubTariffTemplates.sortOrder, readerClubTariffTemplates.createdAt));
});

router.post('/admin/reader-club-tariff-templates', jwtAuth, requireAdmin, async (req, res) => {
  const payload = readerClubTariffTemplateSchema.parse(req.body);
  const [template] = await db.insert(readerClubTariffTemplates).values(payload).returning();
  res.status(201).json(template);
});

router.patch('/admin/reader-club-tariff-templates/:id', jwtAuth, requireAdmin, async (req, res) => {
  const payload = readerClubTariffTemplateSchema.partial().parse(req.body);
  const [template] = await db.update(readerClubTariffTemplates).set({ ...payload, updatedAt: new Date() }).where(eq(readerClubTariffTemplates.id, req.params.id)).returning();
  res.json(template);
});

router.get('/admin/reader-club-tariff-requests', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await db.select().from(readerClubTariffRequests).orderBy(desc(readerClubTariffRequests.createdAt)));
});

router.post('/admin/reader-club-tariff-requests/:id/review', jwtAuth, requireAdmin, async (req, res) => {
  const payload = tariffRequestReviewSchema.parse(req.body);
  const [tariffRequest] = await db.select().from(readerClubTariffRequests).where(eq(readerClubTariffRequests.id, req.params.id)).limit(1);
  if (!tariffRequest) return res.status(404).json({ message: 'Tariff request not found' });
  if (tariffRequest.status !== 'pending') return res.status(409).json({ message: 'Tariff request already reviewed' });

  if (payload.action === 'reject') {
    const [rejected] = await db.update(readerClubTariffRequests).set({
      status: 'rejected',
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      reviewComment: payload.reviewComment ?? null,
      updatedAt: new Date(),
    }).where(eq(readerClubTariffRequests.id, req.params.id)).returning();
    return res.json(rejected);
  }

  const result = await db.transaction(async (tx) => {
    await tx.update(readerClubTariffAssignments)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(and(eq(readerClubTariffAssignments.clubId, tariffRequest.clubId), eq(readerClubTariffAssignments.status, 'active')));

    const [product] = await tx.insert(commerceProducts).values({
      type: 'reader_club_subscription',
      scopeType: 'reader_club',
      scopeId: tariffRequest.clubId,
      code: `reader_club_custom_${tariffRequest.clubId}_${Date.now()}`,
      title: tariffRequest.title,
      description: tariffRequest.description,
      status: 'active',
      visibility: 'public',
      metadata: { tariffRequestId: tariffRequest.id },
    }).returning();
    await tx.insert(commercePrices).values({ productId: product.id, amountRub: tariffRequest.requestedAmountRub, period: tariffRequest.requestedPeriod, isDefault: true });
    await tx.insert(commerceProductFeatures).values({ productId: product.id, label: 'Доступ к клубу чтеца', featureKey: 'reader_club_access', valueType: 'boolean', valueBool: true, isHighlighted: true });
    const [assignment] = await tx.insert(readerClubTariffAssignments).values({
      clubId: tariffRequest.clubId,
      productId: product.id,
      selectedBy: tariffRequest.requestedBy,
      readerShareBps: payload.readerShareBps,
      acquiringFeeBps: payload.acquiringFeeBps,
    }).returning();
    const [approved] = await tx.update(readerClubTariffRequests).set({
      status: 'approved',
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      reviewComment: payload.reviewComment ?? null,
      updatedAt: new Date(),
    }).where(eq(readerClubTariffRequests.id, req.params.id)).returning();
    return { request: approved, assignment };
  });

  res.json(result);
});

router.get('/admin/providers', jwtAuth, requireAdmin, async (_req, res) => {
  const gateway = new PaymentGatewayService();
  const items = await gateway.listProviders();
  res.json(items.map(({ encryptedCredentials: _hidden, ...item }) => ({ ...item, credentials: gateway.safeCredentials({ ...item, encryptedCredentials: _hidden }) })));
});

router.post('/admin/providers', jwtAuth, requireAdmin, async (req, res) => {
  const [provider] = await new PaymentGatewayService().saveProvider(providerSchema.parse(req.body));
  const { encryptedCredentials: _hidden, ...safeProvider } = provider;
  res.status(201).json(safeProvider);
});

router.post('/admin/providers/:id/activate', jwtAuth, requireAdmin, async (req, res) => {
  const [provider] = await new PaymentGatewayService().setActive(req.params.id);
  const { encryptedCredentials: _hidden, ...safeProvider } = provider;
  res.json(safeProvider);
});

router.get('/admin/financial-dashboard', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await financialDashboard());
});

router.get('/admin/orders', jwtAuth, requireAdmin, async (req, res) => {
  const { status, userId, productId, dateFrom, dateTo, limit } = auditListQuerySchema.parse(req.query);
  res.json(await new AdminCommerceService().listOrders({ status, userId, productId, dateFrom, dateTo, limit }));
});

router.get('/admin/orders/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().getOrderAudit(req.params.id));
  } catch (error) { next(error); }
});

router.get('/admin/payments', jwtAuth, requireAdmin, async (req, res) => {
  const { status, providerId, providerPaymentId, dateFrom, dateTo, limit } = auditListQuerySchema.parse(req.query);
  res.json(await new AdminCommerceService().listPayments({ status, providerId, providerPaymentId, dateFrom, dateTo, limit }));
});

router.get('/admin/payments/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().getPaymentAudit(req.params.id));
  } catch (error) { next(error); }
});

router.get('/admin/payment-events', jwtAuth, requireAdmin, async (req, res) => {
  const { status, providerPaymentId, dateFrom, dateTo, limit } = auditListQuerySchema.parse(req.query);
  res.json(await new AdminCommerceService().listPaymentEvents({ status, providerPaymentId, dateFrom, dateTo, limit }));
});

router.get('/admin/ledger', jwtAuth, requireAdmin, async (req, res) => {
  const { status, paymentId, orderId, clubId, readerUserId, entryType, limit } = auditListQuerySchema.parse(req.query);
  res.json(await new AdminCommerceService().listLedgerEntries({ status, paymentId, orderId, clubId, readerUserId, entryType, limit }));
});

router.get('/admin/audit-chain/:paymentId', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new AdminCommerceService().getPaymentAuditChain(req.params.paymentId));
  } catch (error) { next(error); }
});

router.get('/admin/subscriptions', jwtAuth, requireAdmin, async (req, res) => {
  const { status, userId, productId, period, search, limit, offset } = subscriptionListQuerySchema.parse(req.query);
  res.json(await new AdminCommerceService().listSubscriptions({ status, userId, productId, period, search, limit, offset }));
});

router.post('/admin/subscriptions/:entitlementId/action', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = subscriptionActionSchema.parse(req.body);
    res.json(await new AdminCommerceService().manageSubscription({
      entitlementId: req.params.entitlementId,
      adminUserId: req.user!.userId,
      actionType: payload.actionType,
      reason: payload.reason,
    }));
  } catch (error) { next(error); }
});

router.get('/admin/entitlements', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await db.select().from(commerceEntitlements).orderBy(commerceEntitlements.createdAt));
});

router.post('/admin/grants', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = grantSchema.parse(req.body);
    const granted = await new CommerceService().adminGrantProductAccess({ ...payload, adminUserId: req.user!.userId });
    res.status(201).json({ granted });
  } catch (error) { next(error); }
});

router.delete('/admin/entitlements/:id', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await new CommerceService().revokeEntitlement(req.params.id));
  } catch (error) { next(error); }
});

export default router;
