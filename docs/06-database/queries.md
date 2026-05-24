# Запросы

## Обзор

В этом разделе описаны основные SQL-запросы и способы их выполнения в приложении VoxLibris с использованием Drizzle ORM.

## Структура файлов

Запросы реализованы в репозиториях, которые находятся в директории `server/repositories/`:

```
server/repositories/
├── UserRepository.ts
├── ClubRepository.ts
├── BookRepository.ts
├── ReadingSessionRepository.ts
├── ReactionRepository.ts
├── QuestionRepository.ts
├── NotificationRepository.ts
├── ScheduledSessionRepository.ts
├── ModerationRepository.ts
└── ReadingProgressRepository.ts
```

## Принципы работы с запросами

### 1. Использование репозиториев

Каждый репозиторий отвечает за работу с определенной сущностью:

```typescript
// server/repositories/UserRepository.ts
import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '../database/client';
import { users } from '../database/schema';

export class UserRepository {
  async findById(id: number) {
    return await db.select().from(users).where(eq(users.id, id)).limit(1);
  }

  async findByEmail(email: string) {
    return await db.select().from(users).where(eq(users.email, email)).limit(1);
  }

  async createUser(userData: typeof users.$inferInsert) {
    return await db.insert(users).values(userData).returning();
  }

  async updateUser(id: number, userData: Partial<typeof users.$inferInsert>) {
    return await db.update(users).set(userData).where(eq(users.id, id)).returning();
  }

  async deleteUser(id: number) {
    return await db.delete(users).where(eq(users.id, id));
  }
}
```

### 2. Сложные запросы с соединениями

Для сложных запросов с соединениями таблиц:

```typescript
// server/repositories/ClubRepository.ts
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../database/client';
import { clubs, clubMembers, users } from '../database/schema';

export class ClubRepository {
  async getClubWithMembers(clubId: number) {
    return await db
      .select({
        club: clubs,
        members: {
          id: users.id,
          name: users.name,
          email: users.email,
          role: clubMembers.role
        }
      })
      .from(clubs)
      .leftJoin(clubMembers, eq(clubs.id, clubMembers.clubId))
      .leftJoin(users, eq(clubMembers.userId, users.id))
      .where(eq(clubs.id, clubId));
  }

  async getPublicClubsWithMemberCount(limit: number = 10, offset: number = 0) {
    return await db
      .select({
        club: clubs,
        memberCount: count(clubMembers.userId).as('member_count')
      })
      .from(clubs)
      .leftJoin(clubMembers, eq(clubs.id, clubMembers.clubId))
      .where(eq(clubs.isPublic, true))
      .groupBy(clubs.id)
      .orderBy(desc(count(clubMembers.userId)))
      .limit(limit)
      .offset(offset);
  }
}
```

## Основные типы запросов

### 1. Простые CRUD операции

#### Создание (INSERT)

```typescript
import { db } from '../database/client';
import { users } from '../database/schema';

async function createUser(userData) {
  const [newUser] = await db.insert(users).values(userData).returning();
  return newUser;
}
```

#### Чтение (SELECT)

```typescript
// Получение одной записи
async function getUserById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// Получение нескольких записей
async function getUsers(limit: number = 10) {
  return await db.select().from(users).limit(limit);
}

// Условный запрос
async function getActiveUsers() {
  return await db
    .select()
    .from(users)
    .where(eq(users.isActive, true));
}
```

#### Обновление (UPDATE)

```typescript
async function updateUser(id: number, updateData) {
  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();
  return updatedUser;
}
```

#### Удаление (DELETE)

```typescript
async function deleteUser(id: number) {
  return await db.delete(users).where(eq(users.id, id));
}
```

### 2. Запросы с условиями

```typescript
import { eq, ne, gt, lt, inArray, like, and, or } from 'drizzle-orm';

// Совпадение значения
const user = await db.select().from(users).where(eq(users.id, 1));

// Несколько условий
const activeAdmins = await db
  .select()
  .from(users)
  .where(and(
    eq(users.role, 'admin'),
    eq(users.isVerified, true)
  ));

// Поиск по шаблону
const gmailUsers = await db
  .select()
  .from(users)
  .where(like(users.email, '%@gmail.com'));

// Вхождение в список
const specificUsers = await db
  .select()
  .from(users)
  .where(inArray(users.id, [1, 2, 3]));
```

### 3. Запросы с агрегацией

