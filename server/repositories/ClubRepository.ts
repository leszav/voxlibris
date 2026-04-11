import { BaseRepository } from './BaseRepository.js';
import { eq, desc, and, count, sql, ne, inArray } from 'drizzle-orm';
import {
  clubs,
  clubMembers,
  clubInvitations,
  users,
  clubBooks,
  tags,
  clubTags,
  bookReadingStatus,
  bookAccessLogs,
  analyticsEvents,
} from '../../shared/schema.js';
import type {
  Club,
  InsertClub,
  ClubMember,
  ClubMemberRole,
  ClubInvitation,
  InsertClubInvitation,
  InvitationStatus,
  User,
  ClubWithDetails
} from '../../shared/schema.js';
import { logger } from '../lib/logger.js';
import type { ClientPublicCatalogClub } from '../lib/client-serializers.js';

/**
 * Club Domain Repository - единственная ответственность: управление клубами
 * Архитектурная изоляция: все операции с клубами, участниками и приглашениями
 * Устраняет нарушение SRP через четкое разделение ответственности
 */
export class ClubRepository extends BaseRepository {
  private async enrichClubList(
    clubsData: Club[],
    options: {
      includeBook?: boolean;
      includeTags?: boolean;
    } = {},
  ): Promise<ClubWithDetails[]> {
    if (clubsData.length === 0) {
      return [];
    }

    const includeBook = options.includeBook ?? true;
    const includeTags = options.includeTags ?? true;
    const clubIds = clubsData.map((club) => club.id);
    const ownerIds = Array.from(new Set(clubsData.map((club) => club.ownerId)));

    const [owners, memberCounts, latestBooks, tagRows] = await Promise.all([
      ownerIds.length > 0
        ? this.db.select().from(users).where(inArray(users.id, ownerIds))
        : Promise.resolve([] as (typeof users.$inferSelect)[]),
      this.db
        .select({
          clubId: clubMembers.clubId,
          count: count(),
        })
        .from(clubMembers)
        .where(inArray(clubMembers.clubId, clubIds))
        .groupBy(clubMembers.clubId),
      includeBook
        ? (() => {
            const activeBookIds = clubsData
              .map((c) => c.bookId)
              .filter((id): id is string => id !== null && id !== undefined);
            if (activeBookIds.length === 0) return Promise.resolve([] as (typeof clubBooks.$inferSelect)[]);
            return this.db
              .select()
              .from(clubBooks)
              .where(and(
                inArray(clubBooks.id, activeBookIds),
                eq(clubBooks.isDeleted, false),
              ));
          })()
        : Promise.resolve([] as (typeof clubBooks.$inferSelect)[]),
      includeTags
        ? this.db
            .select({
              clubId: clubTags.clubId,
              slug: tags.slug,
            })
            .from(clubTags)
            .innerJoin(tags, eq(clubTags.tagId, tags.id))
            .where(inArray(clubTags.clubId, clubIds))
        : Promise.resolve([] as Array<{ clubId: string; slug: string }>),
    ]);

    const ownersMap = new Map(owners.map((owner) => [owner.id, owner]));
    const memberCountMap = new Map(
      memberCounts.map((entry) => [entry.clubId, Number(entry.count || 0)]),
    );

    const activeBookMap = new Map<string, typeof clubBooks.$inferSelect>();
    for (const book of latestBooks) {
      activeBookMap.set(book.id, book);
    }

    const tagsMap = new Map<string, string[]>();
    for (const row of tagRows) {
      const existing = tagsMap.get(row.clubId);
      if (existing) {
        existing.push(row.slug);
      } else {
        tagsMap.set(row.clubId, [row.slug]);
      }
    }

    return clubsData.map((club) => {
      const activeBook = includeBook && club.bookId ? activeBookMap.get(club.bookId) ?? null : null;
      return {
        ...club,
        book: activeBook,
        owner: ownersMap.get(club.ownerId) || null,
        memberCount: memberCountMap.get(club.id) || 0,
        tags: includeTags ? (tagsMap.get(club.id) || []) : [],
      };
    }) as ClubWithDetails[];
  }

  
  /**
   * Получение всех активных клубов для публичного каталога
   * Фильтрует клубы на модерации (status = 'pending')
   * Сортирует по популярности, затем по дате создания
   */
  async getClubs(): Promise<ClubWithDetails[]> {
    try {
      const clubsData = await this.db
        .select()
        .from(clubs)
        .where(ne(clubs.status, 'pending')) // Исключаем клубы на модерации
        .orderBy(desc(clubs.popularityScore), desc(clubs.createdAt)); // Сначала по популярности, потом по дате

      return this.enrichClubList(clubsData);
    } catch (error) {
      this.logError('getClubs', error);
      return [];
    }
  }

