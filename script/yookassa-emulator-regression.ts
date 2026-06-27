import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db.js';
import { PaymentGatewayService } from '../server/services/monetization.js';
import {
  clubMembers,
  clubs,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  readerClubTariffAssignments,
  users,
} from '../shared/schema.js';

const ENV_PATH = '.tmp/tarifs_constructor/.env';
const API_PORT = process.env.YOOKASSA_REGRESSION_API_PORT ?? String(5100 + (process.pid % 1000));
const API_BASE_URL = process.env.YOOKASSA_REGRESSION_API_BASE_URL ?? `http://127.0.0.1:${API_PORT}`;
const EMULATOR_BASE_URL = process.env.YOOKASSA_EMULATOR_PUBLIC_URL ?? 'http://127.0.0.1:4010';
const ADMIN_ID = 'paid-reader-club-owner-dev';
const BUYER_ID = `yookassa-regression-buyer-${Date.now()}`;
const CLUB_ID = 'paid-reader-club-dev';
const PRODUCT_CODE = 'reader_club_yookassa_regression';

type StartedProcess = { name: string; process: ChildProcess };

function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function rememberEnv(values: Record<string, string>) {
  const current = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const additions = Object.entries(values)
    .filter(([key]) => !current.includes(`${key}=`))
    .map(([key, value]) => `${key}=${value}`);
  if (additions.length > 0) appendFileSync(ENV_PATH, `${current.endsWith('\n') ? '' : '\n'}${additions.join('\n')}\n`);
}

function token(userId: string, role: 'admin' | 'user') {
  const secret = process.env.JWT_SECRET;
  assert.ok(secret, 'JWT_SECRET is required');
  return jwt.sign({ userId, username: userId, role, status: 'active', sessionType: 'normal' }, secret, { expiresIn: '2h' });
}