```typescript
import { count, avg, sum, max, min } from 'drizzle-orm';

// Подсчет записей
const userCount = await db.select({ count: count() }).from(users);

// Подсчет с условием
const adminCount = await db
  .select({ count: count() })
  .from(users)
  .where(eq(users.role, 'admin'));

// Среднее значение
const avgRating = await db
  .select({ average: avg(books.rating) })
  .from(books);
```

## Специфические запросы приложения

### Получение книг клуба с информацией о загрузчике

```typescript
// server/repositories/BookRepository.ts
async function getClubBooks(clubId: number) {
  return await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      description: books.description,
      coverUrl: books.coverUrl,
      uploader: {
        id: users.id,
        name: users.name
      },
      uploadedAt: books.uploadedAt
    })
    .from(books)
    .innerJoin(users, eq(books.uploaderId, users.id))
    .where(eq(books.clubId, clubId));
}
```

### Получение активных сессий с информацией о книге и клубе

```typescript
// server/repositories/ReadingSessionRepository.ts
async function getActiveSessions() {
  return await db
    .select({
      session: readingSessions,
      book: {
        id: books.id,
        title: books.title,
        author: books.author
      },
      club: {
        id: clubs.id,
        name: clubs.name
      }
    })
    .from(readingSessions)
    .innerJoin(books, eq(readingSessions.bookId, books.id))
    .innerJoin(clubs, eq(readingSessions.clubId, clubs.id))
    .where(eq(readingSessions.status, 'active'));
}
```

### Получение прогресса чтения пользователя в сессии

```typescript
// server/repositories/ReadingProgressRepository.ts
async function getUserProgress(userId: number, sessionId: number) {
  const [progress] = await db
    .select()
    .from(readingProgress)
    .where(and(
      eq(readingProgress.userId, userId),
      eq(readingProgress.sessionId, sessionId)
    ));
  return progress;
}
```

## Транзакции

Для выполнения нескольких операций с гарантией целостности данных:

```typescript
import { db } from '../database/client';

async function transferBookOwnership(bookId: number, newOwnerId: number) {
  return await db.transaction(async (trx) => {
    // Обновляем владельца книги
    const [updatedBook] = await trx
      .update(books)
      .set({ uploaderId: newOwnerId })
      .where(eq(books.id, bookId))
      .returning();

    // Добавляем запись в историю
    await trx.insert(bookOwnershipHistory).values({
      bookId: bookId,
      previousOwnerId: updatedBook.uploaderId,
      newOwnerId: newOwnerId,
      transferredAt: new Date()
    });

    return updatedBook;
  });
}
```

## Оптимизация запросов

### 1. Использование индексов

Для оптимизации запросов важно использовать индексы:

```typescript
// Пример индексов из схемы
export const idxUsersEmail = index('idx_users_email').on(users.email);
export const idxBooksUploader = index('idx_books_uploader').on(books.uploaderId);
export const idxSessionsClub = index('idx_sessions_club').on(readingSessions.clubId);
```

### 2. Ограничение результатов

Всегда ограничивайте количество возвращаемых записей:

```typescript
// Хорошо
const users = await db.select().from(users).limit(50);

// Плохо - может вернуть много данных
const users = await db.select().from(users);
```

### 3. Выбор только необходимых полей

Используйте селекторы для получения только нужных полей:

```typescript
// Выбираем только необходимые поля
const userNames = await db
  .select({ name: users.name, email: users.email })
  .from(users);

// Вместо всех полей
const allUsers = await db.select().from(users);
```

## Обработка ошибок

```typescript
import { and, eq } from 'drizzle-orm';

async function safeUserUpdate(id: number, data: any) {
  try {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
      
    if (!updatedUser) {
      throw new Error('User not found');
    }
    
    return updatedUser;
  } catch (error) {
    if (error instanceof SomeDatabaseError) {
      // Обработка специфичных ошибок базы данных
      throw new Error(`Database error: ${error.message}`);
    }
    throw error;
  }
}
```

## Рекомендации

1. Всегда используйте параметризованные запросы для предотвращения SQL-инъекций
2. Применяйте транзакции при работе с несколькими связанными сущностями
3. Используйте индексы для часто запрашиваемых полей
4. Ограничивайте количество возвращаемых записей
5. Выбирайте только необходимые поля, особенно при соединениях
6. Обрабатывайте ошибки базы данных должным образом
7. Используйте репозитории для инкапсуляции логики запросов
8. Покрывайте сложные запросы тестами
9. Проверяйте производительность запросов с помощью EXPLAIN ANALYZE
10. Документируйте сложные запросы с объяснением их логики