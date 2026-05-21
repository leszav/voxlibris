import express from 'express';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jwtAuth, requireAdmin, requireModerator } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import { authService } from './auth-service.js';
import { emailService } from './services/email-service.js';
import { fileStorage } from './file-storage.js';
import { CryptoService } from './crypto-service.js';
import { z } from 'zod';
import type { UserRole, UserStatus, AdminActionType, AdminActionTargetType, InsertGenre } from '../shared/schema.js';
import { db } from './db.js';
import postgres from 'postgres';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { books, personalBooks, clubBooks, users, clubs, clubMembers, readingSessions, conversations, directMessages, dmReports, dmAdminAccessLog } from '../shared/schema.js';
import { logger } from './lib/logger.js';
import { getStudioRecordingsDir } from './lib/studio-recording-storage.js';
import {
  getPublicBaseUrl,
  invalidatePublicBaseUrlCache,
  normalizePublicBaseUrl,
  platformBaseUrlSettingKey,
} from './lib/public-base-url.js';
const PostgresError = postgres.PostgresError;

const adminGenreUpsertSchema = z.object({
  code: z.string().trim().min(1).max(120),
  labelRu: z.string().trim().min(1),
  labelEn: z.string().trim().max(255).optional().nullable(),
  groupKey: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  aliases: z.array(z.string().trim().min(1)).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const adminGenreUpdateSchema = adminGenreUpsertSchema.omit({ code: true }).partial();
type AdminGenreUpdatePayload = z.infer<typeof adminGenreUpdateSchema>;

function buildGenreUpdatePayload(payload: AdminGenreUpdatePayload): Partial<InsertGenre> {
  const { aliases, ...genreFields } = payload;

  return {
    ...genreFields,
    ...(Array.isArray(aliases) ? { aliasesJson: JSON.stringify(aliases) } : {}),
  };
}

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
const STUDIO_RECORDINGS_DIR = getStudioRecordingsDir();
const STUDIO_RECORDING_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(.+))?\.mp3$/i;
const execFileAsync = promisify(execFile);
const ADMIN_CLUB_STATUSES = ['pending', 'recruiting', 'active', 'completed', 'archived'] as const;
type AdminClubStatus = (typeof ADMIN_CLUB_STATUSES)[number];
type AdminBookSource = 'books' | 'personal_books' | 'club_books';
type AdminBookStatus = 'active' | 'blocked' | 'pending';

const BOOK_BLOCK_REASON_MAX_LENGTH = 1000;

interface DownloadPayload {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

function isAdminClubStatus(status: unknown): status is AdminClubStatus {
  return typeof status === 'string' && ADMIN_CLUB_STATUSES.includes(status as AdminClubStatus);
}

function isAdminBookSource(source: unknown): source is AdminBookSource {
  return source === 'books' || source === 'personal_books' || source === 'club_books';
}

function isAdminBookStatus(status: unknown): status is AdminBookStatus {
  return status === 'active' || status === 'blocked' || status === 'pending';
}

function normalizeStorageKey(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const normalizedPath = url.pathname.replace(/^\/+/, '');
      if (normalizedPath.startsWith('api/storage/')) {
        return normalizedPath.replace(/^api\/storage\//, '');
      }

      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.length >= 2) {
        return segments.slice(1).join('/');
      }

      return normalizedPath;
    } catch {
      // Fall through to plain path normalization
    }
  }

  const plainPath = trimmed.replace(/^\/+/, '');
  if (plainPath.startsWith('api/storage/')) {
    return plainPath.replace(/^api\/storage\//, '');
  }

  return plainPath;
}

function sanitizeFileNameBase(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replaceAll(/[^\p{L}\p{N}\s._-]/gu, '')
    .trim()
    .replaceAll(/\s+/g, '_');

  return normalized.length > 0 ? normalized.slice(0, 120) : 'book';
}

function getFormatMeta(format: string | null | undefined): { ext: string; mimeType: string } {
  const normalized = (format || '').toLowerCase();
  if (normalized === 'epub') {
    return { ext: 'epub', mimeType: 'application/epub+zip' };
  }
  if (normalized === 'fb2') {
    return { ext: 'fb2', mimeType: 'application/x-fictionbook+xml' };
  }
  return { ext: 'bin', mimeType: 'application/octet-stream' };
}

function buildAttachmentFileName(baseName: string, ext: string): string {
  const normalizedExt = ext.replace(/^\./, '').trim() || 'bin';
  return `${sanitizeFileNameBase(baseName)}.${normalizedExt}`;
}

function buildAttachmentHeader(fileName: string): string {
  const fallback = fileName.replaceAll(/[^\x20-\x7E]/g, '_').replaceAll('"', '');
  const utf8FileName = encodeURIComponent(fileName)
    .replaceAll(/['()]/g, (char) => `%${char.codePointAt(0)!.toString(16).toUpperCase()}`)
    .replaceAll('*', '%2A');

  return `attachment; filename="${fallback || 'book.bin'}"; filename*=UTF-8''${utf8FileName}`;
}

function getDisplayBookStatusForRegularBook(status: string): AdminBookStatus {
  if (status === 'active' || status === 'blocked') {
    return status;
  }
  return 'pending';
}

function normalizeReason(reasonRaw: unknown): string {
  return typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
}

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

interface StudioRecordingFileEntry {
  id: string;
  fileName: string;
  filePath: string;
  sessionId: string;
  fileSize: number;
  recordedAt: string;
}

interface StudioRecordingSessionMeta {
  sessionId: string;
  clubId: string;
  clubName: string | null;
  bookId: string;
  bookTitle: string | null;
  currentChapter: number;
  readerId: string | null;
  readerName: string | null;
  startedAt: Date | null;
}

async function probeStudioRecordingDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    const value = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.round(value);
  } catch (error) {
    logger.warn({ error, filePath }, 'Failed to probe studio recording duration');
    return null;
  }
}

function parseStudioRecordingFileName(fileName: string): { sessionId: string; recordedAt: string | null } | null {
  const match = STUDIO_RECORDING_FILE_RE.exec(fileName);
  if (match === null) {
    return null;
  }

  const sessionId = match[1];
  const rawTimestamp = match[2]?.replace(/\.mp3$/i, '') ?? '';
  if (!rawTimestamp) {
    return {
      sessionId,
      recordedAt: null,
    };
  }

  const isoTimestamp = rawTimestamp.replace(/-(\d{3})Z$/, '.$1Z');
  const parsedTime = new Date(isoTimestamp);

  return {
    sessionId,
    recordedAt: Number.isNaN(parsedTime.getTime()) ? null : parsedTime.toISOString(),
  };
}

function resolveStudioRecordingPath(recordingId: string): string | null {
  if (!recordingId || path.basename(recordingId) !== recordingId) {
    return null;
  }

  const baseDir = path.resolve(STUDIO_RECORDINGS_DIR);
  const resolvedPath = path.resolve(baseDir, recordingId);
  if (resolvedPath !== path.join(baseDir, recordingId)) {
    return null;
  }

  return resolvedPath;
}

async function listStudioRecordingFiles(): Promise<StudioRecordingFileEntry[]> {
  try {
    const entries = await fs.readdir(STUDIO_RECORDINGS_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
        .map(async (entry) => {
          const parsed = parseStudioRecordingFileName(entry.name);
          if (!parsed) {
            return null;
          }

          const filePath = path.join(STUDIO_RECORDINGS_DIR, entry.name);
          const stats = await fs.stat(filePath);
          return {
            id: entry.name,
            fileName: entry.name,
            filePath,
            sessionId: parsed.sessionId,
            fileSize: stats.size,
            recordedAt: parsed.recordedAt ?? stats.mtime.toISOString(),
          } satisfies StudioRecordingFileEntry;
        })
    );

    return files
      .filter((file): file is StudioRecordingFileEntry => file !== null)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function getStudioRecordingSessionMeta(sessionIds: string[]): Promise<Map<string, StudioRecordingSessionMeta>> {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      sessionId: readingSessions.id,
      clubId: readingSessions.clubId,
      clubName: clubs.title,
      bookId: readingSessions.bookId,
      bookTitle: sql<string | null>`coalesce(${clubBooks.title}, ${books.title})`,
      currentChapter: readingSessions.currentChapter,
      readerId: users.id,
      readerName: users.username,
      startedAt: readingSessions.startedAt,
    })
    .from(readingSessions)
    .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
    .leftJoin(users, eq(readingSessions.readerId, users.id))
    .leftJoin(clubBooks, eq(readingSessions.bookId, clubBooks.id))
    .leftJoin(books, eq(readingSessions.bookId, books.id))
    .where(inArray(readingSessions.id, sessionIds));

  return new Map(rows.map((row) => [row.sessionId, row]));
}

function recordingMatchesSearch(
  search: string,
  file: StudioRecordingFileEntry,
  meta: StudioRecordingSessionMeta | undefined,
): boolean {
  if (!search) {
    return true;
  }

  const haystack = [
    file.fileName,
    meta?.clubName,
    meta?.bookTitle,
    meta?.readerName,
    meta?.currentChapter ? `глава ${meta.currentChapter}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function getAudioMimeType(filePath: string): string {
  return path.extname(filePath).toLowerCase() === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';
}

async function sendFileRangeResponse(req: express.Request, res: express.Response, filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  const range = req.headers.range;
  const contentType = getAudioMimeType(filePath);

  if (!range) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(filePath);
    return;
  }

  const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-');
  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

  if (!Number.isFinite(start) || start < 0 || start >= fileSize || end < start) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(end - start + 1));
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);

  const stream = createReadStream(filePath, { start, end });
  stream.pipe(res);
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
    const searchPattern = `%${params.search.toLowerCase()}%`;
    conditions.push(sql`LOWER(${users.username}) LIKE ${searchPattern}`);
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
  let whereClause: SQL<unknown>;
  if (params.conditions.length === 0) {
    whereClause = sql`true`;
  } else if (params.conditions.length === 1) {
    whereClause = params.conditions[0];
  } else {
    whereClause = and(...params.conditions) as SQL<unknown>;
  }
  
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

// "Зайти как..." - получить токены для входа под другим пользователем
router.post('/users/:id/impersonate', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, включена ли функция имперсонации в настройках безопасности
    const impersonationSetting = await storage.getSetting('security.impersonation.enabled');
    if (impersonationSetting?.value !== 'true') {
      return res.status(403).json({ 
        message: 'Функция входа от имени другого пользователя отключена администратором',
        code: 'IMPERSONATION_DISABLED'
      });
    }

    // Получаем целевого пользователя
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Нельзя имперсонировать другого админа
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot impersonate another admin' });
    }

    // Генерируем токены для целевого пользователя
    const tokens = await authService.generateTokens(user, false);

    // Логируем действие
    await logAction(
      req,
      'impersonate',
      'user',
      user.id,
      `Admin impersonated user ${user.username}`
    );

    logger.info({
      adminId: req.user!.userId,
      adminUsername: req.user!.username,
      targetUserId: user.id,
      targetUsername: user.username
    }, '[Admin] Impersonation initiated');

    // Устанавливаем cookies для токенов, как при обычном логине
    const refreshMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 дней
    const accessMaxAge = 15 * 60 * 1000; // 15 минут
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: false, // Доступен для JavaScript
      secure: isProduction,
      sameSite: 'strict',
      maxAge: accessMaxAge,
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true, // Защищен от XSS
      secure: isProduction,
      sameSite: 'strict',
      maxAge: refreshMaxAge,
      path: '/',
    });

    res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Error impersonating user:', error);
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

// Редактировать поля пользователя (admin only)
const USERNAME_REGEX_ADMIN = /^[A-Za-z0-9_-]{3,32}$/;
const EMAIL_REGEX_ADMIN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.put('/users/:id/fields', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email } = req.body as { username?: string; email?: string };

    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (username !== undefined) {
      if (!USERNAME_REGEX_ADMIN.test(username)) {
        return res.status(400).json({ message: 'Некорректный username: только A-Za-z0-9_-, 3–32 символа' });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== id) {
        return res.status(409).json({ message: 'Username уже занят' });
      }
      await storage.updateUserUsername(id, username);
    }

    if (email !== undefined) {
      if (!EMAIL_REGEX_ADMIN.test(email)) {
        return res.status(400).json({ message: 'Некорректный email' });
      }
      const existingByEmail = await storage.getUserByEmail(email);
      if (existingByEmail && existingByEmail.id !== id) {
        return res.status(409).json({ message: 'Email уже занят' });
      }
      // Для смены email через админку не требуем подтверждения
      await db.update(users).set({ email }).where(eq(users.id, id));
    }

    await logAction(req, 'edit_user_fields', 'user', id, `Fields updated: ${Object.keys(req.body).join(', ')}`);
    const updated = await storage.getUser(id);
    if (!updated) return res.status(404).json({ message: 'User not found after update' });
    const { password: _p, ...safeUser } = updated;
    res.json({ user: safeUser });
  } catch (error) {
    console.error('Error updating user fields:', error);
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

function _filterBooksByStatus(books: BookWithSource[], status: string): BookWithSource[] {
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
function _formatSystemBookForAdmin(book: { source: 'books' } & typeof books.$inferSelect, usersMap: Map<string, string>) {
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

function _formatPersonalBookForAdmin(book: { source: 'personal_books' } & typeof personalBooks.$inferSelect, usersMap: Map<string, string>) {
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

function _formatClubBookForAdmin(book: { source: 'club_books' } & typeof clubBooks.$inferSelect, usersMap: Map<string, string>) {
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

// Вспомогательные функции для GET /books - снижение когнитивной сложности
interface BookFilters {
  search: string;
  status?: string;
  genre?: string;
}

interface BookConditions {
  booksWhere?: SQL<unknown>;
  personalWhere?: SQL<unknown>;
  clubWhere?: SQL<unknown>;
}

interface BookFilterPatterns {
  searchPattern: string | null;
  status?: string;
  genrePattern: string | null;
}

type StatusConditionMap = Record<AdminBookStatus, SQL<unknown>>;

function sourceWhere(conditions: SQL<unknown>[]): SQL<unknown> | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

function compactConditions(conditions: Array<SQL<unknown> | undefined>): SQL<unknown>[] {
  return conditions.filter((condition): condition is SQL<unknown> => Boolean(condition));
}

function statusCondition(status: string | undefined, conditions: StatusConditionMap): SQL<unknown> | undefined {
  if (isAdminBookStatus(status)) {
    return conditions[status];
  }

  return undefined;
}

function buildBookFilterPatterns(filters: BookFilters): BookFilterPatterns {
  return {
    searchPattern: filters.search ? `%${filters.search}%` : null,
    status: filters.status,
    genrePattern: filters.genre ? `%${filters.genre}%` : null,
  };
}

function buildSystemBookConditions(filters: BookFilterPatterns): SQL<unknown>[] {
  const { searchPattern, status, genrePattern } = filters;

  return compactConditions([
    searchPattern
      ? sql`(LOWER(${books.title}) LIKE ${searchPattern} OR LOWER(${books.author}) LIKE ${searchPattern})`
      : undefined,
    statusCondition(status, {
      active: eq(books.status, 'active'),
      blocked: eq(books.status, 'blocked'),
      pending: sql`${books.status} NOT IN ('active', 'blocked')`,
    }),
    genrePattern ? sql`false` : undefined,
  ]);
}

function buildPersonalBookConditions(filters: BookFilterPatterns): SQL<unknown>[] {
  const { searchPattern, status, genrePattern } = filters;

  return compactConditions([
    searchPattern
      ? sql`(LOWER(${personalBooks.title}) LIKE ${searchPattern} OR LOWER(${personalBooks.author}) LIKE ${searchPattern})`
      : undefined,
    statusCondition(status, {
      active: eq(personalBooks.isDeleted, false),
      blocked: eq(personalBooks.isDeleted, true),
      pending: sql`false`,
    }),
    genrePattern ? sql`LOWER(COALESCE(${personalBooks.genre}, '')) LIKE ${genrePattern}` : undefined,
  ]);
}

function buildClubBookConditions(filters: BookFilterPatterns): SQL<unknown>[] {
  const { searchPattern, status, genrePattern } = filters;

  return compactConditions([
    searchPattern
      ? sql`(LOWER(${clubBooks.title}) LIKE ${searchPattern} OR LOWER(${clubBooks.author}) LIKE ${searchPattern})`
      : undefined,
    statusCondition(status, {
      active: eq(clubBooks.isDeleted, false),
      blocked: eq(clubBooks.isDeleted, true),
      pending: sql`false`,
    }),
    genrePattern ? sql`LOWER(COALESCE(${clubBooks.genre}, '')) LIKE ${genrePattern}` : undefined,
  ]);
}

function buildBookConditions(filters: BookFilters): BookConditions {
  const patterns = buildBookFilterPatterns(filters);

  return {
    booksWhere: sourceWhere(buildSystemBookConditions(patterns)),
    personalWhere: sourceWhere(buildPersonalBookConditions(patterns)),
    clubWhere: sourceWhere(buildClubBookConditions(patterns)),
  };
}

async function fetchBookCounts(conditions: BookConditions) {
  const { booksWhere, personalWhere, clubWhere } = conditions;

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

  return {
    booksCount: Number(booksCountRows[0]?.count || 0),
    personalCount: Number(personalCountRows[0]?.count || 0),
    clubCount: Number(clubCountRows[0]?.count || 0),
  };
}

interface BookWindow {
  skip: number;
  take: number;
}

function calculateBookWindows(counts: { booksCount: number; personalCount: number; clubCount: number }, offset: number, limit: number) {
  let remainingOffset = offset;
  let remainingLimit = limit;

  const calculateWindow = (segmentCount: number): BookWindow => {
    if (remainingLimit <= 0) return { skip: 0, take: 0 };
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

  return {
    booksWindow: calculateWindow(counts.booksCount),
    personalWindow: calculateWindow(counts.personalCount),
    clubWindow: calculateWindow(counts.clubCount),
  };
}

// Типы для результатов запросов книг
interface BookQueryResult {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: Date | null;
  createdAt: Date | null;
  fileSize: number | null;
  downloadsCount: number | null;
  description: string | null;
  status: string;
}

interface PersonalBookQueryResult {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  fileSize: number | null;
  description: string | null;
  status: string;
  userId: string | null;
}

interface ClubBookQueryResult {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  fileSize: number | null;
  description: string | null;
  clubId: string;
  uploadedByUserId: string | null;
  status: string;
}

async function executeBookQueries(
  conditions: BookConditions,
  windows: { booksWindow: BookWindow; personalWindow: BookWindow; clubWindow: BookWindow }
) {
  const { booksWhere, personalWhere, clubWhere } = conditions;
  const { booksWindow, personalWindow, clubWindow } = windows;

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
      userId: personalBooks.userId,
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
      uploadedByUserId: clubBooks.uploadedByUserId,
      status: sql<string>`CASE
        WHEN ${clubBooks.isDeleted} = true THEN 'blocked'
        ELSE 'active'
      END`,
    })
    .from(clubBooks)
    .leftJoin(users, eq(clubBooks.uploadedByUserId, users.id))
    .orderBy(desc(clubBooks.createdAt));

  let getBooksRows: Promise<BookQueryResult[]>;
  if (booksWindow.take > 0) {
    getBooksRows = booksWhere 
      ? booksQuery.where(booksWhere).limit(booksWindow.take).offset(booksWindow.skip)
      : booksQuery.limit(booksWindow.take).offset(booksWindow.skip);
  } else {
    getBooksRows = Promise.resolve([]);
  }

  let getPersonalRows: Promise<PersonalBookQueryResult[]>;
  if (personalWindow.take > 0) {
    getPersonalRows = (personalWhere
      ? personalQuery.where(personalWhere).limit(personalWindow.take).offset(personalWindow.skip)
      : personalQuery.limit(personalWindow.take).offset(personalWindow.skip)
    ).then(rows => rows.map(row => ({
      ...row,
      uploadedBy: row.uploadedBy ?? null
    })));
  } else {
    getPersonalRows = Promise.resolve([]);
  }

  let getClubRows: Promise<ClubBookQueryResult[]>;
  if (clubWindow.take > 0) {
    getClubRows = (clubWhere
      ? clubQuery.where(clubWhere).limit(clubWindow.take).offset(clubWindow.skip)
      : clubQuery.limit(clubWindow.take).offset(clubWindow.skip)
    ).then(rows => rows.map(row => ({
      ...row,
      uploadedByUserId: row.uploadedByUserId ?? null
    })));
  } else {
    getClubRows = Promise.resolve([]);
  }

  return Promise.all([getBooksRows, getPersonalRows, getClubRows]);
}

function formatBookResults(booksRows: BookQueryResult[], personalRows: PersonalBookQueryResult[], clubRows: ClubBookQueryResult[]) {
  return [
    ...booksRows.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: book.isbn || null,
      genre: null,
      cover_url: book.coverUrl || null,
      file_url: book.fileUrl || '',
      status: book.status,
      uploaded_by: book.uploadedBy ?? 'System',
      upload_date: (book.uploadedAt || book.createdAt)?.toISOString() ?? new Date().toISOString(),
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
      uploaded_by: book.uploadedBy ?? 'System',
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
      uploaded_by: book.uploadedBy ?? 'System',
      upload_date: book.uploadedAt.toISOString(),
      file_size: book.fileSize || 0,
      downloads_count: 0,
      description: book.description || null,
      source: 'club_books',
      club_id: book.clubId,
    })),
  ];
}

// Получить список всех книг (refactored for low cognitive complexity)
router.get('/books', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const genre = typeof req.query.genre === 'string' ? req.query.genre.trim().toLowerCase() : undefined;
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);

    if (status && !['active', 'blocked', 'pending'].includes(status)) {
      return res.json({
        books: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    const conditions = buildBookConditions({ search, status, genre });
    const counts = await fetchBookCounts(conditions);
    const total = counts.booksCount + counts.personalCount + counts.clubCount;
    const windows = calculateBookWindows(counts, offset, limit);
    const [booksRows, personalRows, clubRows] = await executeBookQueries(conditions, windows);
    const formattedBooks = formatBookResults(booksRows, personalRows, clubRows);

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

router.get('/genres', jwtAuth, requireAdmin, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const genres = await storage.getGenresAdmin(search);
  res.json(genres.map((genre) => ({
    id: genre.id,
    code: genre.code,
    labelRu: genre.labelRu,
    labelEn: genre.labelEn,
    groupKey: genre.groupKey,
    description: genre.description,
    aliases: genre.aliasesJson ? JSON.parse(genre.aliasesJson) : [],
    sortOrder: genre.sortOrder,
    isActive: genre.isActive,
    createdAt: genre.createdAt,
    updatedAt: genre.updatedAt,
  })));
});

router.post('/genres', jwtAuth, requireFullAdmin, async (req, res) => {
  const parsed = adminGenreUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid genre payload' });
  }

  const payload = parsed.data;
  const genre = await storage.createGenre({
    code: payload.code,
    labelRu: payload.labelRu,
    labelEn: payload.labelEn ?? null,
    groupKey: payload.groupKey ?? null,
    description: payload.description ?? null,
    aliasesJson: JSON.stringify(payload.aliases ?? []),
    sortOrder: payload.sortOrder ?? 0,
    isActive: payload.isActive ?? true,
  });

  res.json(genre);
});

router.put('/genres/:code', jwtAuth, requireFullAdmin, async (req, res) => {
  const parsed = adminGenreUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid genre payload' });
  }

  const updated = await storage.updateGenre(req.params.code, buildGenreUpdatePayload(parsed.data));

  if (!updated) {
    return res.status(404).json({ error: 'Genre not found' });
  }

  res.json(updated);
});

router.delete('/genres/:code', jwtAuth, requireFullAdmin, async (req, res) => {
  const deleted = await storage.deleteGenre(req.params.code);

  if (!deleted) {
    return res.status(404).json({ error: 'Genre not found' });
  }

  res.status(204).send();
});

async function buildPersonalBookDownloadPayload(
  id: string,
): Promise<{ payload?: DownloadPayload; error?: string; statusCode?: number }> {
  const book = await storage.getPersonalBook(id);
  if (!book) {
    return { statusCode: 404, error: 'Personal book not found' };
  }

  if (!book.storagePath) {
    return { statusCode: 400, error: 'Book file path is missing' };
  }

  if (!book.encryptedContentKey) {
    return { statusCode: 400, error: 'Book encryption key is missing' };
  }

  const encryptedFile = await fileStorage.getFile(book.storagePath);
  const cek = CryptoService.decryptKey(book.encryptedContentKey);
  const decryptedFile = CryptoService.decryptFile(encryptedFile, cek);
  const formatMeta = getFormatMeta(book.format);

  return {
    payload: {
      fileBuffer: decryptedFile,
      fileName: buildAttachmentFileName(book.title, formatMeta.ext),
      mimeType: formatMeta.mimeType,
    },
  };
}

async function buildClubBookDownloadPayload(
  id: string,
): Promise<{ payload?: DownloadPayload; error?: string; statusCode?: number }> {
  const book = await storage.getClubBook(id);
  if (!book) {
    return { statusCode: 404, error: 'Club book not found' };
  }

  if (!book.storagePath) {
    return { statusCode: 400, error: 'Book file path is missing' };
  }

  if (!book.encryptedContentKey) {
    return { statusCode: 400, error: 'Book encryption key is missing' };
  }

  const encryptedFile = await fileStorage.getFile(book.storagePath);
  const cek = CryptoService.decryptKey(book.encryptedContentKey);
  const decryptedFile = CryptoService.decryptFile(encryptedFile, cek);
  const formatMeta = getFormatMeta(book.format);

  return {
    payload: {
      fileBuffer: decryptedFile,
      fileName: buildAttachmentFileName(book.title, formatMeta.ext),
      mimeType: formatMeta.mimeType,
    },
  };
}

async function buildRegularBookDownloadPayload(
  id: string,
): Promise<{ payload?: DownloadPayload; error?: string; statusCode?: number }> {
  const book = await storage.getBook(id);
  if (!book) {
    return { statusCode: 404, error: 'Book not found' };
  }

  if (!book.contentPath) {
    return { statusCode: 400, error: 'Book file is not available for download' };
  }

  const storageKey = normalizeStorageKey(book.contentPath);
  if (!storageKey) {
    return { statusCode: 400, error: 'Book file path is invalid' };
  }

  const fileBuffer = await fileStorage.getFile(storageKey);
  const formatMeta = getFormatMeta(book.contentType);
  const originalExtension = book.originalFilename?.split('.').pop() || formatMeta.ext;

  return {
    payload: {
      fileBuffer,
      fileName: buildAttachmentFileName(book.title, originalExtension),
      mimeType: formatMeta.mimeType,
    },
  };
}

// Скачать книгу для постмодерации (с расшифровкой для personal/club books)
router.get('/books/:id/download', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sourceRaw = req.query.source;
    const source = isAdminBookSource(sourceRaw) ? sourceRaw : 'books';

    let result: { payload?: DownloadPayload; error?: string; statusCode?: number };
    if (source === 'personal_books') {
      result = await buildPersonalBookDownloadPayload(id);
    } else if (source === 'club_books') {
      result = await buildClubBookDownloadPayload(id);
    } else {
      result = await buildRegularBookDownloadPayload(id);
    }

    if (!result.payload) {
      return res.status(result.statusCode || 500).json({
        message: result.error || 'Failed to prepare book for download',
      });
    }

    res.setHeader('Content-Type', result.payload.mimeType);
    res.setHeader('Content-Length', result.payload.fileBuffer.length.toString());
    res.setHeader('Content-Disposition', buildAttachmentHeader(result.payload.fileName));
    res.setHeader('Cache-Control', 'no-store');

    return res.send(result.payload.fileBuffer);
  } catch (error) {
    console.error('Error downloading book for moderation:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

interface BookBlockNotificationParams {
  source: 'personal_books' | 'club_books';
  uploaderUserId: string;
  bookTitle: string;
  reason: string;
  clubId?: string;
}

async function sendBookBlockNotification(
  params: BookBlockNotificationParams,
): Promise<{ success: boolean; error?: string }> {
  const user = await storage.getUser(params.uploaderUserId);
  if (!user?.email) {
    return { success: false, error: 'Book uploader email not found' };
  }

  const clubTitle = params.clubId ? (await storage.getClub(params.clubId))?.title : undefined;
  const emailSent = await emailService.sendBookBlockedNotification({
    email: user.email,
    username: user.username,
    bookTitle: params.bookTitle,
    reason: params.reason,
    source: params.source,
    clubTitle,
  });

  if (!emailSent) {
    return { success: false, error: 'Failed to send notification email to book uploader' };
  }

  return { success: true };
}

// Вспомогательные функции для PUT /books/:id/status - снижение когнитивной сложности
interface BookStatusUpdateResult {
  success: boolean;
  message: string;
  status?: AdminBookStatus;
  error?: boolean;
}

async function updatePersonalBookStatusHelper(
  id: string,
  status: AdminBookStatus,
  reason: string,
  req: express.Request
): Promise<BookStatusUpdateResult> {
  if (status === 'pending') {
    return { success: false, message: 'Pending status is not supported for personal books', error: true };
  }

  const personalBook = await storage.getPersonalBook(id);
  if (!personalBook) {
    return { success: false, message: 'Personal book not found', error: true };
  }

  const previousStatus: AdminBookStatus = personalBook.isDeleted ? 'blocked' : 'active';
  if (status === previousStatus) {
    return { success: true, message: 'Book status unchanged', status };
  }

  if (status === 'blocked') {
    const notificationResult = await sendBookBlockNotification({
      source: 'personal_books',
      uploaderUserId: personalBook.userId,
      bookTitle: personalBook.title,
      reason,
    });
    if (!notificationResult.success) {
      return { success: false, message: notificationResult.error!, error: true };
    }
  }

  const updated = status === 'blocked'
    ? await storage.deletePersonalBook(id)
    : await storage.restorePersonalBook(id);

  if (!updated) {
    return { success: false, message: 'Failed to update personal book status', error: true };
  }

  await logAction(
    req,
    status === 'blocked' ? 'block_book' : 'unblock_book',
    'book',
    id,
    status === 'blocked' ? reason : undefined,
    previousStatus,
    status,
  );

  return {
    success: true,
    message: status === 'blocked'
      ? 'Book blocked successfully and uploader notified'
      : 'Book unblocked successfully',
    status,
  };
}

async function updateClubBookStatusHelper(
  id: string,
  status: AdminBookStatus,
  reason: string,
  req: express.Request
): Promise<BookStatusUpdateResult> {
  if (status === 'pending') {
    return { success: false, message: 'Pending status is not supported for club books', error: true };
  }

  const clubBook = await storage.getClubBook(id);
  if (!clubBook) {
    return { success: false, message: 'Club book not found', error: true };
  }

  const previousStatus: AdminBookStatus = clubBook.isDeleted ? 'blocked' : 'active';
  if (status === previousStatus) {
    return { success: true, message: 'Book status unchanged', status };
  }

  if (status === 'blocked') {
    const notificationResult = await sendBookBlockNotification({
      source: 'club_books',
      uploaderUserId: clubBook.uploadedByUserId,
      bookTitle: clubBook.title,
      reason,
      clubId: clubBook.clubId,
    });
    if (!notificationResult.success) {
      return { success: false, message: notificationResult.error!, error: true };
    }
  }

  const updated = status === 'blocked'
    ? await storage.deleteClubBook(id)
    : await storage.restoreClubBook(id);

  if (!updated) {
    return { success: false, message: 'Failed to update club book status', error: true };
  }

  await logAction(
    req,
    status === 'blocked' ? 'block_book' : 'unblock_book',
    'book',
    id,
    status === 'blocked' ? reason : undefined,
    previousStatus,
    status,
  );

  return {
    success: true,
    message: status === 'blocked'
      ? 'Book blocked successfully and uploader notified'
      : 'Book unblocked successfully',
    status,
  };
}

async function updateRegularBookStatusHelper(
  id: string,
  status: AdminBookStatus,
  reason: string,
  req: express.Request
): Promise<BookStatusUpdateResult> {
  const regularBook = await storage.getBook(id);
  if (!regularBook) {
    return { success: false, message: 'Book not found', error: true };
  }

  const previousStatus = getDisplayBookStatusForRegularBook(regularBook.status);
  if (status === previousStatus) {
    return { success: true, message: 'Book status unchanged', status };
  }

  const [updatedRegularBook] = await db
    .update(books)
    .set({
      status: status as unknown as typeof books.$inferInsert.status,
      blockedAt: status === 'blocked' ? new Date() : null,
      blockReason: status === 'blocked' ? reason || null : null,
      updatedAt: new Date(),
    })
    .where(eq(books.id, id))
    .returning({ id: books.id });

  if (!updatedRegularBook) {
    return { success: false, message: 'Failed to update regular book status', error: true };
  }

  let actionType: AdminActionType;
  if (status === 'blocked') {
    actionType = 'block_book';
  } else if (status === 'active') {
    actionType = 'unblock_book';
  } else {
    actionType = 'update_book_status';
  }

  await logAction(
    req,
    actionType,
    'book',
    id,
    status === 'blocked' ? reason : undefined,
    previousStatus,
    status,
  );

  return { success: true, message: 'Book status updated successfully', status };
}

// Изменить статус книги (поддерживает все типы: books, personal_books, club_books)
router.put('/books/:id/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const statusRaw = req.body?.status;
    const sourceRaw = req.body?.source;
    const reason = normalizeReason(req.body?.reason);
    const source = isAdminBookSource(sourceRaw) ? sourceRaw : 'books';

    if (!isAdminBookStatus(statusRaw)) {
      return res.status(400).json({ message: 'Invalid book status' });
    }
    const status = statusRaw;

    const requiresReasonForBlock = source !== 'books' && status === 'blocked';
    if (requiresReasonForBlock && !reason) {
      return res.status(400).json({ message: 'Block reason is required' });
    }
    if (reason.length > BOOK_BLOCK_REASON_MAX_LENGTH) {
      return res.status(400).json({
        message: `Block reason is too long (max ${BOOK_BLOCK_REASON_MAX_LENGTH} chars)`,
      });
    }

    let result: BookStatusUpdateResult;

    if (source === 'personal_books') {
      result = await updatePersonalBookStatusHelper(id, status, reason, req);
    } else if (source === 'club_books') {
      result = await updateClubBookStatusHelper(id, status, reason, req);
    } else {
      result = await updateRegularBookStatusHelper(id, status, reason, req);
    }

    if (!result.success) {
      return res.status(result.error ? 500 : 404).json({ message: result.message });
    }

    return res.json({ message: result.message, status: result.status });
  } catch (error) {
    console.error('Error updating book status:', error);
    return res.status(500).json({ message: 'Internal server error' });
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

    const conditions: SQL<unknown>[] = [];
    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`;
      conditions.push(sql`LOWER(${clubs.title}) LIKE ${searchPattern}`);
    }
    if (status) {
      conditions.push(eq(clubs.status, status as typeof clubs.$inferSelect['status']));
    }

    let whereClause: SQL<unknown>;
    if (conditions.length === 0) {
      whereClause = sql`true`;
    } else if (conditions.length === 1) {
      whereClause = conditions[0];
    } else {
      whereClause = and(...conditions) as SQL<unknown>;
    }

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

// Обновить статус клуба
// Переход из pending в non-pending должен идти через approve/reject для сохранения модерационного flow.
router.put('/clubs/:id/status', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: unknown };

    if (!isAdminClubStatus(status)) {
      return res.status(400).json({
        message: 'Invalid club status',
        allowed: ADMIN_CLUB_STATUSES,
      });
    }

    const club = await storage.getClub(id);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (club.status === 'pending' && status !== 'pending') {
      return res.status(400).json({
        message: 'Pending clubs must be moderated via approve/reject endpoints',
      });
    }

    if (club.status === status) {
      return res.json({ message: 'Club status unchanged', club });
    }

    const updates: Partial<typeof clubs.$inferInsert> = { status };

    if (status === 'archived') {
      updates.archivedAt = new Date();
    } else if (club.status === 'archived') {
      updates.archivedAt = null;
    }

    const [updatedClub] = await db
      .update(clubs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, id))
      .returning();

    if (!updatedClub) {
      return res.status(500).json({ message: 'Failed to update club status' });
    }

    await logAction(
      req,
      'update_club',
      'club',
      id,
      `Changed club status from ${club.status} to ${status}`,
      club.status,
      status
    );

    res.json({
      message: 'Club status updated successfully',
      club: updatedClub,
    });
  } catch (error) {
    console.error('Error updating club status:', error);
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
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    
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

    if (!rawReason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const clubOwner = await storage.getUser(club.ownerId);
    if (!clubOwner?.email) {
      return res.status(400).json({ message: 'Cannot reject club: owner email not found' });
    }

    const emailSent = await emailService.sendClubRejectionNotification({
      email: clubOwner.email,
      username: clubOwner.username,
      clubTitle: club.title,
      reason: rawReason,
    });

    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send rejection email to club owner' });
    }

    const deleted = await storage.deleteClub(id);
    if (!deleted) {
      return res.status(500).json({ message: 'Failed to delete rejected club' });
    }
    
    await logAction(
      req,
      'delete_club',
      'club',
      id,
      rawReason,
      'pending',
      'deleted'
    );
    
    logger.info({
      clubId: id,
      clubTitle: club.title,
      ownerEmail: clubOwner.email,
      reason: rawReason,
      moderator: req.user?.username
    }, 'Club rejected and deleted');
    
    res.json({ 
      message: 'Club rejected and deleted successfully'
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

// ==== ADMIN AUDIT LOGS ====

// Получить логи админских действий
router.get('/audit-logs', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { 
      page = '1', 
      limit = '50', 
      action, 
      adminId, 
      targetType, 
      dateFrom, 
      dateTo 
    } = req.query;

    const pageNum = Math.max(1, Number.parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit as string) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Получаем логи с фильтрами
    const logs = await storage.getAdminActionLogs({
      limit: limitNum,
      offset,
      action: action as string,
      adminId: adminId as string, 
      targetType: targetType as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    const totalCount = await storage.getAdminActionLogsCount({
      action: action as string,
      adminId: adminId as string,
      targetType: targetType as string, 
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Получить статистику админских действий
router.get('/audit-stats', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = Math.min(365, Math.max(1, Number.parseInt(days as string) || 30));
    
    const stats = await storage.getAdminActionStats(daysNum);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== SECURITY SETTINGS ====

// Получить настройки безопасности
router.get('/security-settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const settings = await storage.getSettingsByCategory('security');
    const securitySettings: Record<string, string> = {};
    
    settings.forEach(s => {
      securitySettings[s.key] = s.value || '';
    });
    
    res.json({
      success: true,
      settings: {
        'security.impersonation.enabled': securitySettings['security.impersonation.enabled'] || 'true',
        'security.impersonation.log_retention_days': securitySettings['security.impersonation.log_retention_days'] || '90',
        'security.admin_session_timeout': securitySettings['security.admin_session_timeout'] || '60'
      }
    });
  } catch (error) {
    console.error('Error fetching security settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Обновить настройки безопасности
router.put('/security-settings', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { impersonationEnabled, logRetentionDays, adminSessionTimeout } = req.body;
    
    const settingsToSave = [
      {
        key: 'security.impersonation.enabled',
        value: impersonationEnabled ? 'true' : 'false',
        category: 'security',
        description: 'Enable/disable admin impersonation feature',
        updatedBy: req.user!.userId
      },
      {
        key: 'security.impersonation.log_retention_days', 
        value: String(Math.max(1, Number.parseInt(logRetentionDays) || 90)),
        category: 'security',
        description: 'Days to retain impersonation logs',
        updatedBy: req.user!.userId
      },
      {
        key: 'security.admin_session_timeout',
        value: String(Math.max(15, Number.parseInt(adminSessionTimeout) || 60)),
        category: 'security', 
        description: 'Admin session timeout in minutes',
        updatedBy: req.user!.userId
      }
    ];
    
    for (const setting of settingsToSave) {
      await storage.setSetting(setting);
    }
    
    await logAction(
      req,
      'update_settings',
      'settings',
      'security',
      'Updated security settings'
    );
    
    res.json({
      success: true,
      message: 'Security settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
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

// ==== FEEDBACK SETTINGS ====

// Получить настройки обратной связи
router.get('/settings/feedback', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const feedbackSettings = await storage.getSettingsByCategory('feedback');

    const settings: Record<string, string> = {};
    feedbackSettings.forEach((s) => {
      settings[s.key] = s.value || '';
    });

    res.json({
      success: true,
      settings: {
        'feedback.emails': settings['feedback.emails'] || '',
      },
    });
  } catch (error) {
    console.error('Error fetching feedback settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Сохранить настройки обратной связи
router.put('/settings/feedback', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || typeof emails !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email addresses are required'
      });
    }

    // Валидация email адресов
    const emailList = emails.split(',').map(email => email.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    for (const email of emailList) {
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: `Invalid email format: ${email}`
        });
      }
    }

    // Сохраняем настройку
    await storage.setSetting({
      key: 'feedback.emails',
      value: emails,
      category: 'feedback',
      description: 'Email addresses for feedback notifications (comma-separated)',
      updatedBy: req.user!.userId
    });

    // Логируем действие админа
    await logAction(
      req,
      'update_settings',
      'settings',
      'feedback',
      'Updated feedback email settings'
    );

    logger.info({ admin: req.user?.username }, 'Feedback settings updated');

    res.json({
      success: true,
      message: 'Feedback settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving feedback settings:', error);
    res.status(500).json({ message: 'Failed to save feedback settings' });
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

    let source: string;
    if (canonicalUrl) {
      source = 'database';
    } else if (envConfigured) {
      source = 'environment';
    } else {
      source = 'fallback';
    }

    res.json({
      settings: {
        canonicalUrl: canonicalUrl || '',
        effectiveUrl,
        source,
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

// ==== CLUB MANAGEMENT ====

/**
 * PUT /api/v1/admin/clubs/:id/privacy
 * Изменить статус публичности клуба (isPrivate)
 * Только для админов/модераторов
 */
router.put('/clubs/:id/privacy', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ message: 'isPublic field is required and must be a boolean' });
    }

    // Конвертируем isPublic (client) в isPrivate (server)
    // isPublic = false -> isPrivate = true (закрытый клуб)
    // isPublic = true -> isPrivate = false (публичный клуб)
    const isPrivate = !isPublic;

    const updatedClub = await storage.updateClubPrivacy(id, isPrivate);

    if (!updatedClub) {
      return res.status(404).json({ message: 'Club not found' });
    }

    await logAction(
      req,
      'update_club_privacy',
      'club',
      id,
      `Changed privacy to ${isPrivate ? 'private' : 'public'}`,
      undefined,
      String(isPrivate)
    );

    res.json({
      message: 'Club privacy updated successfully',
      is_public: isPublic
    });
  } catch (error) {
    console.error('Error updating club privacy:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ==== STUDIO RECORDINGS MANAGEMENT ====

router.get('/recordings', jwtAuth, requireModerator, async (req, res) => {
  try {
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const clubId = typeof req.query.clubId === 'string' && req.query.clubId.trim() ? req.query.clubId.trim() : null;
    const readerId = typeof req.query.readerId === 'string' && req.query.readerId.trim() ? req.query.readerId.trim() : null;
    const bookId = typeof req.query.bookId === 'string' && req.query.bookId.trim() ? req.query.bookId.trim() : null;
    const sort = req.query.sort === 'asc' ? 'asc' : 'desc';

    const files = await listStudioRecordingFiles();
    const sessionMetaMap = await getStudioRecordingSessionMeta([...new Set(files.map((file) => file.sessionId))]);
    const durationEntries = await Promise.all(
      files.map(async (file) => [file.id, await probeStudioRecordingDurationSeconds(file.filePath)] as const),
    );
    const durationMap = new Map(durationEntries);

    const recordings = files.map((file) => {
      const meta = sessionMetaMap.get(file.sessionId);
      return {
        id: file.id,
        fileName: file.fileName,
        sessionId: file.sessionId,
        clubId: meta?.clubId ?? null,
        clubName: meta?.clubName ?? 'Неизвестный клуб',
        bookId: meta?.bookId ?? null,
        bookTitle: meta?.bookTitle ?? 'Неизвестная книга',
        chapter: meta?.currentChapter ?? null,
        readerId: meta?.readerId ?? null,
        readerName: meta?.readerName ?? 'Неизвестный чтец',
        recordedAt: file.recordedAt,
        sessionStartedAt: meta?.startedAt?.toISOString() ?? null,
        durationSeconds: durationMap.get(file.id) ?? null,
        fileSize: file.fileSize,
        streamUrl: `/api/v1/admin/recordings/${encodeURIComponent(file.id)}/stream`,
        downloadUrl: `/api/v1/admin/recordings/${encodeURIComponent(file.id)}/download`,
      };
    });

    const clubs = Array.from(
      new Map(
        recordings
          .filter((recording) => recording.clubId !== null)
          .map((recording) => [recording.clubId as string, { id: recording.clubId as string, name: recording.clubName }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const readers = Array.from(
      new Map(
        recordings
          .filter((recording) => recording.readerId !== null)
          .map((recording) => [recording.readerId as string, { id: recording.readerId as string, name: recording.readerName }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const books = Array.from(
      new Map(
        recordings
          .filter((recording) => recording.bookId !== null)
          .map((recording) => [recording.bookId as string, { id: recording.bookId as string, name: recording.bookTitle }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const filtered = recordings.filter((recording) => {
      const meta = sessionMetaMap.get(recording.sessionId);
      if (!recordingMatchesSearch(search, {
        id: recording.id,
        fileName: recording.fileName,
        filePath: '',
        sessionId: recording.sessionId,
        fileSize: recording.fileSize,
        recordedAt: recording.recordedAt,
      }, meta)) {
        return false;
      }

      if (clubId && recording.clubId !== clubId) {
        return false;
      }

      if (readerId && recording.readerId !== readerId) {
        return false;
      }

      if (bookId && recording.bookId !== bookId) {
        return false;
      }

      return true;
    });

    filtered.sort((left, right) => {
      const diff = left.recordedAt.localeCompare(right.recordedAt);
      return sort === 'asc' ? diff : -diff;
    });

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      recordings: paginated,
      filters: {
        clubs,
        readers,
        books,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list admin studio recordings');
    res.status(500).json({ message: 'Не удалось получить список записей эфиров' });
  }
});

router.get('/recordings/:id/download', jwtAuth, requireModerator, async (req, res) => {
  try {
    const filePath = resolveStudioRecordingPath(req.params.id);
    if (!filePath) {
      return res.status(400).json({ message: 'Некорректный идентификатор записи' });
    }

    await fs.access(filePath);
    res.download(filePath, path.basename(filePath));
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({ message: 'Файл записи не найден' });
    }

    logger.error({ error }, 'Failed to download admin studio recording');
    res.status(500).json({ message: 'Не удалось скачать запись эфира' });
  }
});

router.get('/recordings/:id/stream', jwtAuth, requireModerator, async (req, res) => {
  try {
    const filePath = resolveStudioRecordingPath(req.params.id);
    if (!filePath) {
      return res.status(400).json({ message: 'Некорректный идентификатор записи' });
    }

    await fs.access(filePath);
    res.setHeader('Cache-Control', 'no-store');
    await sendFileRangeResponse(req, res, filePath);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({ message: 'Файл записи не найден' });
    }

    logger.error({ error }, 'Failed to stream admin studio recording');
    res.status(500).json({ message: 'Не удалось открыть запись эфира' });
  }
});

router.delete('/recordings/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const filePath = resolveStudioRecordingPath(req.params.id);
    if (!filePath) {
      return res.status(400).json({ message: 'Некорректный идентификатор записи' });
    }

    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Запись эфира удалена',
    });
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({ message: 'Файл записи не найден' });
    }

    logger.error({ error }, 'Failed to delete admin studio recording');
    res.status(500).json({ message: 'Не удалось удалить запись эфира' });
  }
});

// Массовое удаление записей
router.delete('/recordings', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Необходимо передать массив идентификаторов ids' });
    }

    const MAX_BATCH = 200;
    if (ids.length > MAX_BATCH) {
      return res.status(400).json({ message: `За один запрос можно удалить не более ${MAX_BATCH} записей` });
    }

    let deleted = 0;
    let notFound = 0;

    await Promise.all(
      ids.map(async (id: unknown) => {
        if (typeof id !== 'string') return;
        const filePath = resolveStudioRecordingPath(id);
        if (!filePath) return;
        try {
          await fs.unlink(filePath);
          deleted++;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'ENOENT') {
            notFound++;
          } else {
            logger.warn({ error: err, id }, 'Failed to delete admin studio recording in batch');
          }
        }
      }),
    );

    res.json({ success: true, deleted, notFound });
  } catch (error) {
    logger.error({ error }, 'Failed to batch delete admin studio recordings');
    res.status(500).json({ message: 'Не удалось удалить записи эфиров' });
  }
});

// ─── DM-модерация ─────────────────────────────────────────────────────────────

/**
 * GET /admin/dm/reports
 * Список жалоб на сообщения (только для fullAdmin)
 */
router.get('/dm/reports', jwtAuth, requireFullAdmin, async (req, res) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await db
      .select({
        report: dmReports,
        message: { id: directMessages.id, body: directMessages.body, senderId: directMessages.senderId, conversationId: directMessages.conversationId, isDeleted: directMessages.isDeleted, createdAt: directMessages.createdAt },
        reporter: { id: users.id, username: users.username },
      })
      .from(dmReports)
      .innerJoin(directMessages, eq(dmReports.messageId, directMessages.id))
      .innerJoin(users, eq(dmReports.reporterId, users.id))
      .where(eq(dmReports.status, status as 'pending' | 'reviewed' | 'dismissed'))
      .orderBy(desc(dmReports.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ success: true, reports: rows, total: rows.length });
  } catch (error) {
    logger.error({ error }, 'Failed to list dm reports');
    res.status(500).json({ message: 'Не удалось получить жалобы' });
  }
});

/**
 * GET /admin/dm/conversations/:conversationId
 * Просмотр переписки администратором — только по жалобе, с логированием
 */
router.get('/dm/conversations/:conversationId', jwtAuth, requireFullAdmin, async (req, res) => {
  const adminId = req.user!.id;
  const { conversationId } = req.params;
  const reportId = req.query.reportId as string | undefined;
  const reason = req.query.reason as string | undefined;

  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ message: 'Укажите причину просмотра (параметр reason, мин. 5 символов)' });
  }

  try {
    // Проверяем, что диалог существует
    const conv = await db
      .select({ id: conversations.id, participantA: conversations.participantA, participantB: conversations.participantB })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv.length) {
      return res.status(404).json({ message: 'Диалог не найден' });
    }

    // Логируем доступ
    await db.insert(dmAdminAccessLog).values({
      adminId,
      conversationId,
      reportId: reportId ?? null,
      reason: reason.trim(),
    });

    await logAction(req, 'view_dm_conversation', 'message', conversationId, JSON.stringify({ reportId, reason: reason.trim() }));

    // Читаем сообщения (последние 100)
    const messages = await db
      .select()
      .from(directMessages)
      .where(eq(directMessages.conversationId, conversationId))
      .orderBy(desc(directMessages.createdAt))
      .limit(100);

    res.json({ success: true, conversation: conv[0], messages });
  } catch (error) {
    logger.error({ error }, 'Failed to view dm conversation as admin');
    res.status(500).json({ message: 'Не удалось загрузить переписку' });
  }
});

/**
 * POST /admin/dm/reports/:reportId/review
 * Закрыть жалобу (reviewed / dismissed)
 */
router.post('/dm/reports/:reportId/review', jwtAuth, requireFullAdmin, async (req, res) => {
  const adminId = req.user!.id;
  const { reportId } = req.params;
  const { status } = req.body as { status: 'reviewed' | 'dismissed' };

  if (!['reviewed', 'dismissed'].includes(status)) {
    return res.status(400).json({ message: 'status должен быть reviewed или dismissed' });
  }

  try {
    const updated = await db
      .update(dmReports)
      .set({ status, reviewedBy: adminId, reviewedAt: new Date() })
      .where(and(eq(dmReports.id, reportId), eq(dmReports.status, 'pending')))
      .returning({ id: dmReports.id });

    if (!updated.length) {
      return res.status(404).json({ message: 'Жалоба не найдена или уже закрыта' });
    }

    const actionType = status === 'reviewed' ? 'review_dm_report' : 'dismiss_dm_report';
    await logAction(req, actionType, 'message', reportId, JSON.stringify({ status }));

    res.json({ success: true, reportId, status });
  } catch (error) {
    logger.error({ error }, 'Failed to review dm report');
    res.status(500).json({ message: 'Не удалось закрыть жалобу' });
  }
});

export default router;
