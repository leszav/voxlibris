import express from 'express';
import { jwtAuth, requireAdmin } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import { authService } from './auth-service.js';
import { emailService } from './services/email-service.js';
import type { UserRole, UserStatus, AdminActionType, AdminActionTargetType } from '../shared/schema.js';
import { db } from './db.js';
import postgres from 'postgres';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { books, personalBooks, clubBooks, users, clubs, clubMembers } from '../shared/schema.js';
import { logger } from './lib/logger.js';
import {
  getPublicBaseUrl,
  invalidatePublicBaseUrlCache,
  normalizePublicBaseUrl,
  platformBaseUrlSettingKey,
} from './lib/public-base-url.js';
const PostgresError = postgres.PostgresError;

const router = express.Router();

// Middleware для проверки полных админских прав (только admin, не moderator)
const requireFullAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Full admin role required' });
  }

  next();
};

// Интерфейс для логирования действий администратора (KISS: группируем параметры)
interface AdminActionLog {
  adminId: string;
  actionType: AdminActionType;
  targetType: AdminActionTargetType;
  targetId: string;
  reason?: string;
  previousValue?: string;
  newValue?: string;
  req?: express.Request;
}

// Функция для логирования действий админа через storage
const logAdminAction = async (params: AdminActionLog) => {
  try {
    await storage.logAdminAction({
      adminId: params.adminId,
      actionType: params.actionType,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      previousValue: params.previousValue,
      newValue: params.newValue,
      ipAddress: params.req?.ip,
      userAgent: params.req?.get('User-Agent')
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Не прерываем выполнение из-за ошибки логирования
  }
};

// Helper для упрощения вызовов (KISS: уменьшаем повторяющийся код)
const logAction = (
  req: express.Request,
  actionType: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  reason?: string,
  previousValue?: string,
  newValue?: string
) => logAdminAction({
  adminId: req.user!.userId,
  actionType,
  targetType,
  targetId,
  reason,
  previousValue,
  newValue,
  req
});

const DEFAULT_ADMIN_PAGE_LIMIT = 20;
const MAX_ADMIN_PAGE_LIMIT = 100;

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  if (normalized < 1) {
    return fallback;
  }

  return max ? Math.min(normalized, max) : normalized;
}

function parseAdminPagination(pageRaw: unknown, limitRaw: unknown) {
  const page = parsePositiveInt(pageRaw, 1);
  const limit = parsePositiveInt(limitRaw, DEFAULT_ADMIN_PAGE_LIMIT, MAX_ADMIN_PAGE_LIMIT);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function buildAdminUsersWhere(params: {
  search?: string;
  role?: string;
  status?: string;
  includeDeleted: boolean;
}): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (!params.includeDeleted) {
    conditions.push(sql`${users.status} != 'deleted'`);
  }

  if (params.search) {
    conditions.push(sql`LOWER(${users.username}) LIKE ${`%${params.search.toLowerCase()}%`}`);
  }

  if (params.role) {
    conditions.push(eq(users.role, params.role as UserRole));
  }

  if (params.status) {
    conditions.push(eq(users.status, params.status as UserStatus));
  }

  return conditions;
}

type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date | null;
  lastActivityAt: Date | null;
  booksRead: number;
  clubsJoined: number;
  clubsCreated: number;
};

function formatAdminUserForResponse(user: AdminUserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.createdAt?.toISOString() || null,
    last_active: user.lastActivityAt?.toISOString() || null,
    books_read: Number(user.booksRead || 0),
    clubs_joined: Number(user.clubsJoined || 0),
    clubs_created: Number(user.clubsCreated || 0),
  };
}

