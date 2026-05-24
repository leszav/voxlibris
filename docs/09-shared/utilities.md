# Утилиты

## Обзор

В этом разделе описаны общие утилиты и функции, которые используются как в клиентской, так и в серверной части приложения VoxLibris.

## Структура файлов

Общие утилиты находятся в директории `shared/`:

```
shared/
├── types.ts
├── validators.ts
├── constants.ts
├── utils.ts
└── schemas.ts
```

## Типы

### shared/types.ts

Файл, содержащий общие типы данных:

```typescript
// Типы пользователей
export interface User {
  id: number;
  email: string;
  name: string;
  bio?: string;
  profilePicture?: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'user' | 'moderator' | 'admin';

// Типы клубов
export interface Club {
  id: number;
  name: string;
  description?: string;
  ownerId: number;
  isPublic: boolean;
  coverImage?: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubMember {
  clubId: number;
  userId: number;
  role: ClubRole;
  joinedAt: Date;
}

export type ClubRole = 'owner' | 'moderator' | 'member';

// Типы книг
export interface Book {
  id: number;
  title: string;
  author: string;
  description?: string;
  coverUrl?: string;
  contentUrl: string;
  uploaderId: number;
  clubId?: number;
  totalPages?: number;
  totalChapters?: number;
  size?: number;
  format: BookFormat;
  uploadedAt: Date;
  updatedAt: Date;
}

export type BookFormat = 'epub' | 'pdf' | 'fb2' | 'mobi';

// Типы сессий чтения
export interface ReadingSession {
  id: number;
  bookId: number;
  clubId: number;
  hostId: number;
  title?: string;
  description?: string;
  startedAt?: Date;
  endedAt?: Date;
  status: SessionStatus;
  maxParticipants: number;
  currentParticipants: number;
  currentChapter: number;
  currentPosition: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionStatus = 'scheduled' | 'active' | 'finished';

// Типы прогресса чтения
export interface ReadingProgress {
  userId: number;
  sessionId: number;
  chapterIndex: number;
  position: number; // 0.00 - 1.00
  lastReadAt: Date;
  finished: boolean;
}

// Типы уведомлений
export interface Notification {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: NotificationType;
  read: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType = 
  | 'CLUB_INVITE'
  | 'BOOK_ADDED'
  | 'SESSION_STARTED'
  | 'SESSION_REMINDER'
  | 'CLUB_UPDATE'
  | 'MESSAGE_RECEIVED';
```

## Валидаторы

### shared/validators.ts

Файл, содержащий общие валидаторы с использованием Zod:

```typescript
import { z } from 'zod';

// Схемы валидации пользователей
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  profilePicture: z.string().url().optional(),
  role: z.enum(['user', 'moderator', 'admin']),
  isVerified: z.boolean(),
  createdAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
});

// Схемы валидации клубов
export const clubSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ownerId: z.number(),
  isPublic: z.boolean(),
  coverImage: z.string().url().optional(),
  memberCount: z.number(),
  createdAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
});

export const createClubSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

// Схемы валидации книг
export const bookSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(200),
  author: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  coverUrl: z.string().url().optional(),
  contentUrl: z.string().url(),
  uploaderId: z.number(),
  clubId: z.number().optional(),
  totalPages: z.number().optional(),
  totalChapters: z.number().optional(),
  size: z.number().optional(),
  format: z.enum(['epub', 'pdf', 'fb2', 'mobi']),
  uploadedAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
});

export const uploadBookSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  clubId: z.number().optional(),
});

// Схемы валидации сессий чтения
export const readingSessionSchema = z.object({
  id: z.number(),
  bookId: z.number(),
  clubId: z.number(),
  hostId: z.number(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  startedAt: z.instanceof(Date).optional(),
  endedAt: z.instanceof(Date).optional(),
  status: z.enum(['scheduled', 'active', 'finished']),
  maxParticipants: z.number(),
  currentParticipants: z.number(),
  currentChapter: z.number(),
  currentPosition: z.number().min(0).max(1),
  createdAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
});

export const createReadingSessionSchema = z.object({
  bookId: z.number(),
  clubId: z.number(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});
```

## Константы

### shared/constants.ts

Файл, содержащий общие константы:

