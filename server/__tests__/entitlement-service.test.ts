import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntitlementError, EntitlementService, type EntitlementStore } from '../services/commerce/entitlement-service.ts';
import type { CommerceScopeType } from '../../shared/schema.ts';

type TestFeature = {
  featureKey: string;
  valueType: 'boolean' | 'integer' | 'string' | 'json';
  valueBool?: boolean | null;
  valueInt?: number | null;
  valueText?: string | null;
  valueJson?: unknown;
};

type TestRegistry = {
  key: string;
  scopeType: CommerceScopeType;
  valueType: 'boolean' | 'integer' | 'string' | 'json';
  defaultBool?: boolean | null;
  defaultInt?: number | null;
  defaultText?: string | null;
  defaultJson?: unknown;
};

class MemoryEntitlementStore implements EntitlementStore {
  entitlements = new Set<string>();
  entitlementFeatures = new Map<string, TestFeature | null>();
  subscriptionFeatures = new Map<string, TestFeature>();
  registry = new Map<string, TestRegistry>();

  async findActiveEntitlement(input: { userId: string; featureKey: string; scopeType: CommerceScopeType; scopeId: string | null }) {
    const entitlementKey = key(input.userId, input.featureKey, input.scopeType, input.scopeId);
    if (!this.entitlements.has(entitlementKey)) return null;
    return { feature: this.entitlementFeatures.get(entitlementKey) ?? null };
  }

  async findActiveSubscriptionFeature(input: { userId: string; featureKey: string; scopeType: CommerceScopeType; scopeId: string | null }) {
    return this.subscriptionFeatures.get(key(input.userId, input.featureKey, input.scopeType, input.scopeId)) ?? null;
  }

  async findRegistryFeature(featureKey: string) {
    return this.registry.get(featureKey) ?? null;
  }
}

function key(userId: string, featureKey: string, scopeType: CommerceScopeType, scopeId: string | null) {
  return `${userId}:${featureKey}:${scopeType}:${scopeId ?? ''}`;
}

function serviceWithStore() {
  const store = new MemoryEntitlementStore();
  return { store, service: new EntitlementService(store) };
}

