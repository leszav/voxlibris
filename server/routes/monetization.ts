import express from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { jwtAuth, requireAdmin } from '../jwt-middleware.js';
import { CommerceService, financialDashboard, PaymentGatewayService, PaymentNotificationProcessorService } from '../services/monetization.js';
import { commerceEntitlements, commercePrices, commerceProductFeatures, commerceProducts, readerClubTariffAssignments, readerClubTariffRequests, readerClubTariffTemplates, type PaymentProviderCode } from '../../shared/schema.js';
import { and, desc, eq } from 'drizzle-orm';

const router = express.Router();

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
  features: z.array(z.object({ label: z.string().min(1), featureKey: z.string().min(1).max(120), sortOrder: z.number().int().default(0), isHighlighted: z.boolean().default(false) })).default([]),
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

const grantSchema = z.object({
  userId: z.string().min(1),
  productId: z.string().min(1),
  sourceType: z.enum(['promo', 'admin_grant']).default('admin_grant'),
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

router.post('/webhooks/:provider', async (req, res, next) => {
  try {
    if (req.params.provider !== 'yookassa') return res.status(404).json({ message: 'Платёжный провайдер не поддерживается' });
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    await new PaymentNotificationProcessorService().process(req.params.provider as PaymentProviderCode, rawBody, req.body, req.headers);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/admin/plans', jwtAuth, requireAdmin, async (_req, res) => {
  res.json(await db.select().from(commerceProducts).orderBy(commerceProducts.sortOrder));
});

router.post('/admin/plans', jwtAuth, requireAdmin, async (req, res) => {
  const { prices, features, ...payload } = productSchema.parse(req.body);
  const [product] = await db.insert(commerceProducts).values(payload).returning();
  if (prices.length > 0) await db.insert(commercePrices).values(prices.map((price) => ({ ...price, productId: product.id })));
  if (features.length > 0) await db.insert(commerceProductFeatures).values(features.map((feature) => ({ ...feature, productId: product.id })));
  res.status(201).json(product);
});

router.patch('/admin/plans/:id', jwtAuth, requireAdmin, async (req, res) => {
  const { prices: _prices, features: _features, ...payload } = productSchema.partial().parse(req.body);
  const [product] = await db.update(commerceProducts).set({ ...payload, updatedAt: new Date() }).where(eq(commerceProducts.id, req.params.id)).returning();
  res.json(product);
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
    await tx.insert(commerceProductFeatures).values({ productId: product.id, label: 'Доступ к клубу чтеца', featureKey: 'reader_club_access', isHighlighted: true });
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