  async getPublicCatalogClubs(limit?: number, searchQuery?: string): Promise<ClientPublicCatalogClub[]> {
    try {
      const normalizedLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0
        ? Math.min(Math.trunc(limit), 100)
        : undefined;
      const normalizedSearch = typeof searchQuery === 'string' ? searchQuery.trim().toLowerCase() : '';

      let query = this.db
        .select({
          id: clubs.id,
          title: clubs.title,
          description: clubs.description,
          coverImage: clubs.coverImage,
        })
        .from(clubs)
        .where(ne(clubs.status, 'pending'))
        .orderBy(desc(clubs.popularityScore), desc(clubs.createdAt))
        .$dynamic();

      // Для поискового запроса сначала получаем полный набор и фильтруем по клубу/книге/автору.
      if (normalizedLimit && !normalizedSearch) {
        query = query.limit(normalizedLimit);
      }

      const result = await query;
      if (result.length === 0) {
        return [];
      }

      const latestBooks = await this.db
        .select({
          clubId: clubBooks.clubId,
          title: clubBooks.title,
          author: clubBooks.author,
          coverUrl: clubBooks.coverUrl,
        })
        .from(clubBooks)
        .where(and(
          inArray(clubBooks.clubId, result.map((club) => club.id)),
          eq(clubBooks.isDeleted, false),
        ))
        .orderBy(desc(clubBooks.uploadedAt));

      const latestBookMap = new Map<string, { title: string | null; author: string | null; coverUrl: string | null }>();
      for (const book of latestBooks) {
        if (!latestBookMap.has(book.clubId)) {
          latestBookMap.set(book.clubId, {
            title: book.title ?? null,
            author: book.author ?? null,
            coverUrl: book.coverUrl ?? null,
          });
        }
      }

      const catalogClubs = result.map((club) => ({
        id: club.id,
        title: club.title,
        description: club.description ?? null,
        coverImage: club.coverImage ?? null,
        bookTitle: latestBookMap.get(club.id)?.title ?? null,
        author: latestBookMap.get(club.id)?.author ?? null,
        bookCoverUrl: latestBookMap.get(club.id)?.coverUrl ?? null,
      }));

      const filtered = normalizedSearch
        ? catalogClubs.filter((club) => {
            const title = club.title.toLowerCase();
            const description = (club.description ?? '').toLowerCase();
            const bookTitle = (club.bookTitle ?? '').toLowerCase();
            const author = (club.author ?? '').toLowerCase();

            return title.includes(normalizedSearch)
              || description.includes(normalizedSearch)
              || bookTitle.includes(normalizedSearch)
              || author.includes(normalizedSearch);
          })
        : catalogClubs;

      if (!normalizedLimit) {
        return filtered;
      }

      return filtered.slice(0, normalizedLimit);
    } catch (error) {
      this.logError('getPublicCatalogClubs', error);
      return [];
    }
  }

  /**
   * Получение клуба по ID с валидацией и загрузкой книг
   */
  async getClub(id: string): Promise<ClubWithDetails | undefined> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db
        .select({
          id: clubs.id,
          title: clubs.title,
          description: clubs.description,
          coverImage: clubs.coverImage,
          bookId: clubs.bookId,
          type: clubs.type,
          status: clubs.status,
          isPrivate: clubs.isPrivate,
          maxMembers: clubs.maxMembers,
          isActive: clubs.isActive,
          isLive: clubs.isLive,
          isFeatured: clubs.isFeatured,
          popularityScore: clubs.popularityScore,
          schedule: clubs.schedule,
          settings: clubs.settings,
          archivedAt: clubs.archivedAt,
          archiveReason: clubs.archiveReason,
          ownerId: clubs.ownerId,
          createdAt: clubs.createdAt,
          updatedAt: clubs.updatedAt,
        })
        .from(clubs)
        .where(eq(clubs.id, id))
        .limit(1);
      
      const club = this.getFirstResult(result);
      if (!club) {
        return undefined;
      }