describe('EntitlementService', () => {
  it('разрешает Freemium default для basic platform feature', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('personal_books.upload.enabled', { key: 'personal_books.upload.enabled', scopeType: 'platform', valueType: 'boolean', defaultBool: true });

    const result = await service.can('user-1', 'personal_books.upload.enabled');

    assert.equal(result.allowed, true);
    assert.equal(result.value, true);
  });

  it('paid product feature переопределяет default', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('club.members.max_count', { key: 'club.members.max_count', scopeType: 'club', valueType: 'integer', defaultInt: 20 });
    store.subscriptionFeatures.set(key('user-1', 'club.members.max_count', 'club', 'club-1'), { featureKey: 'club.members.max_count', valueType: 'integer', valueInt: 100 });

    assert.equal(await service.getLimit('user-1', 'club.members.max_count', { scopeType: 'club', scopeId: 'club-1' }), 100);
  });

  it('integer limit пропускает under и блокирует over', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('clubs.owned.max_count', { key: 'clubs.owned.max_count', scopeType: 'club', valueType: 'integer', defaultInt: 1 });

    await service.assertLimit('user-1', 'clubs.owned.max_count', 0, { scopeType: 'club' });
    await assert.rejects(() => service.assertLimit('user-1', 'clubs.owned.max_count', 1, { scopeType: 'club' }), (error) => error instanceof EntitlementError && error.code === 'LIMIT_EXCEEDED');
  });

  it('личная библиотека блокируется по Freemium лимиту personal_library.max_books', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('personal_library.max_books', { key: 'personal_library.max_books', scopeType: 'platform', valueType: 'integer', defaultInt: 100 });

    await service.assertLimit('user-1', 'personal_library.max_books', 99, { scopeType: 'platform' });
    await assert.rejects(() => service.assertLimit('user-1', 'personal_library.max_books', 100, { scopeType: 'platform' }), (error) => error instanceof EntitlementError && error.code === 'LIMIT_EXCEEDED');
  });

  it('книги клуба блокируются по Freemium лимиту club.books.max_count', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('club.books.max_count', { key: 'club.books.max_count', scopeType: 'club', valueType: 'integer', defaultInt: 5 });

    await service.assertLimit('user-1', 'club.books.max_count', 4, { scopeType: 'club', scopeId: 'club-1' });
    await assert.rejects(() => service.assertLimit('user-1', 'club.books.max_count', 5, { scopeType: 'club', scopeId: 'club-1' }), (error) => error instanceof EntitlementError && error.code === 'LIMIT_EXCEEDED');
  });

  it('участие в клубах блокируется по Freemium лимиту clubs.joined.max_count', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('clubs.joined.max_count', { key: 'clubs.joined.max_count', scopeType: 'platform', valueType: 'integer', defaultInt: 10 });

    await service.assertLimit('user-1', 'clubs.joined.max_count', 9, { scopeType: 'platform' });
    await assert.rejects(() => service.assertLimit('user-1', 'clubs.joined.max_count', 10, { scopeType: 'platform' }), (error) => error instanceof EntitlementError && error.code === 'LIMIT_EXCEEDED');
  });

  it('участники клуба блокируются по Freemium лимиту club.members.max_count', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('club.members.max_count', { key: 'club.members.max_count', scopeType: 'club', valueType: 'integer', defaultInt: 20 });

    await service.assertLimit('owner-1', 'club.members.max_count', 19, { scopeType: 'club', scopeId: 'club-1' });
    await assert.rejects(() => service.assertLimit('owner-1', 'club.members.max_count', 20, { scopeType: 'club', scopeId: 'club-1' }), (error) => error instanceof EntitlementError && error.code === 'LIMIT_EXCEEDED');
  });

  it('reader_club_access без entitlement запрещён', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('reader_club_access', { key: 'reader_club_access', scopeType: 'reader_club', valueType: 'boolean', defaultBool: false });

    const result = await service.can('user-1', 'reader_club_access', { scopeType: 'reader_club', scopeId: 'club-1' });

    assert.equal(result.allowed, false);
    assert.equal(result.code, 'READER_CLUB_ACCESS_REQUIRED');
  });

  it('reader_club_access с active entitlement разрешён', async () => {
    const { store, service } = serviceWithStore();
    store.entitlements.add(key('user-1', 'reader_club_access', 'reader_club', 'club-1'));

    const result = await service.can('user-1', 'reader_club_access', { scopeType: 'reader_club', scopeId: 'club-1' });

    assert.equal(result.allowed, true);
  });

  it('active entitlement с product feature возвращает typed limit', async () => {
    const { store, service } = serviceWithStore();
    const entitlementKey = key('user-1', 'club.members.max_count', 'club', 'club-1');
    store.entitlements.add(entitlementKey);
    store.entitlementFeatures.set(entitlementKey, { featureKey: 'club.members.max_count', valueType: 'integer', valueInt: 100 });

    assert.equal(await service.getLimit('user-1', 'club.members.max_count', { scopeType: 'club', scopeId: 'club-1' }), 100);
  });

  it('expired/revoked entitlement запрещён, если store не возвращает active entitlement', async () => {
    const { store, service } = serviceWithStore();
    store.registry.set('studio.live.enabled', { key: 'studio.live.enabled', scopeType: 'reader_club', valueType: 'boolean', defaultBool: false });

    const result = await service.can('user-1', 'studio.live.enabled', { scopeType: 'reader_club', scopeId: 'club-1' });

    assert.equal(result.allowed, false);
    assert.equal(result.code, 'MISSING_ENTITLEMENT');
  });

  it('typed values boolean/int/string/json читаются корректно', async () => {
    const { store, service } = serviceWithStore();
    store.subscriptionFeatures.set(key('user-1', 'studio.live.enabled', 'reader_club', 'club-1'), { featureKey: 'studio.live.enabled', valueType: 'boolean', valueBool: true });
    store.subscriptionFeatures.set(key('user-1', 'studio.live.max_listener_count', 'reader_club', 'club-1'), { featureKey: 'studio.live.max_listener_count', valueType: 'integer', valueInt: 50 });
    store.subscriptionFeatures.set(key('user-1', 'studio.analytics.level', 'reader_club', 'club-1'), { featureKey: 'studio.analytics.level', valueType: 'string', valueText: 'pro' });
    store.subscriptionFeatures.set(key('user-1', 'studio.policy', 'reader_club', 'club-1'), { featureKey: 'studio.policy', valueType: 'json', valueJson: { storage: 'warm' } });

    assert.equal((await service.can('user-1', 'studio.live.enabled', { scopeType: 'reader_club', scopeId: 'club-1' })).value, true);
    assert.equal(await service.getLimit('user-1', 'studio.live.max_listener_count', { scopeType: 'reader_club', scopeId: 'club-1' }), 50);
    assert.equal((await service.can('user-1', 'studio.analytics.level', { scopeType: 'reader_club', scopeId: 'club-1' })).value, 'pro');
    assert.deepEqual((await service.can('user-1', 'studio.policy', { scopeType: 'reader_club', scopeId: 'club-1' })).value, { storage: 'warm' });
  });
});
