import { BaseRepository } from './BaseRepository.js';
import { eq, desc } from 'drizzle-orm';
import { 
  adminActions,
  moderationReports,
  books,
  type AdminAction,
  type ModerationReport,
  type InsertModerationReport,
  type ModerationReportType,
  type ModerationReportPriority,
  type ModerationReportReason
} from '../../shared/schema.js';

/**
 * Репозиторий для модерации и админ-действий
 * Управляет логированием действий администраторов и отчетами модерации
 */
export class ModerationRepository extends BaseRepository {
  
  // ============================================================
  // Admin Actions - Логирование действий администраторов
  // ============================================================

  /**
   * Логирование действия администратора
   */
  async logAdminAction(action: {
    adminId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    reason?: string;
    previousValue?: string;
    newValue?: string;
    metadata?: object;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AdminAction> {
    try {
      const result = await this.db
        .insert(adminActions)
        .values({
          adminId: action.adminId,
          actionType: action.actionType as any,
          targetType: action.targetType as any,
          targetId: action.targetId,
          reason: action.reason,
          previousValue: action.previousValue,
          newValue: action.newValue,
          metadata: action.metadata ? JSON.stringify(action.metadata) : undefined,
          ipAddress: action.ipAddress,
          userAgent: action.userAgent,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logError('logAdminAction', error);
      throw new Error('Failed to log admin action');
    }
  }

  /**
   * Получение истории действий администратора
   */
  async getAdminActions(adminId?: string, limit: number = 100): Promise<AdminAction[]> {
    try {
      let query = this.db
        .select()
        .from(adminActions)
        .orderBy(desc(adminActions.createdAt));

      if (adminId) {
        const result = await query
          .where(eq(adminActions.adminId, adminId))
          .limit(limit);
        return result;
      }

      const result = await query.limit(limit);
      return result;
    } catch (error) {
      this.logError('getAdminActions', error);
      throw new Error('Failed to get admin actions');
    }
  }

  // ============================================================
  // Book Status Management - Управление статусом книг
  // ============================================================

  /**
   * Обновление статуса книги (для модерации)
   */
  async updateBookStatus(bookId: string, status: 'draft' | 'published' | 'archived', adminId: string): Promise<boolean> {
    try {
      // Получаем текущий статус для логирования
      const currentBook = await this.db
        .select()
        .from(books)
        .where(eq(books.id, bookId))
        .limit(1);

      if (currentBook.length === 0) {
        throw new Error('Book not found');
      }

      // Обновляем статус
      const result = await this.db
        .update(books)
        .set({ status: status as any })
        .where(eq(books.id, bookId))
        .returning();

      // Логируем действие админа
      if (result.length > 0) {
        await this.logAdminAction({
          adminId,
          actionType: 'update_book_status',
          targetType: 'book',
          targetId: bookId,
          previousValue: currentBook[0].status || 'unknown',
          newValue: status,
          metadata: { bookTitle: currentBook[0].title }
        });
      }

      return result.length > 0;
    } catch (error) {
      this.logError('updateBookStatus', error);
      throw new Error('Failed to update book status');
    }
  }

  // ============================================================
  // Moderation Reports - Отчеты модерации
  // ============================================================

  /**
   * Получение отчетов модерации с фильтрами
   */
  async getModerationReports(filters?: { status?: string; type?: string; assignedTo?: string }): Promise<ModerationReport[]> {
    try {
      let query = this.db.select().from(moderationReports);

      if (filters?.status) {
        const statusValue = filters.status as any;
        query = query.where(eq(moderationReports.status, statusValue)) as typeof query;
      }
      if (filters?.type) {
        query = query.where(eq(moderationReports.type, filters.type as ModerationReportType)) as typeof query;
      }
      if (filters?.assignedTo) {
        query = query.where(eq(moderationReports.assignedTo, filters.assignedTo)) as typeof query;
      }

      const result = await query.orderBy(desc(moderationReports.createdAt));
      return result;
    } catch (error) {
      this.logError('getModerationReports', error);
      throw new Error('Failed to get moderation reports');
    }
  }

  /**
   * Обновление отчета модерации
   */
  async updateModerationReport(reportId: string, updates: Partial<ModerationReport>): Promise<boolean> {
    try {
      const updateData: any = { updatedAt: new Date() };

      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.assignedTo !== undefined) updateData.assignedTo = updates.assignedTo;
      if (updates.resolution !== undefined) updateData.resolution = updates.resolution;
      if (updates.adminNotes !== undefined) updateData.adminNotes = updates.adminNotes;

      if (updates.status === 'resolved') {
        updateData.resolvedAt = new Date();
      }

      const result = await this.db
        .update(moderationReports)
        .set(updateData)
        .where(eq(moderationReports.id, reportId))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('updateModerationReport', error);
      throw new Error('Failed to update moderation report');
    }
  }

  /**
   * Создание отчета модерации
   */
  async createModerationReport(report: InsertModerationReport): Promise<string> {
    try {
      const result = await this.db
        .insert(moderationReports)
        .values({
          type: report.type as ModerationReportType,
          targetId: report.targetId,
          reporterId: report.reporterId,
          reason: report.reason as ModerationReportReason,
          description: report.description,
          priority: (report.priority || 'medium') as ModerationReportPriority,
        })
        .returning();

      return result[0].id;
    } catch (error) {
      this.logError('createModerationReport', error);
      throw new Error('Failed to create moderation report');
    }
  }
}