      // Загружаем книги клуба (только не удалённые)
      const books = await this.db
        .select()
        .from(clubBooks)
        .where(
          and(
            eq(clubBooks.clubId, id),
            eq(clubBooks.isDeleted, false)
          )
        )
        .orderBy(desc(clubBooks.uploadedAt));

      // Загружаем владельца
      const ownerResult = await this.db
        .select()
        .from(users)
        .where(eq(users.id, club.ownerId))
        .limit(1);
      
      const owner = this.getFirstResult(ownerResult);

      // Получаем количество участников
      const memberCountResult = await this.db
        .select({ count: count() })
        .from(clubMembers)
        .where(eq(clubMembers.clubId, id));
      
      const memberCount = memberCountResult[0]?.count || 0;

      // Теги клуба
      const clubTagsResult = await this.db
        .select({ slug: tags.slug })
        .from(clubTags)
        .innerJoin(tags, eq(clubTags.tagId, tags.id))
        .where(eq(clubTags.clubId, id));

      // Возвращаем клуб со всеми данными
      return {
        ...club,
        book: books.find(b => b.id === club.bookId) || null,
        books: books,
        owner: owner || null,
        memberCount: Number(memberCount),
        tags: clubTagsResult.map(t => t.slug),
      } as ClubWithDetails;
    } catch (error) {
      this.logError('getClub', error);
      return undefined;
    }
  }

  /**
   * Получение клуба по названию для проверки уникальности
   */
  async getClubByTitle(title: string): Promise<Club | undefined> {
    this.validateRequired(title, 'title');
    
    try {
      const result = await this.db
        .select()
        .from(clubs)
        .where(eq(clubs.title, title))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getClubByTitle', error);
      return undefined;
    }
  }

  /**
   * Получение клубов пользователя через участие
   */
  async getClubsByUser(userId: string): Promise<ClubWithDetails[]> {
    this.validateRequired(userId, 'userId');
    
    try {
      const clubsData = await this.db
        .select({ club: clubs })
        .from(clubs)
        .innerJoin(clubMembers, eq(clubs.id, clubMembers.clubId))
        .where(eq(clubMembers.userId, userId))
        .orderBy(desc(clubs.createdAt));

      return this.enrichClubList(clubsData.map((row) => row.club));
    } catch (error) {
      this.logError('getClubsByUser', error);
      return [];
    }
  }

  /**
   * Получение клубов, которыми владеет пользователь
   */
  async getClubsOwnedByUser(userId: string): Promise<Club[]> {
    this.validateRequired(userId, 'userId');
    
    try {
      return await this.db
        .select()
        .from(clubs)
        .where(eq(clubs.ownerId, userId))
        .orderBy(desc(clubs.createdAt));
    } catch (error) {
      this.logError('getClubsOwnedByUser', error);
      return [];
    }
  }

  /**
   * Создание клуба с автоматическим добавлением владельца как участника
   * Архитектурное решение: транзакционная безопасность
   */
  async createClub(club: InsertClub & { ownerId: string }): Promise<Club> {
    this.validateRequired(club.title, 'title');
    this.validateRequired(club.ownerId, 'ownerId');
    
    try {
      // Создаем клуб (createdAt/updatedAt устанавливаются автоматически)
      const insertData = club as typeof clubs.$inferInsert;
      const result = await this.db
        .insert(clubs)
        .values(insertData)
        .returning();
      
      const newClub = this.getFirstResult(result);
      if (!newClub) {
        throw new Error('CRITICAL: Club creation failed - no result returned');
      }
      
      // Добавляем владельца как участника с ролью owner
      await this.joinClub(newClub.id, club.ownerId, 'owner');
      
      return newClub;
    } catch (error) {
      this.logError('createClub', error);
      throw error;
    }
  }

  /**
   * Обновление метаданных клуба
   */
  async updateClub(id: string, updates: Partial<InsertClub>): Promise<Club | undefined> {
    this.validateRequired(id, 'id');
    
    try {
      const updateData = updates as Partial<typeof clubs.$inferInsert>;
      const result = await this.db
        .update(clubs)
        .set(updateData)
        .where(eq(clubs.id, id))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateClub', error);
      return undefined;
    }
  }

  /**
   * Удаление клуба с каскадным удалением связанных данных
   */
  async deleteClub(id: string): Promise<boolean> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db.transaction(async (tx) => {
        const clubBookRows = await tx
          .select({ id: clubBooks.id })
          .from(clubBooks)
          .where(eq(clubBooks.clubId, id));

        const clubBookIds = clubBookRows.map((row) => row.id);

        if (clubBookIds.length > 0) {
          await tx
            .delete(bookReadingStatus)
            .where(and(
              inArray(bookReadingStatus.bookId, clubBookIds),
              eq(bookReadingStatus.bookType, 'club')
            ));

          await tx
            .delete(bookAccessLogs)
            .where(and(
              inArray(bookAccessLogs.bookId, clubBookIds),
              eq(bookAccessLogs.bookType, 'club')
            ))
            .catch((error: unknown) => {
              const pgError = error as { code?: string };
              if (pgError?.code === '42P01') return;
              throw error;
            });

          await tx
            .delete(analyticsEvents)
            .where(inArray(analyticsEvents.bookId, clubBookIds));
        }

        // Сначала удаляем все связанные данные
        await tx.delete(clubInvitations).where(eq(clubInvitations.clubId, id));
        await tx.delete(clubMembers).where(eq(clubMembers.clubId, id));
        
        // Затем удаляем сам клуб
        return await tx
          .delete(clubs)
          .where(eq(clubs.id, id))
          .returning();
      });
      
      return result.length > 0;
    } catch (error) {
      this.logError('deleteClub', error);
      return false;
    }
  }

  // =================================================================
  // Club Membership Management - подответственность в рамках Club domain
  // =================================================================

  /**
   * Вступление в клуб с обновлением счетчика участников
   */
  async joinClub(clubId: string, userId: string, role: ClubMemberRole = 'member'): Promise<ClubMember> {
    this.validateRequired(clubId, 'clubId');
    this.validateRequired(userId, 'userId');
    
    try {
      // Проверяем, не является ли пользователь уже участником
      const existingMember = await this.getUserClubMembership(clubId, userId);
      if (existingMember) {
        throw new Error('User is already a member of this club');
      }
      
      // Добавляем участника
      const result = await this.db
        .insert(clubMembers)
        .values({
          clubId,
          userId,
          role,
          joinedAt: new Date()
        })
        .returning();
      
      const newMember = this.getFirstResult(result);
      if (!newMember) {
        throw new Error('CRITICAL: Club membership creation failed');
      }
      
      // Обновляем счетчик участников
      await this.updateMemberCount(clubId);
      
      return newMember;
    } catch (error) {
      this.logError('joinClub', error);
      throw error;
    }
  }

  /**
   * Выход из клуба с обновлением счетчика
   */
  async leaveClub(clubId: string, userId: string): Promise<boolean> {
    this.validateRequired(clubId, 'clubId');
    this.validateRequired(userId, 'userId');
    
    try {
      const result = await this.db
        .delete(clubMembers)
        .where(and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.userId, userId)
        ))
        .returning();
      
      if (result.length > 0) {
        await this.updateMemberCount(clubId);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logError('leaveClub', error);
      return false;
    }
  }

  /**
   * Получение участников клуба
   */
  async getClubMembers(clubId: string): Promise<User[]> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      return await this.db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          status: users.status,
          emailConfirmed: users.emailConfirmed,
          createdAt: users.createdAt
        })
        .from(users)
        .innerJoin(clubMembers, eq(users.id, clubMembers.userId))
        .where(eq(clubMembers.clubId, clubId)) as User[];
    } catch (error) {
      this.logError('getClubMembers', error);
      return [];
    }
  }

  /**
   * Получение участников с их ролями в клубе
   */
  async getClubMembersWithRoles(clubId: string): Promise<Array<Omit<User, 'role'> & { role: ClubMemberRole; joinedAt: Date }>> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      return await this.db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: clubMembers.role,
          joinedAt: clubMembers.joinedAt,
          status: users.status,
          emailConfirmed: users.emailConfirmed,
          createdAt: users.createdAt
        })
        .from(users)
        .innerJoin(clubMembers, eq(users.id, clubMembers.userId))
        .where(eq(clubMembers.clubId, clubId)) as Array<Omit<User, 'role'> & { role: ClubMemberRole; joinedAt: Date }>;
    } catch (error) {
      this.logError('getClubMembersWithRoles', error);
      return [];
    }
  }

  /**
   * Получение информации об участии пользователя в клубе
   */
  async getUserClubMembership(clubId: string, userId: string): Promise<ClubMember | undefined> {
    this.validateRequired(clubId, 'clubId');
    this.validateRequired(userId, 'userId');
    
    try {
      const result = await this.db
        .select()
        .from(clubMembers)
        .where(and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.userId, userId)
        ))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserClubMembership', error);
      return undefined;
    }
  }

  /**
   * Подсчет активных участников клуба
   */
  async getActiveClubMembersCount(clubId: string, excludeUserId?: string): Promise<number> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      const conditions = [eq(clubMembers.clubId, clubId)];
      
      if (excludeUserId) {
        conditions.push(sql`${clubMembers.userId} != ${excludeUserId}`);
      }
      
      const result = await this.db
        .select({ count: count() })
        .from(clubMembers)
        .where(and(...conditions));
      
      return this.getFirstResult(result)?.count || 0;
    } catch (error) {
      this.logError('getActiveClubMembersCount', error);
      return 0;
    }
  }

  /**
   * Обновление роли участника клуба
   */
  async updateMemberRole(clubId: string, userId: string, role: ClubMemberRole): Promise<ClubMember | undefined> {
    this.validateRequired(clubId, 'clubId');
    this.validateRequired(userId, 'userId');
    this.validateRequired(role, 'role');
    
    try {
      const result = await this.db
        .update(clubMembers)
        .set({ role })
        .where(and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.userId, userId)
        ))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateMemberRole', error);
      return undefined;
    }
  }

  /**
   * Удаление участника из клуба
   */
  async removeMember(clubId: string, userId: string): Promise<boolean> {
    return await this.leaveClub(clubId, userId);
  }

  /**
   * Обновление счетчика участников клуба
   * АРХИТЕКТУРНОЕ РЕШЕНИЕ: memberCount не хранится в БД, вычисляется динамически
   * Этот метод оставлен для будущей совместимости, если потребуется кеширование
   */
  private async updateMemberCount(clubId: string): Promise<void> {
    try {
      // В текущей архитектуре memberCount не хранится в БД
      // Счетчик участников вычисляется динамически через getActiveClubMembersCount
      // Метод оставлен как placeholder для будущих улучшений производительности
      logger.debug({ clubId }, 'Member count update triggered (currently no-op)');
    } catch (error) {
      this.logError('updateMemberCount', error);
    }
  }

  // =================================================================
  // Club Invitations Management - подответственность в рамках Club domain
  // =================================================================

  /**
   * Создание приглашения в клуб
   */
  async createClubInvitation(invitation: InsertClubInvitation): Promise<ClubInvitation> {
    this.validateRequired(invitation.clubId, 'clubId');
    this.validateRequired(invitation.email, 'email');
    this.validateRequired(invitation.inviteToken, 'inviteToken');
    
    try {
      const result = await this.db
        .insert(clubInvitations)
        .values({
          ...invitation,
          createdAt: new Date()
        })
        .returning();
      
      const newInvitation = this.getFirstResult(result);
      if (!newInvitation) {
        throw new Error('CRITICAL: Club invitation creation failed');
      }
      
      return newInvitation;
    } catch (error) {
      this.logError('createClubInvitation', error);
      throw error;
    }
  }

  /**
   * Получение приглашения по токену
   */
  async getClubInvitation(inviteToken: string): Promise<ClubInvitation | undefined> {
    this.validateRequired(inviteToken, 'inviteToken');
    
    try {
      const result = await this.db
        .select()
        .from(clubInvitations)
        .where(eq(clubInvitations.inviteToken, inviteToken))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getClubInvitation', error);
      return undefined;
    }
  }

  /**
   * Получение всех приглашений клуба
   */
  async getClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      return await this.db
        .select()
        .from(clubInvitations)
        .where(eq(clubInvitations.clubId, clubId))
        .orderBy(desc(clubInvitations.createdAt));
    } catch (error) {
      this.logError('getClubInvitations', error);
      return [];
    }
  }

  /**
   * Обновление статуса приглашения
   */
  async updateInvitationStatus(inviteToken: string, status: InvitationStatus, acceptedAt?: Date): Promise<boolean> {
    this.validateRequired(inviteToken, 'inviteToken');
    this.validateRequired(status, 'status');
    
    try {
      const updateData: Partial<typeof clubInvitations.$inferInsert> = { status };
      if (acceptedAt) {
        updateData.acceptedAt = acceptedAt;
      }
      
      const result = await this.db
        .update(clubInvitations)
        .set(updateData)
        .where(eq(clubInvitations.inviteToken, inviteToken))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('updateInvitationStatus', error);
      return false;
    }
  }

  /**
   * Удаление приглашения
   */
  async deleteClubInvitation(id: string): Promise<boolean> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db
        .delete(clubInvitations)
        .where(eq(clubInvitations.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('deleteClubInvitation', error);
      return false;
    }
  }

  /**
   * Удаление приглашений по email для конкретного клуба
   */
  async deleteClubInvitationsByEmail(clubId: string, email: string): Promise<number> {
    this.validateRequired(clubId, 'clubId');
    this.validateRequired(email, 'email');
    
    try {
      const result = await this.db
        .delete(clubInvitations)
        .where(and(
          eq(clubInvitations.clubId, clubId),
          eq(clubInvitations.email, email)
        ))
        .returning();
      
      return result.length;
    } catch (error) {
      this.logError('deleteClubInvitationsByEmail', error);
      return 0;
    }
  }

  // =================================================================
  // Club Moderation - модерация клубов
  // =================================================================

  /**
   * Получение клубов на модерации
   * Возвращает клубы со статусом 'pending'
   * Сортировка по дате создания (старые первыми)
   */
  async getClubsForModeration(): Promise<ClubWithDetails[]> {
    try {
      const clubsData = await this.db
        .select()
        .from(clubs)
        .where(eq(clubs.status, 'pending'))
        .orderBy(clubs.createdAt); // Старые первыми (приоритет модерации)

      return this.enrichClubList(clubsData, {
        includeBook: false,
        includeTags: false,
      });
    } catch (error) {
      this.logError('getClubsForModeration', error);
      return [];
    }
  }

  /**
   * Одобрить клуб (изменить статус с pending на recruiting)
   */
  async approveClub(clubId: string): Promise<Club | undefined> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      const result = await this.db
        .update(clubs)
        .set({ 
          status: 'recruiting',
          updatedAt: new Date()
        })
        .where(and(
          eq(clubs.id, clubId),
          eq(clubs.status, 'pending') // Можно одобрить только pending клубы
        ))
        .returning();
      
      const approved = this.getFirstResult(result);
      if (approved) {
        logger.info({ clubId, clubTitle: approved.title }, 'Club approved by moderator');
      }
      return approved;
    } catch (error) {
      this.logError('approveClub', error);
      return undefined;
    }
  }

  /**
   * Отклонить клуб (изменить статус с pending на archived)
   */
  async rejectClub(clubId: string, reason?: string): Promise<Club | undefined> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      const result = await this.db
        .update(clubs)
        .set({ 
          status: 'archived',
          archivedAt: new Date(),
          archiveReason: reason || 'Отклонено модератором',
          updatedAt: new Date()
        })
        .where(and(
          eq(clubs.id, clubId),
          eq(clubs.status, 'pending') // Можно отклонить только pending клубы
        ))
        .returning();
      
      const rejected = this.getFirstResult(result);
      if (rejected) {
        logger.info({ clubId, clubTitle: rejected.title, reason }, 'Club rejected by moderator');
      }
      return rejected;
    } catch (error) {
      this.logError('rejectClub', error);
      return undefined;
    }
  }

  /**
   * Обновить popularity score клуба
   */
  async updateClubPopularityScore(clubId: string, score: number): Promise<boolean> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      const result = await this.db
        .update(clubs)
        .set({ 
          popularityScore: score,
          updatedAt: new Date()
        })
        .where(eq(clubs.id, clubId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('updateClubPopularityScore', error);
      return false;
    }
  }

  /**
   * Обновить статус приватности клуба (isPrivate)
   * @param clubId ID клуба
   * @param isPrivate Новое значение приватности (true = закрытый, false = публичный)
   */
  async updateClubPrivacy(clubId: string, isPrivate: boolean): Promise<Club | undefined> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      const result = await this.db
        .update(clubs)
        .set({ 
          isPrivate,
          updatedAt: new Date()
        })
        .where(eq(clubs.id, clubId))
        .returning();
      
      const updated = this.getFirstResult(result);
      if (updated) {
        logger.info({ clubId, isPrivate }, 'Club privacy updated');
      }
      return updated;
    } catch (error) {
      this.logError('updateClubPrivacy', error);
      return undefined;
    }
  }
}