```typescript
// Ограничения
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_UPLOAD_COUNT_PER_DAY = 10;
export const MAX_MEMBERS_PER_CLUB = 100;
export const MAX_PARTICIPANTS_PER_SESSION = 50;

// Форматы файлов
export const ALLOWED_BOOK_FORMATS = ['epub', 'pdf', 'fb2', 'mobi'] as const;
export const ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;

// Типы уведомлений
export const NOTIFICATION_TYPES = {
  CLUB_INVITE: 'CLUB_INVITE',
  BOOK_ADDED: 'BOOK_ADDED',
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_REMINDER: 'SESSION_REMINDER',
  CLUB_UPDATE: 'CLUB_UPDATE',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
} as const;

// Статусы сессий
export const SESSION_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  FINISHED: 'finished',
} as const;

// Роли в клубах
export const CLUB_ROLES = {
  OWNER: 'owner',
  MODERATOR: 'moderator',
  MEMBER: 'member',
} as const;

// Роли пользователей
export const USER_ROLES = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const;

// Типы реакций
export const REACTION_TYPES = {
  LIKE: 'like',
  LOVE: 'love',
  LAUGH: 'laugh',
  SURPRISED: 'surprised',
  SAD: 'sad',
  ANGRY: 'angry',
} as const;

// Периоды отчетов
export const REPORT_PERIODS = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

// Коды ошибок
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;
```

## Утилиты

### shared/utils.ts

Файл, содержащий общие утилиты:

```typescript
import { ERROR_CODES } from './constants';

/**
 * Генерирует безопасный токен для приглашений
 */
export function generateInviteToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Проверяет, является ли строка допустимым email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Проверяет, является ли строка допустимым URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Обрезает строку до указанной длины и добавляет троеточие
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Определяет формат книги по расширению файла
 */
export function getBookFormat(filename: string): string | null {
  const parts = filename.split('.');
  if (parts.length === 0) {
    return null;
  }
  
  const extension = parts[parts.length - 1].toLowerCase();
  const validFormats = ['epub', 'pdf', 'fb2', 'mobi'];
  
  if (validFormats.includes(extension)) {
    return extension;
  }
  
  return null;
}

/**
 * Форматирует размер файла в человекочитаемый формат
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Сравнивает два объекта на равенство
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) {
    return true;
  }
  
  if (obj1 == null || obj2 == null) {
    return false;
  }
  
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  for (const key of keys1) {
    if (!keys2.includes(key)) {
      return false;
    }
    
    if (!deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Преобразует строку в формат slug
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Создает ошибку с кодом и дополнительными данными
 */
export function createError(code: keyof typeof ERROR_CODES, message: string, data?: any) {
  const error = new Error(message) as any;
  error.code = code;
  if (data) {
    error.data = data;
  }
  return error;
}

/**
 * Проверяет, является ли пользователь владельцем клуба
 */
export function isClubOwner(userId: number, club: { ownerId: number }): boolean {
  return userId === club.ownerId;
}

/**
 * Проверяет, является ли пользователь модератором или владельцем клуба
 */
export function isClubModerator(userId: number, club: { ownerId: number }, roles: string[]): boolean {
  return isClubOwner(userId, club) || roles.includes('moderator');
}
```

## Схемы

### shared/schemas.ts

Файл, содержащий общие схемы для валидации:

```typescript
import { z } from 'zod';

// Схема для обновления профиля пользователя
export const userProfileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  profilePicture: z.string().url().optional(),
});

// Схема для смены пароля
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match",
  path: ["confirmNewPassword"],
});

// Схема для запроса сброса пароля
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// Схема для сброса пароля
export const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match",
  path: ["confirmNewPassword"],
});

// Схема для обновления информации о клубе
export const clubUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  coverImage: z.string().url().optional(),
});

// Схема для приглашения в клуб
export const clubInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  message: z.string().max(500).optional(),
});

// Схема для обновления книги
export const bookUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  author: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
});
```

## Использование в проекте

### В клиентской части

```typescript
// client/src/hooks/use-user.ts
import { z } from 'zod';
import { createUserSchema } from '@shared/validators';

export const useUser = () => {
  const createUser = async (userData: z.infer<typeof createUserSchema>) => {
    // Валидация данных перед отправкой
    const validatedData = createUserSchema.parse(userData);
    
    const response = await api.post('/users', validatedData);
    return response.data;
  };

  return { createUser };
};
```

### В серверной части

```typescript
// server/routes/user-routes.ts
import { Request, Response, Router } from 'express';
import { createUserSchema } from '@shared/validators';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    // Валидация входящих данных
    const validatedData = createUserSchema.parse(req.body);
    
    // Обработка запроса
    const user = await userService.createUser(validatedData);
    
    res.json(user);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});
```

## Рекомендации

1. Используйте общие типы для обеспечения согласованности между клиентом и сервером
2. Валидируйте данные как на клиенте, так и на сервере
3. Используйте Zod для создания схем валидации
4. Храните константы в одном месте для удобства поддержки
5. Помещайте общие утилиты в shared директорию
6. Обновляйте документацию при изменении общих типов или утилит
7. Проверяйте совместимость типов при обновлении
8. Используйте строгую типизацию для предотвращения ошибок