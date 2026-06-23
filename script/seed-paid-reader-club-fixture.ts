import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import {
  clubMembers,
  clubs,
  commercePrices,
  commerceProductFeatures,
  commerceProducts,
  readerClubTariffAssignments,
  users,
} from "../shared/schema.js";

dotenv.config();

const { db } = await import("../server/db.js");

const ownerId = process.env.PAID_READER_CLUB_OWNER_ID ?? "paid-reader-club-owner-dev";
const clubId = process.env.PAID_READER_CLUB_ID ?? "paid-reader-club-dev";
const productCode = process.env.PAID_READER_CLUB_PRODUCT_CODE ?? "paid_reader_club_dev_month";
const amountRub = Number.parseInt(process.env.PAID_READER_CLUB_AMOUNT_RUB ?? "490", 10);

async function ensureOwner() {
  const [existing] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
  if (existing) return existing;

  const [owner] = await db.insert(users).values({
    id: ownerId,
    username: "paid-reader-club-owner-dev",
    email: "paid-reader-club-owner-dev@voxlibris.local",
    password: "dev-fixture-no-login",
    role: "admin",
    status: "active",
    emailConfirmed: true,
  }).returning();
  return owner;
}

async function ensureClub() {
  const [existing] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (existing) return existing;

  const [club] = await db.insert(clubs).values({
    id: clubId,
    title: "Dev paid reader-led club",
    description: "Локальный fixture для проверки платного клуба чтеца.",
    ownerId,
    type: "reader-led",
    status: "active",
    maxMembers: 50,
    isPrivate: false,
    isActive: true,
  }).returning();
  return club;
}

async function ensureOwnerMembership() {
  const existing = await db.select().from(clubMembers)
    .where(eq(clubMembers.clubId, clubId));
  if (existing.some((member) => member.userId === ownerId && member.role === "owner")) return;

  await db.insert(clubMembers).values({ clubId, userId: ownerId, role: "owner", isActive: true });
}

async function ensureProduct() {
  const [existing] = await db.select().from(commerceProducts).where(eq(commerceProducts.code, productCode)).limit(1);
  if (existing) return existing;

  const [product] = await db.insert(commerceProducts).values({
    type: "reader_club_subscription",
    scopeType: "reader_club",
    scopeId: clubId,
    code: productCode,
    title: "Dev paid reader-led club — месяц",
    description: "Тестовый платный тариф клуба чтеца для sandbox smoke.",
    status: "active",
    visibility: "public",
    sortOrder: 9000,
    metadata: { fixture: "paid-reader-club-dev" },
  }).returning();
  return product;
}

async function ensureTariff(productId: string) {
  const prices = await db.select().from(commercePrices).where(eq(commercePrices.productId, productId));
  if (prices.length === 0) {
    await db.insert(commercePrices).values({ productId, amountRub, period: "month", status: "active", isDefault: true });
  }

  const features = await db.select().from(commerceProductFeatures).where(eq(commerceProductFeatures.productId, productId));
  if (!features.some((feature) => feature.featureKey === "reader_club_access")) {
    await db.insert(commerceProductFeatures).values({ productId, label: "Доступ к клубу чтеца", featureKey: "reader_club_access", isHighlighted: true });
  }

  const assignments = await db.select().from(readerClubTariffAssignments).where(eq(readerClubTariffAssignments.clubId, clubId));
  if (!assignments.some((assignment) => assignment.productId === productId && assignment.status === "active")) {
    await db.insert(readerClubTariffAssignments).values({
      clubId,
      productId,
      selectedBy: ownerId,
      readerShareBps: 7000,
      acquiringFeeBps: 350,
      status: "active",
    });
  }
}

export async function seedPaidReaderClubFixture() {
  await ensureOwner();
  await ensureClub();
  await ensureOwnerMembership();
  const product = await ensureProduct();
  await ensureTariff(product.id);
  return { ownerId, clubId, productId: product.id, productCode };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const fixture = await seedPaidReaderClubFixture();
    console.log("Paid reader-led club fixture is ready:");
    console.log(`TEST_READER_CLUB_ID=${fixture.clubId}`);
    console.log(`TEST_PAID_READER_CLUB_ID=${fixture.clubId}`);
    console.log(`TEST_PAID_READER_CLUB_PRODUCT_ID=${fixture.productId}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
