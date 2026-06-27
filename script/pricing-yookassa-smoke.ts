import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db.js';
import { PaymentGatewayService } from '../server/services/monetization.js';
import { commerceEntitlements, commerceOrders, commercePaymentEvents, commercePayments, commercePrices, commerceProductFeatures, commerceProducts, users } from '../shared/schema.js';

const ENV_PATH = '.tmp/tarifs_constructor/.env';
const API_PORT = process.env.PRICING_SMOKE_API_PORT ?? String(5400 + (process.pid % 1000));
const API_BASE_URL = process.env.PRICING_SMOKE_API_BASE_URL ?? `http://127.0.0.1:${API_PORT}`;
const EMULATOR_BASE_URL = process.env.YOOKASSA_EMULATOR_PUBLIC_URL ?? 'http://127.0.0.1:4010';
const BUYER_ID = `pricing-smoke-buyer-${Date.now()}`;

type StartedProcess = { process: ChildProcess };

function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function token(userId: string) {
  assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
  return jwt.sign({ userId, username: userId, role: 'user', status: 'active', sessionType: 'normal' }, process.env.JWT_SECRET, { expiresIn: '2h' });
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

function start(command: string, args: string[], env: NodeJS.ProcessEnv): StartedProcess {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(String(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));
  return { process: child };
}

async function ensureProcesses() {
  const started: StartedProcess[] = [];
  started.push(start('pnpm', ['run', 'dev:server'], { ...process.env, PORT: API_PORT, YOOKASSA_API_BASE_URL: EMULATOR_BASE_URL }));
  if (!await apiAvailable(EMULATOR_BASE_URL)) {
    started.push(start('node', ['.tmp/yooksssa_emulator/server.mjs'], { ...process.env, YOOKASSA_EMULATOR_WEBHOOK_URL: `${API_BASE_URL}/api/commerce/webhooks/yookassa` }));
  }
  await waitFor('API', `${API_BASE_URL}/api/health`);
  await waitFor('YooKassa emulator', EMULATOR_BASE_URL);
  return started;
}

async function ensurePricingFixture() {
  await db.insert(users).values({ id: BUYER_ID, username: BUYER_ID, email: `${BUYER_ID}@example.test`, password: 'test', role: 'user', status: 'active', emailConfirmed: true })
    .onConflictDoUpdate({ target: users.id, set: { status: 'active', emailConfirmed: true } });

  const [product] = await db.insert(commerceProducts).values({
    type: 'platform_subscription',
    scopeType: 'platform',
    scopeId: null,
    code: 'platform_plus',
    title: 'Плюс',
    description: 'Расширенные возможности для активных читателей и клубов.',
    status: 'active',
    visibility: 'public',
    sortOrder: 20,
    metadata: { isPopular: true },
  }).onConflictDoUpdate({ target: commerceProducts.code, set: { status: 'active', visibility: 'public', metadata: { isPopular: true }, updatedAt: new Date() } }).returning();

  const [existingPrice] = await db.select().from(commercePrices).where(and(eq(commercePrices.productId, product.id), eq(commercePrices.isDefault, true))).limit(1);
  const price = existingPrice ?? (await db.insert(commercePrices).values({ productId: product.id, amountRub: 490, period: 'month', status: 'active', isDefault: true }).returning())[0];

  await db.insert(commerceProductFeatures).values({ productId: product.id, label: 'Расширенные возможности платформы', featureKey: 'platform_plus_access', valueType: 'boolean', valueBool: true, isHighlighted: true })
    .onConflictDoNothing();

  await new PaymentGatewayService().saveProvider({
    code: 'yookassa',
    name: 'YooKassa emulator',
    status: 'active',
    credentials: { shopId: 'local_shop', apiKey: 'local_secret', receiptEnabled: 'true', vatCode: '1', paymentSubject: 'service', paymentMode: 'full_payment' },
  });

  return { product, price, buyerToken: token(BUYER_ID) };
}

async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, API_BASE_URL), { ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const body = await response.json() as T;
  return { response, body };
}

async function main() {
  loadEnvFile();
  const fixture = await ensurePricingFixture();
  const started = await ensureProcesses();
  try {
    const plans = await api<Array<{ id: string; code: string; metadata?: { isPopular?: boolean }; prices: Array<{ id: string }> }>>('/api/commerce/plans');
    assert.equal(plans.response.status, 200);
    const plus = plans.body.find((plan) => plan.code === 'platform_plus');
    assert.ok(plus, 'platform_plus must be visible on /pricing API');
    assert.equal(plus.metadata?.isPopular, true);

    const checkout = await api<{ confirmationUrl: string; providerPaymentId: string }>('/api/commerce/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${fixture.buyerToken}` },
      body: JSON.stringify({ productId: fixture.product.id, priceId: fixture.price.id }),
    });
    assert.equal(checkout.response.status, 200, `checkout failed: ${JSON.stringify(checkout.body)}`);
    assert.ok(checkout.body.confirmationUrl.startsWith(`${EMULATOR_BASE_URL}/pay/`));

    const success = await fetch(`${EMULATOR_BASE_URL}/pay/${encodeURIComponent(checkout.body.providerPaymentId)}/success`, { method: 'POST' });
    assert.equal(success.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const [payment] = await db.select().from(commercePayments).where(eq(commercePayments.providerPaymentId, checkout.body.providerPaymentId)).limit(1);
    assert.ok(payment, 'checkout must create local payment');
    assert.equal(payment.status, 'succeeded', 'webhook must mark payment as succeeded');

    const [order] = await db.select().from(commerceOrders).where(eq(commerceOrders.id, payment.orderId)).limit(1);
    assert.ok(order, 'checkout must create local order');
    assert.equal(order.status, 'paid', 'webhook must mark order as paid');

    const [paymentEvent] = await db.select().from(commercePaymentEvents).where(eq(commercePaymentEvents.providerPaymentId, checkout.body.providerPaymentId)).limit(1);
    assert.ok(paymentEvent, 'emulator success must create payment event');
    assert.equal(paymentEvent.status, 'processed', 'payment event must be processed');

    const [entitlement] = await db.select().from(commerceEntitlements).where(and(
      eq(commerceEntitlements.userId, BUYER_ID),
      eq(commerceEntitlements.sourceType, 'payment'),
      eq(commerceEntitlements.featureKey, 'platform_plus_access'),
      eq(commerceEntitlements.status, 'active'),
    )).limit(1);
    assert.ok(entitlement, 'platform pricing checkout must grant entitlement');

    console.log('✅ pricing YooKassa smoke passed');
    console.log('  ✓ /api/commerce/plans returns public platform_plus tariff');
    console.log('  ✓ checkout creates YooKassa emulator payment URL');
    console.log('  ✓ emulator success webhook is processed');
    console.log('  ✓ order=paid, payment=succeeded, event=processed');
    console.log('  ✓ active platform_plus_access entitlement is granted');
  } finally {
    for (const item of started) item.process.kill('SIGTERM');
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