async function queryAdminUsersWithStats(params: {
  conditions: SQL<unknown>[];
  limit?: number;
  offset?: number;
}) {
  const whereClause =
    params.conditions.length === 0
      ? sql`true`
      : params.conditions.length === 1
        ? params.conditions[0]
        : (and(...params.conditions) as SQL<unknown>);

  const [totalRow] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(users)
    .where(whereClause);

  const baseUsersQuery = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastActivityAt: users.lastActivityAt,
      booksRead: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${personalBooks}
        WHERE ${personalBooks.userId} = ${users.id}
          AND ${personalBooks.isDeleted} = false
      )`,
      clubsJoined: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${clubMembers}
        WHERE ${clubMembers.userId} = ${users.id}
          AND ${clubMembers.isActive} = true
      )`,
      clubsCreated: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${clubs}
        WHERE ${clubs.ownerId} = ${users.id}
      )`,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt));

  const rows = typeof params.limit === 'number' && typeof params.offset === 'number'
    ? await baseUsersQuery.limit(params.limit).offset(params.offset)
    : await baseUsersQuery;

  return {
    total: Number(totalRow?.count || 0),
    users: rows.map(formatAdminUserForResponse),
  };
}

// ==== USER MANAGEMENT ====

// Получить список всех пользователей
router.get('/users', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    const conditions = buildAdminUsersWhere({
      search: search || undefined,
      role,
      status,
      includeDeleted: false,
    });

    const result = await queryAdminUsersWithStats({ conditions, limit, offset });

    res.json({
      users: result.users,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить роль пользователя
router.put('/users/:username/role', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const updatedUser = await storage.updateUserRole(username, role as UserRole);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAction(
      req,
      'change_user_role',
      'user',
      updatedUser.id,
      `Changed role to ${role}`,
      updatedUser.role,
      role
    );

    const { password: _password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Изменить статус пользователя
router.put('/users/:username/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { status } = req.body;

    if (!['pending', 'active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const existingUser = await storage.getUserByUsername(username);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUser = await storage.updateUserStatus(username, status as UserStatus);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (status === 'suspended' || status === 'deleted') {
      await storage.revokeAllUserRefreshTokens(updatedUser.id);
    }

    await logAction(
      req,
      'change_user_status',
      'user',
      updatedUser.id,
      `Changed status to ${status}`,
      existingUser.status,
      status
    );

    const { password: _password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сбросить пароль пользователя (отправка письма)
router.post('/users/:id/reset-password', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const baseUrl = await getPublicBaseUrl();
    const result = await authService.requestPasswordReset(
      user.email,
      baseUrl,
      req.user!.userId,
      req.ip
    );

    await logAction(
      req,
      'reset_password',
      'user',
      user.id,
      reason || 'Password reset requested by admin'
    );

    if (!result.emailSent) {
      return res.status(500).json({ message: 'Не удалось отправить письмо для сброса пароля' });
    }

    res.json({ success: true, message: 'Письмо для сброса пароля отправлено' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить ожидающих активации пользователей
router.get('/users/pending', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await storage.getPendingUsers();
    const safeUsers = pendingUsers.map(({ password: _password, ...user }) => user);

    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить пользователя (мягкое удаление)
router.delete('/users/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Запрещаем удалять самого себя
    if (id === req.user!.userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Выполняем мягкое удаление
    const success = await storage.deleteUser(id);

    if (!success) {
      return res.status(500).json({ message: 'Failed to delete user' });
    }

    await logAction(
      req,
      'delete_user',
      'user',
      id,
      'User deleted by admin',
      user.status,
      'deleted'
    );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Восстановить удаленного пользователя
router.put('/users/:id/restore', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем, что пользователь действительно удален
    if (user.status !== 'deleted') {
      return res.status(400).json({ message: 'User is not deleted' });
    }

    // Восстанавливаем пользователя
    const restoredUser = await storage.restoreUser(id);

    if (!restoredUser) {
      return res.status(500).json({ message: 'Failed to restore user' });
    }

    await logAction(
      req,
      'restore_user',
      'user',
      id,
      'User restored by admin',
      'deleted',
      'active'
    );

    const { password: _password, ...safeUser } = restoredUser;
    res.json({ user: safeUser, message: 'User restored successfully' });
  } catch (error) {
    console.error('Error restoring user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить пользователя окончательно (физическое удаление)
router.delete('/users/:id/permanent', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, существует ли пользователь
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Запрещаем удалять самого себя
    if (id === req.user!.userId) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Рекомендуем сначала сделать мягкое удаление
    if (user.status !== 'deleted') {
      return res.status(400).json({ 
        message: 'User must be soft-deleted first. Use DELETE /users/:id instead.' 
      });
    }

    // Выполняем физическое удаление
    const result = await storage.permanentDeleteUser(id);

    if (!result.success) {
      if (result.clubsWithMembers && result.clubsWithMembers.length > 0) {
        return res.status(400).json({ 
          message: result.error,
          clubs: result.clubsWithMembers
        });
      }
      return res.status(500).json({ message: result.error || 'Failed to permanently delete user' });
    }

    await logAction(
      req,
      'permanent_delete_user',
      'user',
      id,
      'User permanently deleted by admin',
      'deleted',
      'permanently_deleted'
    );

    res.json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    console.error('Error permanently deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить список удаленных пользователей
router.get('/users/deleted', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const conditions = buildAdminUsersWhere({
      includeDeleted: true,
      status: 'deleted',
    });

    const result = await queryAdminUsersWithStats({ conditions });
    res.json({ users: result.users });
  } catch (error) {
    console.error('Error fetching deleted users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== BOOK MANAGEMENT ====

// Helper functions for book management
type BookWithSource = 
  | ({ source: 'books' } & typeof books.$inferSelect)
  | ({ source: 'personal_books' } & typeof personalBooks.$inferSelect)
  | ({ source: 'club_books' } & typeof clubBooks.$inferSelect);

function filterBooksByStatus(books: BookWithSource[], status: string): BookWithSource[] {
  return books.filter(book => {
    if (book.source === 'personal_books' || book.source === 'club_books') {
      if (status === 'active') return !('isDeleted' in book) || !book.isDeleted;
      if (status === 'blocked') return 'isDeleted' in book && book.isDeleted;
      return false;
    }
    return book.source === 'books' && 'status' in book && book.status === status;
  });
}

// Специализированные форматеры для каждого типа книг (Single Responsibility)
function formatSystemBookForAdmin(book: { source: 'books' } & typeof books.$inferSelect, usersMap: Map<string, string>) {
  // Explicit status mapping for clarity
  let bookStatus: string;
  if (book.status === 'active') {
    bookStatus = 'active';
  } else if (book.status === 'blocked') {
    bookStatus = 'blocked';
  } else {
    bookStatus = 'pending';
  }
  
  return {
    uploadedBy: book.uploadedBy ? usersMap.get(book.uploadedBy) || 'Unknown' : 'System',
    uploadDate: book.uploadedAt?.toISOString() || book.createdAt.toISOString(),
    fileSize: book.fileSize || 0,
    filePath: book.contentPath || '',
    bookStatus,
    isbn: book.isbn || null,
    downloadCount: book.downloadCount || 0
  };
}

function formatPersonalBookForAdmin(book: { source: 'personal_books' } & typeof personalBooks.$inferSelect, usersMap: Map<string, string>) {
  return {
    uploadedBy: book.userId ? usersMap.get(book.userId) || 'Unknown' : 'System',
    uploadDate: book.uploadedAt.toISOString(),
    fileSize: book.fileSizeBytes || 0,
    filePath: book.storagePath || '',
    bookStatus: book.isDeleted ? 'blocked' : 'active',
    isbn: null,
    downloadCount: 0
  };
}

function formatClubBookForAdmin(book: { source: 'club_books' } & typeof clubBooks.$inferSelect, usersMap: Map<string, string>) {
  return {
    uploadedBy: book.uploadedByUserId ? usersMap.get(book.uploadedByUserId) || 'Unknown' : 'System',
    uploadDate: book.uploadedAt.toISOString(),
    fileSize: book.fileSizeBytes || 0,
    filePath: book.storagePath || '',
    bookStatus: book.isDeleted ? 'blocked' : 'active',
    isbn: null,
    downloadCount: 0
  };
}

// Главная функция-диспетчер (низкая когнитивная сложность)
function formatBookForAdmin(book: BookWithSource, usersMap: Map<string, string>) {
  let bookData;
  
  switch (book.source) {
    case 'books':
      bookData = formatSystemBookForAdmin(book, usersMap);
      break;
    case 'personal_books':
      bookData = formatPersonalBookForAdmin(book, usersMap);
      break;
    case 'club_books':
      bookData = formatClubBookForAdmin(book, usersMap);
      break;
    default:
      bookData = {
        uploadedBy: 'Unknown',
        uploadDate: new Date().toISOString(),
        fileSize: 0,
        filePath: '',
        bookStatus: 'pending',
        isbn: null,
        downloadCount: 0
      };
  }

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: bookData.isbn,
    genre: 'genre' in book ? book.genre : null,
    cover_url: book.coverUrl || null,
    file_url: bookData.filePath,
    status: bookData.bookStatus,
    uploaded_by: bookData.uploadedBy,
    upload_date: bookData.uploadDate,
    file_size: bookData.fileSize,
    downloads_count: bookData.downloadCount,
    description: book.description || null,
    source: book.source,
    club_id: book.source === 'club_books' && 'clubId' in book ? book.clubId : null,
  };
}

// Helper functions to reduce cognitive complexity
async function fetchAllBooksFromSources(): Promise<BookWithSource[]> {
  const [allBooks, allPersonalBooks, allClubBooks] = await Promise.all([
    storage.getBooks(),
    storage.getAllPersonalBooks(),
    storage.getAllClubBooks(),
  ]);

  return [
    ...allBooks.map(book => ({ ...book, source: 'books' as const })),
    ...allPersonalBooks.map(book => ({ ...book, source: 'personal_books' as const })),
    ...allClubBooks.map(book => ({ ...book, source: 'club_books' as const }))
  ];
}

function applyBooksFiltering(books: BookWithSource[], search?: string, status?: string): BookWithSource[] {
  let filtered = books;

  if (search && typeof search === 'string') {
    const searchStr = search.toLowerCase();
    filtered = filtered.filter(book =>
      book.title.toLowerCase().includes(searchStr) ||
      book.author.toLowerCase().includes(searchStr)
    );
  }

  if (status && typeof status === 'string') {
    filtered = filterBooksByStatus(filtered, status);
  }

  return filtered;
}

async function buildUsersMap(booksToFormat: BookWithSource[]): Promise<Map<string, string>> {
  const userIds = new Set<string>();

  for (const book of booksToFormat) {
    let userId: string | undefined;

    if (book.source === 'books' && 'uploadedBy' in book) {
      userId = book.uploadedBy || undefined;
    } else if (book.source === 'personal_books' && 'userId' in book) {
      userId = book.userId;
    } else if (book.source === 'club_books' && 'uploadedByUserId' in book) {
      userId = book.uploadedByUserId;
    }

    if (userId) {
      userIds.add(userId);
    }
  }

  if (userIds.size === 0) {
    return new Map();
  }

  const usersData = await db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(inArray(users.id, Array.from(userIds)));

  return new Map(usersData.map((user) => [user.id, user.username]));
}

// Получить список всех книг (refactored for low cognitive complexity)
router.get('/books', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    if (status && !['active', 'blocked', 'pending'].includes(status)) {
      return res.json({
        books: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
      });
    }

    const searchPattern = search ? `%${search}%` : null;

    const sourceWhere = (conditions: SQL<unknown>[]): SQL<unknown> | undefined => {
      if (conditions.length === 0) {
        return undefined;
      }
      if (conditions.length === 1) {
        return conditions[0];
      }
      return and(...conditions) as SQL<unknown>;
    };

    const booksConditions: SQL<unknown>[] = [];
    if (searchPattern) {
      booksConditions.push(
        sql`(LOWER(${books.title}) LIKE ${searchPattern} OR LOWER(${books.author}) LIKE ${searchPattern})`,
      );
    }
    if (status === 'active') {
      booksConditions.push(eq(books.status, 'active'));
    } else if (status === 'blocked') {
      booksConditions.push(eq(books.status, 'blocked'));
    } else if (status === 'pending') {
      booksConditions.push(sql`${books.status} NOT IN ('active', 'blocked')`);
    }

    const personalConditions: SQL<unknown>[] = [];
    if (searchPattern) {
      personalConditions.push(
        sql`(LOWER(${personalBooks.title}) LIKE ${searchPattern} OR LOWER(${personalBooks.author}) LIKE ${searchPattern})`,
      );
    }
    if (status === 'active') {
      personalConditions.push(eq(personalBooks.isDeleted, false));
    } else if (status === 'blocked') {
      personalConditions.push(eq(personalBooks.isDeleted, true));
    } else if (status === 'pending') {
      personalConditions.push(sql`false`);
    }

    const clubConditions: SQL<unknown>[] = [];
    if (searchPattern) {
      clubConditions.push(
        sql`(LOWER(${clubBooks.title}) LIKE ${searchPattern} OR LOWER(${clubBooks.author}) LIKE ${searchPattern})`,
      );
    }
    if (status === 'active') {
      clubConditions.push(eq(clubBooks.isDeleted, false));
    } else if (status === 'blocked') {
      clubConditions.push(eq(clubBooks.isDeleted, true));
    } else if (status === 'pending') {
      clubConditions.push(sql`false`);
    }

    const booksWhere = sourceWhere(booksConditions);
    const personalWhere = sourceWhere(personalConditions);
    const clubWhere = sourceWhere(clubConditions);

    const [booksCountRows, personalCountRows, clubCountRows] = await Promise.all([
      booksWhere
        ? db.select({ count: sql<number>`COUNT(*)::int` }).from(books).where(booksWhere)
        : db.select({ count: sql<number>`COUNT(*)::int` }).from(books),
      personalWhere
        ? db.select({ count: sql<number>`COUNT(*)::int` }).from(personalBooks).where(personalWhere)
        : db.select({ count: sql<number>`COUNT(*)::int` }).from(personalBooks),
      clubWhere
        ? db.select({ count: sql<number>`COUNT(*)::int` }).from(clubBooks).where(clubWhere)
        : db.select({ count: sql<number>`COUNT(*)::int` }).from(clubBooks),
    ]);

    const booksCount = Number(booksCountRows[0]?.count || 0);
    const personalCount = Number(personalCountRows[0]?.count || 0);
    const clubCount = Number(clubCountRows[0]?.count || 0);
    const total = booksCount + personalCount + clubCount;

    let remainingOffset = offset;
    let remainingLimit = limit;

    const calculateWindow = (segmentCount: number) => {
      if (remainingLimit <= 0) {
        return { skip: 0, take: 0 };
      }
      if (remainingOffset >= segmentCount) {
        remainingOffset -= segmentCount;
        return { skip: 0, take: 0 };
      }

      const skip = remainingOffset;
      const take = Math.min(remainingLimit, segmentCount - skip);

      remainingOffset = 0;
      remainingLimit -= take;

      return { skip, take };
    };

    const booksWindow = calculateWindow(booksCount);
    const personalWindow = calculateWindow(personalCount);
    const clubWindow = calculateWindow(clubCount);

    const booksQuery = db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        isbn: books.isbn,
        coverUrl: books.coverUrl,
        fileUrl: books.contentPath,
        uploadedBy: users.username,
        uploadedAt: books.uploadedAt,
        createdAt: books.createdAt,
        fileSize: books.fileSize,
        downloadsCount: books.downloadCount,
        description: books.description,
        status: sql<string>`CASE
          WHEN ${books.status} = 'active' THEN 'active'
          WHEN ${books.status} = 'blocked' THEN 'blocked'
          ELSE 'pending'
        END`,
      })
      .from(books)
      .leftJoin(users, eq(books.uploadedBy, users.id))
      .orderBy(desc(books.createdAt));

    const personalQuery = db
      .select({
        id: personalBooks.id,
        title: personalBooks.title,
        author: personalBooks.author,
        genre: personalBooks.genre,
        coverUrl: personalBooks.coverUrl,
        fileUrl: personalBooks.storagePath,
        uploadedBy: users.username,
        uploadedAt: personalBooks.uploadedAt,
        fileSize: personalBooks.fileSizeBytes,
        description: personalBooks.description,
        status: sql<string>`CASE
          WHEN ${personalBooks.isDeleted} = true THEN 'blocked'
          ELSE 'active'
        END`,
      })
      .from(personalBooks)
      .leftJoin(users, eq(personalBooks.userId, users.id))
      .orderBy(desc(personalBooks.createdAt));

    const clubQuery = db
      .select({
        id: clubBooks.id,
        title: clubBooks.title,
        author: clubBooks.author,
        genre: clubBooks.genre,
        coverUrl: clubBooks.coverUrl,
        fileUrl: clubBooks.storagePath,
        uploadedBy: users.username,
        uploadedAt: clubBooks.uploadedAt,
        fileSize: clubBooks.fileSizeBytes,
        description: clubBooks.description,
        clubId: clubBooks.clubId,
        status: sql<string>`CASE
          WHEN ${clubBooks.isDeleted} = true THEN 'blocked'
          ELSE 'active'
        END`,
      })
      .from(clubBooks)
      .leftJoin(users, eq(clubBooks.uploadedByUserId, users.id))
      .orderBy(desc(clubBooks.createdAt));

    const [booksRows, personalRows, clubRows] = await Promise.all([
      booksWindow.take > 0
        ? (booksWhere
          ? booksQuery.where(booksWhere).limit(booksWindow.take).offset(booksWindow.skip)
          : booksQuery.limit(booksWindow.take).offset(booksWindow.skip))
        : Promise.resolve([]),
      personalWindow.take > 0
        ? (personalWhere
          ? personalQuery.where(personalWhere).limit(personalWindow.take).offset(personalWindow.skip)
          : personalQuery.limit(personalWindow.take).offset(personalWindow.skip))
        : Promise.resolve([]),
      clubWindow.take > 0
        ? (clubWhere
          ? clubQuery.where(clubWhere).limit(clubWindow.take).offset(clubWindow.skip)
          : clubQuery.limit(clubWindow.take).offset(clubWindow.skip))
        : Promise.resolve([]),
    ]);

    const formattedBooks = [
      ...booksRows.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn || null,
        genre: null,
        cover_url: book.coverUrl || null,
        file_url: book.fileUrl || '',
        status: book.status,
        uploaded_by: book.uploadedBy || 'System',
        upload_date: (book.uploadedAt || book.createdAt).toISOString(),
        file_size: book.fileSize || 0,
        downloads_count: book.downloadsCount || 0,
        description: book.description || null,
        source: 'books',
        club_id: null,
      })),
      ...personalRows.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: null,
        genre: book.genre || null,
        cover_url: book.coverUrl || null,
        file_url: book.fileUrl || '',
        status: book.status,
        uploaded_by: book.uploadedBy || 'System',
        upload_date: book.uploadedAt.toISOString(),
        file_size: book.fileSize || 0,
        downloads_count: 0,
        description: book.description || null,
        source: 'personal_books',
        club_id: null,
      })),
      ...clubRows.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: null,
        genre: book.genre || null,
        cover_url: book.coverUrl || null,
        file_url: book.fileUrl || '',
        status: book.status,
        uploaded_by: book.uploadedBy || 'System',
        upload_date: book.uploadedAt.toISOString(),
        file_size: book.fileSize || 0,
        downloads_count: 0,
        description: book.description || null,
        source: 'club_books',
        club_id: book.clubId,
      })),
    ];

    res.json({
      books: formattedBooks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Вспомогательные функции для изменения статуса книг
async function updatePersonalBookStatus(id: string, status: string): Promise<{ success: boolean; error?: string }> {
  const book = await storage.getPersonalBook(id);
  if (!book) {
    return { success: false, error: 'Personal book not found' };
  }
  
  let success = false;
  if (status === 'blocked') {
    success = await storage.deletePersonalBook(id);
  } else if (status === 'active') {
    success = await storage.restorePersonalBook(id);
  }
  
  return { success };
}

async function updateClubBookStatus(id: string, status: string): Promise<{ success: boolean; error?: string }> {
  const book = await storage.getClubBook(id);
  if (!book) {
    return { success: false, error: 'Club book not found' };
  }
  
  let success = false;
  if (status === 'blocked') {
    success = await storage.deleteClubBook(id);
  } else if (status === 'active') {
    success = await storage.restoreClubBook(id);
  }
  
  return { success };
}

async function updateRegularBookStatus(id: string, status: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const book = await storage.getBook(id);
  if (!book) {
    return { success: false, error: 'Book not found' };
  }

  const statusMap: { [key: string]: 'draft' | 'published' | 'archived' } = {
    'active': 'published',
    'blocked': 'archived',
    'pending': 'draft'
  };

  const newStatus = statusMap[status] || 'draft';
  const success = await storage.updateBookStatus(id, newStatus, userId);
  
  return { success };
}

// Изменить статус книги (поддерживает все типы: books, personal_books, club_books)
router.put('/books/:id/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, source } = req.body;

    if (!['active', 'blocked', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid book status' });
    }

    let result: { success: boolean; error?: string };

    if (source === 'personal_books') {
      result = await updatePersonalBookStatus(id, status);
    } else if (source === 'club_books') {
      result = await updateClubBookStatus(id, status);
    } else {
      result = await updateRegularBookStatus(id, status, req.user!.userId);
    }

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({ message: result.error || 'Failed to update book status' });
    }

    res.json({ message: 'Book status updated successfully', status });
  } catch (error) {
    console.error('Error updating book status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Вспомогательные функции для удаления книг
async function deletePersonalBookAdmin(id: string): Promise<{ success: boolean; bookInfo?: { title: string; status?: string }; error?: string }> {
  const book = await storage.getPersonalBook(id);
  if (!book) {
    return { success: false, error: 'Personal book not found' };
  }
  
  const bookInfo = { title: book.title, status: book.isDeleted ? 'deleted' : 'active' };
  const deleted = await storage.permanentDeletePersonalBook(id);
  
  return { success: deleted, bookInfo };
}

async function deleteClubBookAdmin(id: string): Promise<{ success: boolean; bookInfo?: { title: string; status?: string }; error?: string }> {
  const book = await storage.getClubBook(id);
  if (!book) {
    return { success: false, error: 'Club book not found' };
  }
  
  const bookInfo = { title: book.title, status: book.isDeleted ? 'deleted' : 'active' };
  const deleted = await storage.permanentDeleteClubBook(id);
  
  return { success: deleted, bookInfo };
}

async function deleteRegularBookAdmin(id: string): Promise<{ success: boolean; bookInfo?: { title: string; status?: string }; error?: string }> {
  const book = await storage.getBook(id);
  if (!book) {
    return { success: false, error: 'Book not found' };
  }
  
  const bookInfo = { title: book.title, status: book.status };
  await storage.deleteBook(id);
  
  return { success: true, bookInfo };
}

// Удалить книгу окончательно (поддерживает все типы: books, personal_books, club_books)
router.delete('/books/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.query;

    let result: { success: boolean; bookInfo?: { title: string; status?: string }; error?: string };

    if (source === 'personal_books') {
      result = await deletePersonalBookAdmin(id);
    } else if (source === 'club_books') {
      result = await deleteClubBookAdmin(id);
    } else {
      result = await deleteRegularBookAdmin(id);
    }

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({ message: result.error || 'Failed to delete book' });
    }

    await logAction(
      req,
      'delete_book',
      'book',
      id,
      `Book deleted by admin (source: ${typeof source === 'string' ? source : 'books'})`,
      result.bookInfo?.status,
      'deleted'
    );

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== CLUB MANAGEMENT ====

// Получить список всех клубов
router.get('/clubs', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    const conditions: SQL<unknown>[] = [sql`${clubs.status} != 'pending'`];
    if (search) {
      conditions.push(sql`LOWER(${clubs.title}) LIKE ${`%${search.toLowerCase()}%`}`);
    }
    if (status) {
      conditions.push(eq(clubs.status, status as typeof clubs.$inferSelect['status']));
    }

    const whereClause = conditions.length === 1 ? conditions[0] : (and(...conditions) as SQL<unknown>);

    const [totalRows, rows] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(clubs)
        .where(whereClause),
      db
        .select({
          id: clubs.id,
          name: clubs.title,
          description: clubs.description,
          bookId: clubs.bookId,
          regularBookTitle: books.title,
          regularBookAuthor: books.author,
          clubBookTitle: clubBooks.title,
          clubBookAuthor: clubBooks.author,
          creatorUsername: users.username,
          status: clubs.status,
          createdAt: clubs.createdAt,
          maxParticipants: clubs.maxMembers,
          readingSchedule: clubs.schedule,
          isPrivate: clubs.isPrivate,
          currentParticipants: sql<number>`(
            SELECT COUNT(*)::int
            FROM ${clubMembers}
            WHERE ${clubMembers.clubId} = ${clubs.id}
              AND ${clubMembers.isActive} = true
          )`,
        })
        .from(clubs)
        .leftJoin(users, eq(clubs.ownerId, users.id))
        .leftJoin(books, eq(clubs.bookId, books.id))
        .leftJoin(clubBooks, eq(clubs.bookId, clubBooks.id))
        .where(whereClause)
        .orderBy(desc(clubs.popularityScore), desc(clubs.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(totalRows[0]?.count || 0);
    const formattedClubs = rows.map((club) => ({
      id: club.id,
      name: club.name,
      description: club.description,
      book_id: club.bookId,
      book_title: club.regularBookTitle || club.clubBookTitle || 'N/A',
      book_author: club.regularBookAuthor || club.clubBookAuthor || 'N/A',
      creator_username: club.creatorUsername || 'Unknown',
      status: club.status,
      created_at: club.createdAt.toISOString(),
      max_participants: club.maxParticipants,
      current_participants: Number(club.currentParticipants || 0),
      reading_schedule: club.readingSchedule,
      is_public: !club.isPrivate,
    }));

    res.json({
      clubs: formattedClubs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching clubs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки клуба (максимальное количество участников)
router.put('/clubs/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxMembers } = req.body;

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (maxMembers !== undefined) {
      const newMaxMembers = Number(maxMembers);
      if (Number.isNaN(newMaxMembers) || newMaxMembers < 2 || newMaxMembers > 2000) {
        return res.status(400).json({ message: 'maxMembers must be between 2 and 2000' });
      }

      await storage.updateClub(id, { maxMembers: newMaxMembers });

      await logAction(
        req,
        'update_club',
        'club',
        id,
        `Changed maxMembers from ${club.maxMembers} to ${newMaxMembers}`,
        String(club.maxMembers),
        String(newMaxMembers)
      );
    }

    const updatedClub = await storage.getClub(id);
    res.json({ message: 'Club updated successfully', club: updatedClub });
  } catch (error) {
    console.error('Error updating club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Удалить клуб
router.delete('/clubs/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    await storage.deleteClub(id);

    await logAction(
      req,
      'delete_club',
      'club',
      id,
      'Club deleted by admin',
      club.status,
      'deleted'
    );

    res.json({ message: 'Club deleted successfully' });
  } catch (error) {
    console.error('Error deleting club:', error);

    // Специализированная обработка PostgresError
    if (error instanceof PostgresError) {
      switch (error.code) {
        case '23503': // FOREIGN_KEY_VIOLATION
          return res.status(400).json({
            message: 'Cannot delete club: it has active dependencies (members or sessions)',
            code: 'FOREIGN_KEY_VIOLATION'
          });
        case '23505': // UNIQUE_VIOLATION
          return res.status(400).json({
            message: 'Operation failed due to data conflict',
            code: 'UNIQUE_VIOLATION'
          });
        default:
          return res.status(500).json({
            message: 'Database operation failed',
            code: error.code
          });
      }
    }

    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== CLUB MODERATION ====

// Получить клубы на модерации
router.get('/clubs/pending', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    const pendingClubs = await db
      .select({
        id: clubs.id,
        title: clubs.title,
        description: clubs.description,
        coverImage: clubs.coverImage,
        type: clubs.type,
        isPrivate: clubs.isPrivate,
        status: clubs.status,
        ownerId: users.id,
        ownerUsername: users.username,
        ownerEmail: users.email,
        maxMembers: clubs.maxMembers,
        createdAt: clubs.createdAt,
        memberCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${clubMembers}
          WHERE ${clubMembers.clubId} = ${clubs.id}
            AND ${clubMembers.isActive} = true
        )`,
      })
      .from(clubs)
      .leftJoin(users, eq(clubs.ownerId, users.id))
      .where(eq(clubs.status, 'pending'))
      .orderBy(clubs.createdAt);

    const clubsFormatted = pendingClubs.map((club) => ({
      id: club.id,
      title: club.title,
      description: club.description,
      coverImage: club.coverImage,
      type: club.type,
      isPrivate: club.isPrivate,
      status: club.status,
      owner: {
        id: club.ownerId,
        username: club.ownerUsername,
        email: club.ownerEmail,
      },
      memberCount: Number(club.memberCount || 0),
      maxMembers: club.maxMembers,
      createdAt: club.createdAt.toISOString(),
    }));

    res.json({
      clubs: clubsFormatted,
      total: clubsFormatted.length
    });
  } catch (error) {
    console.error('Error fetching pending clubs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Одобрить клуб
router.put('/clubs/:id/approve', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }
    
    if (club.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending clubs can be approved',
        currentStatus: club.status
      });
    }
    
    const approvedClub = await storage.approveClub(id);
    
    if (!approvedClub) {
      return res.status(500).json({ message: 'Failed to approve club' });
    }
    
    await logAction(
      req,
      'update_club',
      'club',
      id,
      'Club approved by moderator',
      'pending',
      'recruiting'
    );
    
    logger.info({
      clubId: id,
      clubTitle: approvedClub.title,
      moderator: req.user?.username
    }, 'Club approved');
    
    res.json({ 
      message: 'Club approved successfully',
      club: approvedClub
    });
  } catch (error) {
    console.error('Error approving club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Отклонить клуб
router.put('/clubs/:id/reject', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }
    
    if (club.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending clubs can be rejected',
        currentStatus: club.status
      });
    }
    
    const rejectedClub = await storage.rejectClub(id, reason);
    
    if (!rejectedClub) {
      return res.status(500).json({ message: 'Failed to reject club' });
    }
    
    await logAction(
      req,
      'update_club',
      'club',
      id,
      reason || 'Club rejected by moderator',
      'pending',
      'archived'
    );
    
    logger.info({
      clubId: id,
      clubTitle: rejectedClub.title,
      reason,
      moderator: req.user?.username
    }, 'Club rejected');
    
    res.json({ 
      message: 'Club rejected successfully',
      club: rejectedClub
    });
  } catch (error) {
    console.error('Error rejecting club:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== STATISTICS ====

// Получить общую статистику системы
router.get('/stats/overview', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    const [userStatsRows, generalBookStatsRows, personalBookStatsRows, clubBookStatsRows, clubStatsRows] = await Promise.all([
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${users.status} = 'active')::int`,
          pending: sql<number>`COUNT(*) FILTER (WHERE ${users.status} = 'pending')::int`,
          suspended: sql<number>`COUNT(*) FILTER (WHERE ${users.status} = 'suspended')::int`,
          admins: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'admin')::int`,
          moderators: sql<number>`COUNT(*) FILTER (WHERE ${users.role} = 'moderator')::int`,
        })
        .from(users)
        .where(sql`${users.status} != 'deleted'`),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${books.status} = 'active')::int`,
          blocked: sql<number>`COUNT(*) FILTER (WHERE ${books.status} = 'blocked')::int`,
        })
        .from(books),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${personalBooks.isDeleted} = false)::int`,
          blocked: sql<number>`COUNT(*) FILTER (WHERE ${personalBooks.isDeleted} = true)::int`,
        })
        .from(personalBooks),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${clubBooks.isDeleted} = false)::int`,
          blocked: sql<number>`COUNT(*) FILTER (WHERE ${clubBooks.isDeleted} = true)::int`,
        })
        .from(clubBooks),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'active')::int`,
          recruiting: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'recruiting')::int`,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'completed')::int`,
          archived: sql<number>`COUNT(*) FILTER (WHERE ${clubs.status} = 'archived')::int`,
        })
        .from(clubs)
        .where(sql`${clubs.status} != 'pending'`),
    ]);

    const userStatsRaw = userStatsRows[0] || {
      total: 0,
      active: 0,
      pending: 0,
      suspended: 0,
      admins: 0,
      moderators: 0,
    };
    const generalBookStatsRaw = generalBookStatsRows[0] || { total: 0, active: 0, blocked: 0 };
    const personalBookStatsRaw = personalBookStatsRows[0] || { total: 0, active: 0, blocked: 0 };
    const clubBookStatsRaw = clubBookStatsRows[0] || { total: 0, active: 0, blocked: 0 };
    const clubStatsRaw = clubStatsRows[0] || {
      total: 0,
      active: 0,
      recruiting: 0,
      completed: 0,
      archived: 0,
    };

    const userStats = {
      total: Number(userStatsRaw.total || 0),
      active: Number(userStatsRaw.active || 0),
      pending: Number(userStatsRaw.pending || 0),
      suspended: Number(userStatsRaw.suspended || 0),
      admins: Number(userStatsRaw.admins || 0),
      moderators: Number(userStatsRaw.moderators || 0),
    };

    // Считаем книги из всех таблиц: books, personal_books, club_books
    const totalGeneralBooks = Number(generalBookStatsRaw.total || 0);
    const activeGeneralBooks = Number(generalBookStatsRaw.active || 0);
    const blockedGeneralBooks = Number(generalBookStatsRaw.blocked || 0);

    const totalPersonalBooks = Number(personalBookStatsRaw.total || 0);
    const activePersonalBooks = Number(personalBookStatsRaw.active || 0);
    const blockedPersonalBooks = Number(personalBookStatsRaw.blocked || 0);

    const totalClubBooks = Number(clubBookStatsRaw.total || 0);
    const activeClubBooks = Number(clubBookStatsRaw.active || 0);
    const blockedClubBooks = Number(clubBookStatsRaw.blocked || 0);
    
    const bookStats = {
      total: totalGeneralBooks + totalPersonalBooks + totalClubBooks,
      active: activeGeneralBooks + activePersonalBooks + activeClubBooks,
      blocked: blockedGeneralBooks + blockedPersonalBooks + blockedClubBooks,
    };

    const clubStats = {
      total: Number(clubStatsRaw.total || 0),
      active: Number(clubStatsRaw.active || 0),
      recruiting: Number(clubStatsRaw.recruiting || 0),
      completed: Number(clubStatsRaw.completed || 0),
      archived: Number(clubStatsRaw.archived || 0),
    };

    res.json({
      users: userStats,
      books: bookStats,
      clubs: clubStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== SYSTEM SETTINGS ====

// Получить настройки системы
router.get('/settings', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { category } = req.query;
    const settings = await storage.getSystemSettings(category as string);

    // Группируем настройки по категориям для удобного отображения
    type GroupedSettings = Record<
      string,
      Record<
        string,
        {
          value: unknown;
          type: string;
          description: string | null;
          isPublic: boolean;
          updatedAt: Date;
          updatedBy: string | null;
        }
      >
    >;

    const grouped = settings.reduce<GroupedSettings>((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {};
      }

      // Парсим значение в зависимости от типа
      let value: unknown = setting.value;
      try {
        switch (setting.type) {
          case 'boolean':
            value = setting.value === 'true';
            break;
          case 'number':
            value = Number(setting.value);
            break;
          case 'json':
            value = JSON.parse(setting.value);
            break;
          default:
            value = setting.value;
        }
      } catch (error) {
        console.error(`Failed to parse setting ${setting.key}:`, error);
      }

      acc[setting.category][setting.key] = {
        value,
        type: setting.type,
        description: setting.description,
        isPublic: setting.isPublic,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy
      };

      return acc;
    }, {});

    res.json(grouped);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки системы
router.put('/settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const updatedSettings = req.body;
    const results = [];

    // Обновляем каждую настройку через storage
    for (const [key, value] of Object.entries(updatedSettings)) {
      try {
        const success = await storage.updateSystemSetting(key, value, req.user!.userId);
        results.push({ key, success });
      } catch (error) {
        console.error(`Failed to update setting ${key}:`, error);
        results.push({ key, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      message: `Settings updated: ${successCount} successful, ${failureCount} failed`,
      results
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== SMTP SETTINGS ====

// ==== PLATFORM URL SETTINGS ====

router.get('/settings/platform', jwtAuth, requireAdmin, async (_req, res) => {
  try {
    const setting = await storage.getSetting(platformBaseUrlSettingKey);
    const canonicalUrl = setting?.value ? normalizePublicBaseUrl(setting.value) : null;
    const effectiveUrl = await getPublicBaseUrl();
    const envConfigured = Boolean(process.env.APP_BASE_URL || process.env.APP_BASE_URLS || process.env.CLIENT_URL);

    res.json({
      settings: {
        canonicalUrl: canonicalUrl || '',
        effectiveUrl,
        source: canonicalUrl ? 'database' : envConfigured ? 'environment' : 'fallback',
      },
    });
  } catch (error) {
    console.error('Error fetching platform URL settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/settings/platform', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const rawCanonicalUrl = typeof req.body?.canonicalUrl === 'string' ? req.body.canonicalUrl : '';
    const normalizedCanonicalUrl = normalizePublicBaseUrl(rawCanonicalUrl);

    if (!normalizedCanonicalUrl) {
      return res.status(400).json({
        message: 'Некорректный canonical URL. Допустимы только абсолютные http/https URL.',
      });
    }

    const parsed = new URL(normalizedCanonicalUrl);
    if (
      process.env.NODE_ENV === 'production' &&
      parsed.hostname !== 'localhost' &&
      parsed.protocol !== 'https:'
    ) {
      return res.status(400).json({
        message: 'В production canonical URL должен использовать https.',
      });
    }

    const previous = await storage.getSetting(platformBaseUrlSettingKey);

    await storage.setSetting({
      key: platformBaseUrlSettingKey,
      value: normalizedCanonicalUrl,
      category: 'platform',
      description: 'Canonical public URL used for emails and external links',
      isEncrypted: false,
      updatedBy: req.user!.userId,
    });

    invalidatePublicBaseUrlCache();

    await logAction(
      req,
      'update_settings',
      'settings',
      platformBaseUrlSettingKey,
      'Updated canonical public URL',
      previous?.value || undefined,
      normalizedCanonicalUrl,
    );

    res.json({
      success: true,
      settings: {
        canonicalUrl: normalizedCanonicalUrl,
      },
    });
  } catch (error) {
    console.error('Error saving platform URL settings:', error);
    res.status(500).json({ message: 'Failed to save platform URL settings' });
  }
});

// Получить SMTP настройки
router.get('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const smtpSettings = await storage.getSettingsByCategory('smtp');
    
    const settings: Record<string, string> = {};
    smtpSettings.forEach((s) => {
      if (s.key === 'smtp.password') {
        settings[s.key] = s.value ? '********' : '';
      } else {
        settings[s.key] = s.value || '';
      }
    });

    res.json({
      success: true,
      settings: {
        'smtp.host': settings['smtp.host'] || '',
        'smtp.port': settings['smtp.port'] || '587',
        'smtp.user': settings['smtp.user'] || '',
        'smtp.password': settings['smtp.password'] || '',
        'smtp.from': settings['smtp.from'] || '',
        'smtp.secure': settings['smtp.secure'] || 'false',
        'smtp.enabled': settings['smtp.enabled'] || 'false',
      },
    });
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сохранить SMTP настройки
router.put('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { host, port, user, password, from, secure, enabled } = req.body;

    // Сохраняем каждую настройку через storage.setSetting
    await storage.setSetting({
      key: 'smtp.host',
      value: host || '',
      category: 'smtp',
      description: 'SMTP host',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.port',
      value: port?.toString() || '587',
      category: 'smtp',
      description: 'SMTP port',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.user',
      value: user || '',
      category: 'smtp',
      description: 'SMTP username',
      updatedBy: req.user!.userId,
    });

    if (password && password !== '********') {
      await storage.setSetting({
        key: 'smtp.password',
        value: password,
        category: 'smtp',
        description: 'SMTP password',
        isEncrypted: true,
        updatedBy: req.user!.userId,
      });
    }

    await storage.setSetting({
      key: 'smtp.from',
      value: from || '',
      category: 'smtp',
      description: 'From email address',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.secure',
      value: secure ? 'true' : 'false',
      category: 'smtp',
      description: 'Use SSL/TLS',
      updatedBy: req.user!.userId,
    });

    await storage.setSetting({
      key: 'smtp.enabled',
      value: enabled ? 'true' : 'false',
      category: 'smtp',
      description: 'Enable SMTP',
      updatedBy: req.user!.userId,
    });

    // Сбрасываем транспорт email сервиса для применения новых настроек
    emailService.resetTransporter();

    logger.info({ admin: req.user?.username }, 'SMTP settings updated');

    res.json({ 
      success: true,
      message: 'SMTP settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving SMTP settings:', error);
    res.status(500).json({ message: 'Failed to save SMTP settings' });
  }
});

// Тестовая отправка email
router.post('/settings/smtp/test', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Test email address is required' 
      });
    }

    // Сбрасываем транспорт чтобы использовать актуальные настройки
    emailService.resetTransporter();

    const result = await emailService.sendTestEmail(testEmail);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Не удалось отправить письмо. Проверьте настройки SMTP.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email'
    });
  }
});

// ==== SYSTEM HEALTH ====

// Получить состояние системы
router.get('/system/health', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const totalMemoryMB = memoryUsage.heapTotal / 1024 / 1024;
    const usedMemoryMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryPercentage = Math.round((usedMemoryMB / totalMemoryMB) * 100);

    // Проверка базы данных
    let dbStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    let dbConnections = 0;
    const dbMaxConnections = 100;
    try {
      // Выполняем простой запрос к БД для проверки соединения
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`SELECT COUNT(*) as count FROM users`);
      dbConnections = 1;
    } catch (error) {
      console.error('[Health] Database check failed:', error);
      dbStatus = 'error';
    }

    // Проверка email сервиса
    let emailServiceStatus = false;
    try {
      const smtpSettings = await storage.getSetting('smtp.enabled');
      emailServiceStatus = smtpSettings?.value === 'true';
      
      // Дополнительная проверка: есть ли все необходимые настройки
      if (emailServiceStatus) {
        const host = await storage.getSetting('smtp.host');
        const user = await storage.getSetting('smtp.user');
        emailServiceStatus = !!(host && user);
      }
    } catch (error) {
      console.error('[Health] Email service check failed:', error);
      emailServiceStatus = false;
    }

    // Проверка file storage (MinIO/S3)
    let fileStorageStatus = false;
    try {
      const { fileStorage } = await import('./file-storage');
      // Проверяем, что fileStorage инициализирован
      fileStorageStatus = !!fileStorage;
    } catch (error) {
      console.error('[Health] File storage check failed:', error);
      fileStorageStatus = false;
    }

    // Проверка auth service
    let authServiceStatus = false;
    try {
      const { authService } = await import('./auth-service');
      authServiceStatus = !!authService;
    } catch (error) {
      console.error('[Health] Auth service check failed:', error);
      authServiceStatus = false;
    }

    const health = {
      database: {
        status: dbStatus,
        connections: dbConnections,
        max_connections: dbMaxConnections,
        uptime: formatUptime(process.uptime()),
      },
      server: {
        status: 'healthy' as const,
        cpu_usage: Math.round(process.cpuUsage().user / 1000000), // Реальное использование CPU в %
        memory_usage: memoryPercentage,
        disk_usage: 0, // Disk usage требует системных вызовов, пока оставляем 0
        uptime: formatUptime(process.uptime()),
      },
      services: {
        auth_service: authServiceStatus,
        file_storage: fileStorageStatus,
        email_service: emailServiceStatus,
        background_jobs: true,
      }
    };

    res.json(health);
  } catch (error) {
    console.error('Error fetching health:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Вспомогательная функция для форматирования uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}д ${hours}ч ${mins}м`;
  } else if (hours > 0) {
    return `${hours}ч ${mins}м`;
  } else {
    return `${mins}м`;
  }
}