async function apiAvailable(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(name: string, url: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await apiAvailable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} is not available at ${url}`);
}

function start(name: string, command: string, args: string[], env: NodeJS.ProcessEnv): StartedProcess {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return { name, process: child };
}

async function ensureProcesses() {
  const started: StartedProcess[] = [];
  started.push(start('api', 'pnpm', ['run', 'dev:server'], { ...process.env, PORT: API_PORT, YOOKASSA_API_BASE_URL: EMULATOR_BASE_URL }));
  if (!await apiAvailable(EMULATOR_BASE_URL)) {
    started.push(start('yookassa-emulator', 'node', ['.tmp/yooksssa_emulator/server.mjs'], {
      ...process.env,
      YOOKASSA_EMULATOR_WEBHOOK_URL: `${API_BASE_URL}/api/commerce/webhooks/yookassa`,
    }));
  }
  await waitFor('API', `${API_BASE_URL}/api/health`);
  await waitFor('YooKassa emulator', EMULATOR_BASE_URL);
  return started;
}

async function upsertUser(id: string, role: 'admin' | 'user') {
  await db.insert(users).values({ id, username: id, email: `${id}@example.test`, password: 'test', role, status: 'active', emailConfirmed: true })
    .onConflictDoUpdate({ target: users.id, set: { role, status: 'active', emailConfirmed: true } });
}

async function prepareFixture() {
  await upsertUser(ADMIN_ID, 'admin');
  await upsertUser(BUYER_ID, 'user');
  await db.insert(clubs).values({ id: CLUB_ID, title: 'Paid reader club dev', ownerId: ADMIN_ID, type: 'reader-led', status: 'recruiting' })
    .onConflictDoUpdate({ target: clubs.id, set: { ownerId: ADMIN_ID, type: 'reader-led', isActive: true } });

  const [product] = await db.insert(commerceProducts).values({
    type: 'reader_club_subscription',
    scopeType: 'reader_club',
    scopeId: CLUB_ID,
    code: PRODUCT_CODE,
    title: 'YooKassa regression reader club',
    status: 'active',
    visibility: 'public',
  }).onConflictDoUpdate({ target: commerceProducts.code, set: { status: 'active', visibility: 'public', scopeId: CLUB_ID } }).returning();

  const [existingPrice] = await db.select().from(commercePrices).where(and(eq(commercePrices.productId, product.id), eq(commercePrices.isDefault, true))).limit(1);
  const price = existingPrice ?? (await db.insert(commercePrices).values({ productId: product.id, amountRub: 390, period: 'month', isDefault: true, status: 'active' }).returning())[0];
  await db.insert(commerceProductFeatures).values({ productId: product.id, label: 'Доступ к клубу чтеца', featureKey: 'reader_club_access', valueType: 'boolean', valueBool: true, isHighlighted: true })
    .onConflictDoNothing();
  await db.update(readerClubTariffAssignments).set({ status: 'inactive', updatedAt: new Date() }).where(and(eq(readerClubTariffAssignments.clubId, CLUB_ID), eq(readerClubTariffAssignments.status, 'active')));
  await db.insert(readerClubTariffAssignments).values({ clubId: CLUB_ID, productId: product.id, selectedBy: ADMIN_ID, readerShareBps: 7000, acquiringFeeBps: 350 });

  await new PaymentGatewayService().saveProvider({
    code: 'yookassa',
    name: 'YooKassa emulator',
    status: 'active',
    credentials: { shopId: 'local_shop', apiKey: 'local_secret', receiptEnabled: 'true', vatCode: '1', paymentSubject: 'service', paymentMode: 'full_payment' },
  });

  const values = {
    TEST_ADMIN_TOKEN: token(ADMIN_ID, 'admin'),
    TEST_OWNER_TOKEN: token(ADMIN_ID, 'admin'),
    TEST_BUYER_TOKEN: token(BUYER_ID, 'user'),
    TEST_READER_CLUB_ID: CLUB_ID,
    TEST_PAID_READER_CLUB_ID: CLUB_ID,
    TEST_PAID_READER_CLUB_PRODUCT_ID: product.id,
    TEST_GRANT_USER_ID: BUYER_ID,
  };
  rememberEnv(values);
  return { product, price, buyerToken: values.TEST_BUYER_TOKEN, adminToken: values.TEST_ADMIN_TOKEN };
}

async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, API_BASE_URL), {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const body = await response.json() as T;
  return { response, body };
}

async function main() {
  loadEnvFile();
  const fixture = await prepareFixture();
  const started = await ensureProcesses();
  try {
    const checkout = await api<{ confirmationUrl: string; providerPaymentId: string }>('/api/commerce/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${fixture.buyerToken}` },
      body: JSON.stringify({ productId: fixture.product.id, priceId: fixture.price.id }),
    });
    assert.equal(checkout.response.status, 200, `checkout failed: ${JSON.stringify(checkout.body)}`);

    const paymentId = checkout.body.providerPaymentId;
    assert.ok(checkout.body.confirmationUrl.startsWith(`${EMULATOR_BASE_URL}/pay/`));

    const success = await fetch(`${EMULATOR_BASE_URL}/pay/${encodeURIComponent(paymentId)}/success`, { method: 'POST' });
    assert.equal(success.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const payments = await api<Array<{ id: string }>>(`/api/commerce/admin/payments?providerPaymentId=${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${fixture.adminToken}` },
    });
    assert.equal(payments.response.status, 200);
    const localPaymentId = payments.body[0]?.id;
    assert.ok(localPaymentId, 'local payment must exist');

    const audit = await api<{ diagnostics: { hasEntitlement: boolean; hasMembershipOrGrant: boolean; hasLedgerEntries: boolean; ledgerAmountMatchesPayment: boolean | null }; payment: { fiscalReceiptId?: string; fiscalReceiptUrl?: string }; ledger: unknown[] }>(`/api/commerce/admin/audit-chain/${localPaymentId}`, {
      headers: { Authorization: `Bearer ${fixture.adminToken}` },
    });
    assert.equal(audit.response.status, 200);
    assert.equal(audit.body.diagnostics.hasEntitlement, true);
    assert.equal(audit.body.diagnostics.hasMembershipOrGrant, true);
    assert.equal(audit.body.diagnostics.hasLedgerEntries, true);
    assert.equal(audit.body.diagnostics.ledgerAmountMatchesPayment, true);
    assert.ok(audit.body.payment.fiscalReceiptId);
    assert.ok(audit.body.payment.fiscalReceiptUrl);
    const ledgerCount = audit.body.ledger.length;

    const repeat = await fetch(`${EMULATOR_BASE_URL}/pay/${encodeURIComponent(paymentId)}/repeat`, { method: 'POST' });
    assert.equal(repeat.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const repeatedAudit = await api<{ ledger: unknown[] }>(`/api/commerce/admin/audit-chain/${localPaymentId}`, {
      headers: { Authorization: `Bearer ${fixture.adminToken}` },
    });
    assert.equal(repeatedAudit.body.ledger.length, ledgerCount);

    const [membership] = await db.select().from(clubMembers).where(and(eq(clubMembers.clubId, CLUB_ID), eq(clubMembers.userId, BUYER_ID), eq(clubMembers.isActive, true))).limit(1);
    assert.ok(membership);
  } finally {
    for (const item of started) item.process.kill('SIGTERM');
  }
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
