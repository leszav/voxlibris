import { and, eq, desc, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { commerceLedgerEntries, clubs } from '../../shared/schema.js';

export interface ReaderWalletBalance {
  availableKopecks: number;
  pendingKopecks: number;
  withdrawnKopecks: number;
  totalEarnedKopecks: number;
}

export interface ReaderLedgerEntry {
  id: string;
  paymentId: string;
  orderId: string;
  clubId: string | null;
  clubTitle: string | null;
  entryType: string;
  amountKopecks: number;
  status: string;
  createdAt: Date;
}

export interface ReaderWithdrawalRequest {
  id: string;
  amountKopecks: number;
  status: 'demo_approved';
  createdAt: Date;
  processedAt: Date;
}

export class ReaderWalletService {
  /**
   * Получить баланс чтеца по всем его reader_earning записям
   */
  async getBalance(readerUserId: string): Promise<ReaderWalletBalance> {
    const entries = await db
      .select({
        amountKopecks: commerceLedgerEntries.amountKopecks,
        status: commerceLedgerEntries.status,
      })
      .from(commerceLedgerEntries)
      .where(
        and(
          eq(commerceLedgerEntries.readerUserId, readerUserId),
          eq(commerceLedgerEntries.entryType, 'reader_earning')
        )
      );

    let availableKopecks = 0;
    let pendingKopecks = 0;
    let withdrawnKopecks = 0;

    for (const entry of entries) {
      if (entry.status === 'available') {
        availableKopecks += entry.amountKopecks;
      } else if (entry.status === 'pending') {
        pendingKopecks += entry.amountKopecks;
      } else if (entry.status === 'withdrawn' || entry.status === 'paid') {
        withdrawnKopecks += entry.amountKopecks;
      }
    }

    const totalEarnedKopecks = availableKopecks + pendingKopecks + withdrawnKopecks;

    return {
      availableKopecks,
      pendingKopecks,
      withdrawnKopecks,
      totalEarnedKopecks,
    };
  }

  /**
   * Получить историю ledger entries чтеца
   */
  async getHistory(readerUserId: string, limit = 50, offset = 0): Promise<ReaderLedgerEntry[]> {
    const entries = await db
      .select({
        id: commerceLedgerEntries.id,
        paymentId: commerceLedgerEntries.paymentId,
        orderId: commerceLedgerEntries.orderId,
        clubId: commerceLedgerEntries.clubId,
        clubTitle: clubs.title,
        entryType: commerceLedgerEntries.entryType,
        amountKopecks: commerceLedgerEntries.amountKopecks,
        status: commerceLedgerEntries.status,
        createdAt: commerceLedgerEntries.createdAt,
      })
      .from(commerceLedgerEntries)
      .leftJoin(clubs, eq(commerceLedgerEntries.clubId, clubs.id))
      .where(
        and(
          eq(commerceLedgerEntries.readerUserId, readerUserId),
          eq(commerceLedgerEntries.entryType, 'reader_earning')
        )
      )
      .orderBy(desc(commerceLedgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    return entries;
  }

  /**
   * Создать демо-вывод средств
   * Помечает все available ledger entries как withdrawn
   */
  async createDemoWithdrawal(readerUserId: string): Promise<ReaderWithdrawalRequest> {
    const now = new Date();

    // Получить все available earnings
    const availableEntries = await db
      .select({ id: commerceLedgerEntries.id, amountKopecks: commerceLedgerEntries.amountKopecks })
      .from(commerceLedgerEntries)
      .where(
        and(
          eq(commerceLedgerEntries.readerUserId, readerUserId),
          eq(commerceLedgerEntries.entryType, 'reader_earning'),
          eq(commerceLedgerEntries.status, 'available')
        )
      );

    if (availableEntries.length === 0) {
      throw new Error('Нет доступных средств для вывода');
    }

    const totalAmountKopecks = availableEntries.reduce((sum, entry) => sum + entry.amountKopecks, 0);
    const entryIds = availableEntries.map((e) => e.id);

    // Обновить статус на withdrawn
    await db
      .update(commerceLedgerEntries)
      .set({ status: 'withdrawn' })
      .where(inArray(commerceLedgerEntries.id, entryIds));

    return {
      id: crypto.randomUUID(),
      amountKopecks: totalAmountKopecks,
      status: 'demo_approved',
      createdAt: now,
      processedAt: now,
    };
  }

  /**
   * Проверить, является ли пользователь владельцем reader-led клуба
   */
  async isReaderClubOwner(userId: string): Promise<boolean> {
    const [club] = await db
      .select({ id: clubs.id })
      .from(clubs)
      .where(and(eq(clubs.ownerId, userId), eq(clubs.type, 'reader-led')))
      .limit(1);

    return !!club;
  }

  /**
   * Получить информацию о клубе чтеца
   */
  async getReaderClubInfo(userId: string): Promise<{ id: string; title: string } | null> {
    const [club] = await db
      .select({
        id: clubs.id,
        title: clubs.title,
      })
      .from(clubs)
      .where(and(eq(clubs.ownerId, userId), eq(clubs.type, 'reader-led')))
      .limit(1);

    return club || null;
  }
}