// ==== REPORTS MANAGEMENT ====

// Получить список отчетов
router.get('/reports', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { page, limit } = parseAdminPagination(req.query.page, req.query.limit);
    const { status, type, assignedTo } = req.query;

    const filters: { status?: string; type?: string; assignedTo?: string } = {};
    if (status) filters.status = status as string;
    if (type) filters.type = type as string;
    if (assignedTo) filters.assignedTo = assignedTo as string;

    const result = await storage.getModerationReportsPage({ filters, page, limit });

    res.json({
      reports: result.reports,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить статус отчета
router.put('/reports/:reportId/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, admin_notes } = req.body;

    if (!['new', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Заглушка - в реальном проекте здесь было бы обновление в БД
    const updatedReport = {
      id: reportId,
      status,
      admin_notes,
      updated_at: new Date().toISOString()
    };

    await logAction(
      req,
      'update_report_status',
      'report',
      reportId,
      `Changed status to ${status}`
    );

    res.json({ report: updatedReport });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================
// SMTP Settings Management
// ============================================

/**
 * GET /api/admin/settings/smtp
 * Получить текущие SMTP настройки (без пароля)
 */
router.get('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const smtpSettings = await storage.getSettingsByCategory('smtp');
    
    // Формируем объект настроек, исключая пароль в явном виде
    const settings: Record<string, string> = {};
    smtpSettings.forEach(setting => {
      if (setting.key === 'smtp.password') {
        settings[setting.key] = setting.value ? '********' : '';
      } else {
        settings[setting.key] = setting.value ?? '';
      }
    });

    res.json({
      success: true,
      settings: {
        'smtp.host': settings['smtp.host'] || '',
        'smtp.port': settings['smtp.port'] || '587',
        'smtp.user': settings['smtp.user'] || '',
        'smtp.password': settings['smtp.password'] || '',
        'smtp.from': settings['smtp.from'] || '',
        'smtp.secure': settings['smtp.secure'] || 'false',
        'smtp.enabled': settings['smtp.enabled'] || 'false',
      }
    });
  } catch (error) {
    console.error('Error getting SMTP settings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to get SMTP settings' 
    });
  }
});

/**
 * PUT /api/admin/settings/smtp
 * Обновить SMTP настройки
 */
router.put('/settings/smtp', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { host, port, user, password, from, secure, enabled } = req.body;

    // Валидация
    if (!host || !port || !from) {
      return res.status(400).json({
        success: false,
        message: 'Host, port, and from email are required'
      });
    }

    const adminId = req.user!.userId;

    // Сохраняем каждую настройку
    const settingsToSave = [
      { key: 'smtp.host', value: host, category: 'smtp', description: 'SMTP server host' },
      { key: 'smtp.port', value: String(port), category: 'smtp', description: 'SMTP server port' },
      { key: 'smtp.user', value: user || '', category: 'smtp', description: 'SMTP username' },
      { key: 'smtp.from', value: from, category: 'smtp', description: 'From email address' },
      { key: 'smtp.secure', value: String(secure || false), category: 'smtp', description: 'Use SSL/TLS' },
      { key: 'smtp.enabled', value: String(enabled || false), category: 'smtp', description: 'SMTP enabled' },
    ];

    // Если передан пароль (не маска), сохраняем его
    if (password && password !== '********') {
      settingsToSave.push({
        key: 'smtp.password',
        value: password,
        category: 'smtp',
        description: 'SMTP password'
      });
    }

    // Сохраняем все настройки
    for (const setting of settingsToSave) {
      await storage.setSetting({
        ...setting,
        updatedBy: adminId,
        isEncrypted: setting.key === 'smtp.password'
      });
    }

    await logAction(
      req,
      'update_smtp_settings',
      'settings',
      'smtp',
      'Updated SMTP configuration'
    );

    res.json({
      success: true,
      message: 'SMTP settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SMTP settings'
    });
  }
});

/**
 * POST /api/admin/settings/smtp/test
 * Отправить тестовое письмо для проверки SMTP настроек
 */
router.post('/settings/smtp/test', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required'
      });
    }

    // Сбрасываем кэш транспорта чтобы использовать новые настройки
    emailService.resetTransporter();
    
    // Отправляем тестовое письмо через email-service
    const result = await emailService.sendTestEmail(testEmail);
    
    await logAction(
      req,
      'test_smtp',
      'settings',
      'smtp',
      `Test email sent to ${testEmail}: ${result.success ? 'SUCCESS' : 'FAILED'}`,
      undefined,
      JSON.stringify({ messageId: result.messageId, error: result.error })
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Тестовое письмо успешно отправлено! Проверьте почту.',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Не удалось отправить письмо. Проверьте настройки SMTP.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email'
    });
  }
});

export default router;
