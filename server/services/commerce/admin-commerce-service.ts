import { CommerceRepository } from '../../repositories/CommerceRepository.js';
import { emailService } from '../email-service.js';
import type { CommerceEntitlementActionType, InsertCommerceFeatureRegistryItem, InsertCommercePrice, InsertCommerceProduct, InsertCommerceProductFeature } from '../../../shared/schema.js';

export class AdminCommerceNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
  }
}

export class AdminCommerceService {
  constructor(private readonly commerce = new CommerceRepository()) {}

  listFeatures() { return this.commerce.listFeatureRegistry(); }

  saveFeature(input: InsertCommerceFeatureRegistryItem) { return this.commerce.upsertFeatureRegistry(input); }

  async updateFeature(key: string, input: Partial<Omit<InsertCommerceFeatureRegistryItem, 'key'>>) {
    const feature = await this.commerce.updateFeatureRegistry(key, input);
    if (!feature) throw new AdminCommerceNotFoundError('Feature not found');
    return feature;
  }

  listProducts() { return this.commerce.listProducts(); }

  createProduct(input: InsertCommerceProduct & { prices?: Array<Omit<InsertCommercePrice, 'productId'>>; features?: Array<Omit<InsertCommerceProductFeature, 'productId'>> }) {
    return this.commerce.createProduct(input);
  }

  async getProductDetails(id: string) {
    const product = await this.commerce.getProductDetails(id);
    if (!product) throw new AdminCommerceNotFoundError('Product not found');
    return product;
  }

  async updateProduct(id: string, input: Partial<InsertCommerceProduct>) {
    const product = await this.commerce.updateProduct(id, input);
    if (!product) throw new AdminCommerceNotFoundError('Product not found');
    return product;
  }

  async deleteArchivedProduct(id: string) {
    const product = await this.commerce.deleteArchivedProduct(id);
    if (!product) throw new AdminCommerceNotFoundError('Archived product not found');
    return { deleted: true, product };
  }

  async createPrice(productId: string, input: Omit<InsertCommercePrice, 'productId'>) {
    await this.assertProductExists(productId);
    return this.commerce.createPrice(productId, input);
  }

  async updatePrice(id: string, input: Partial<InsertCommercePrice>) {
    const price = await this.commerce.updatePrice(id, input);
    if (!price) throw new AdminCommerceNotFoundError('Price not found');
    return price;
  }

  async createProductFeature(productId: string, input: Omit<InsertCommerceProductFeature, 'productId'>) {
    await this.assertProductExists(productId);
    return this.commerce.createProductFeature(productId, input);
  }

  async updateProductFeature(id: string, input: Partial<InsertCommerceProductFeature>) {
    const feature = await this.commerce.updateProductFeature(id, input);
    if (!feature) throw new AdminCommerceNotFoundError('Product feature not found');
    return feature;
  }

  async deleteProductFeature(id: string) {
    const feature = await this.commerce.deleteProductFeature(id);
    if (!feature) throw new AdminCommerceNotFoundError('Product feature not found');
    return { deleted: true, feature };
  }

  listSubscriptions(filter: { entitlementId?: string; status?: string; userId?: string; productId?: string; period?: string; search?: string; limit?: number; offset?: number }) {
    return this.commerce.listSubscriptions(filter);
  }

  async manageSubscription(input: { entitlementId: string; adminUserId: string; actionType: CommerceEntitlementActionType; reason: string; initiatedBy?: 'admin' | 'user' }) {
    const result = await this.commerce.updateSubscriptionAction(input);
    if (!result) throw new AdminCommerceNotFoundError('Subscription entitlement not found');
    if ('conflict' in result) throw new AdminCommerceConflictError('Subscription is not active');
    const emailSent = ['restore', 'delete_revoked'].includes(input.actionType) ? false : await this.sendSubscriptionActionEmail(input.entitlementId, input.actionType, input.reason, input.initiatedBy ?? 'admin');
    return { ...result, emailSent };
  }

  listOrders(filter: { status?: string; userId?: string; productId?: string; dateFrom?: Date; dateTo?: Date; limit?: number }) { return this.commerce.listOrders(filter); }

  async getOrderAudit(id: string) {
    const audit = await this.commerce.getOrderAudit(id);
    if (!audit) throw new AdminCommerceNotFoundError('Order not found');
    return audit;
  }

  listPayments(filter: { status?: string; providerId?: string; providerPaymentId?: string; dateFrom?: Date; dateTo?: Date; limit?: number }) { return this.commerce.listPayments(filter); }

  async getPaymentAudit(id: string) {
    const audit = await this.commerce.getPaymentAudit(id);
    if (!audit) throw new AdminCommerceNotFoundError('Payment not found');
    return audit;
  }

  listPaymentEvents(filter: { status?: string; providerPaymentId?: string; dateFrom?: Date; dateTo?: Date; limit?: number }) { return this.commerce.listPaymentEvents(filter); }

  listLedgerEntries(filter: { status?: string; paymentId?: string; orderId?: string; clubId?: string; readerUserId?: string; entryType?: string; limit?: number }) { return this.commerce.listLedgerEntries(filter); }

  async getPaymentAuditChain(paymentId: string) {
    const audit = await this.commerce.getPaymentAuditChain(paymentId);
    if (!audit) throw new AdminCommerceNotFoundError('Payment not found');
    return audit;
  }

  private async assertProductExists(productId: string) {
    if (!await this.commerce.productExists(productId)) throw new AdminCommerceNotFoundError('Product not found');
  }

  private async sendSubscriptionActionEmail(entitlementId: string, actionType: CommerceEntitlementActionType, reason: string, initiatedBy: 'admin' | 'user') {
    const { items } = await this.commerce.listSubscriptions({ entitlementId, limit: 1 });
    const [row] = items;
    if (!row?.user?.email) return false;
    const title = row.product?.title ?? row.entitlement.featureKey;
    const endsAt = row.entitlement.endsAt ? row.entitlement.endsAt.toLocaleDateString('ru-RU') : 'конца оплаченного периода';
    const revokeNow = actionType === 'revoke_now';
    const subject = revokeNow ? `Доступ к подписке ${title} отозван` : `Продление подписки ${title} отменено`;
    const actor = initiatedBy === 'user' ? 'Вы отменили продление' : 'Администратор VoxLibris отменил продление';
    const text = revokeNow
      ? `Администратор VoxLibris отозвал доступ к подписке «${title}». Причина: ${reason}`
      : `${actor} подписки «${title}». Доступ сохранён до ${endsAt}. Причина: ${reason}`;
    return emailService.sendEmail({
      to: row.user.email,
      subject,
      text,
      html: `<p>${text}</p><p>Если у вас есть вопросы, напишите в поддержку VoxLibris.</p>`,
    });
  }
}

export class AdminCommerceConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
  }
}
