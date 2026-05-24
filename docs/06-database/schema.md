# Схема данных

## Обзор

В этом разделе описана структура таблиц и связей в базе данных PostgreSQL приложения VoxLibris. Для управления схемой используется Drizzle ORM.

## Структура файлов

Схема базы данных определена в файле `server/database/schema.ts`:

```
server/database/
├── schema.ts
├── connection.ts
├── client.ts
└── migrate.ts
```

## ERD диаграмма (упрощенная)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Users     │    │    Clubs    │    │   Books     │
│─────────────│    │─────────────│    │─────────────│
│ id          │    │ id          │    │ id          │
│ email       │    │ name        │    │ title       │
│ name        │    │ description │    │ author      │
│ password    │    │ owner_id    │    │ uploader_id │
│ role        │    │ is_public   │    │ uploaded_at │
│ created_at  │    │ created_at  │    │ cover_url   │
│ updated_at  │    │ updated_at  │    └─────────────┘
└─────────────┘    └─────────────┘          │
         │                   │               │
         │                   │               │
         │ 1              n │               │
         ├──────────────────┼───────────────┤
         │                   │               │
         │                   │               │
         │                   │               │
┌─────────────┐    ┌─────────────┐          │
│ ClubMembers │    │  Sessions   │          │
│─────────────│    │─────────────│          │
│ club_id     │    │ id          │          │
│ user_id     │    │ book_id     │          │
│ role        │    │ club_id     │          │
│ joined_at   │    │ started_at  │          │
└─────────────┘    │ ended_at    │          │
                   │ status      │          │
                   │ host_id     │          │
                   └─────────────┘          │
                          │                │
                          │                │
                          │ 1              │ n
                          ├────────────────┼────────────────┐
                          │                │                │
                          │                │                │
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │  Reactions  │    │  Questions  │    │  Progress   │
                   │─────────────│    │─────────────│    │─────────────│
                   │ id          │    │ id          │    │ user_id     │
                   │ session_id  │    │ session_id  │    │ session_id  │
                   │ user_id     │    │ user_id     │    │ chapter_idx │
                   │ type        │    │ content     │    │ position    │
                   │ timestamp   │    │ answered    │    │ updated_at  │
                   │ created_at  │    │ answered_at │    └─────────────┘
                   └─────────────┘    │ answered_by │
                                      │ created_at  │
                                      └─────────────┘
```

## Описание таблиц

### users

Хранит информацию о пользователях приложения:

```typescript
export const users = pgTable('users', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  bio: text('bio'), // Опциональное описание пользователя
  profilePicture: text('profile_picture'), // URL аватара
  role: varchar('role', { length: 20 }).default('user'), // user, moderator, admin
  isVerified: boolean('is_verified').default(false), // Подтверждение email
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### clubs

Хранит информацию о клубах и сообществах:

```typescript
export const clubs = pgTable('clubs', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: integer('owner_id').references(() => users.id).notNull(), // Владелец клуба
  isPublic: boolean('is_public').default(false), // Публичный ли клуб
  coverImage: text('cover_image'), // Обложка клуба
  maxMembers: integer('max_members').default(50), // Максимальное количество участников
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### clubMembers

Связывает пользователей и клубы, хранит роли участников:

```typescript
export const clubMembers = pgTable(
  'club_members',
  {
    clubId: integer('club_id')
      .references(() => clubs.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    role: varchar('role', { length: 20 }).default('member'), // owner, moderator, member
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey(table.clubId, table.userId),
  })
);
```

### books

Хранит информацию о загруженных книгах:

```typescript
export const books = pgTable('books', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  description: text('description'),
  coverUrl: text('cover_url'), // URL обложки
  contentUrl: text('content_url').notNull(), // URL файла книги
  uploaderId: integer('uploader_id').references(() => users.id).notNull(),
  clubId: integer('club_id').references(() => clubs.id), // NULL для личных книг
  totalPages: integer('total_pages'), // Количество страниц
  totalChapters: integer('total_chapters'), // Количество глав
  size: integer('size'), // Размер файла в байтах
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### readingSessions

Хранит информацию о сессиях чтения:

```typescript
export const readingSessions = pgTable('reading_sessions', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  bookId: integer('book_id').references(() => books.id).notNull(),
  clubId: integer('club_id').references(() => clubs.id).notNull(),
  hostId: integer('host_id').references(() => users.id).notNull(), // Кто ведет сессию
  title: text('title'), // Опциональный заголовок сессии
  description: text('description'), // Описание сессии
  startedAt: timestamp('started_at'), // Когда началась
  endedAt: timestamp('ended_at'), // Когда закончилась
  status: varchar('status', { length: 20 }).default('scheduled').notNull(), // scheduled, active, finished
  maxParticipants: integer('max_participants').default(50),
  currentParticipants: integer('current_participants').default(0),
  currentChapter: integer('current_chapter').default(0),
  currentPosition: decimal('current_position', { precision: 3, scale: 2 }).default('0.00'), // 0.00 - 1.00
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### sessionParticipants

Связывает пользователей и сессии чтения:

```typescript
export const sessionParticipants = pgTable(
  'session_participants',
  {
    sessionId: integer('session_id')
      .references(() => readingSessions.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    leftAt: timestamp('left_at'), // Когда покинул сессию
    isActive: boolean('is_active').default(true), // Активен ли сейчас
  },
  (table) => ({
    pk: primaryKey(table.sessionId, table.userId),
  })
);
```

### readingProgress

Хранит прогресс чтения пользователей:

```typescript
export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: integer('user_id').references(() => users.id).notNull(),
    sessionId: integer('session_id').references(() => readingSessions.id).notNull(),
    chapterIndex: integer('chapter_index').notNull(),
    position: decimal('position', { precision: 3, scale: 2 }).default('0.00').notNull(), // 0.00 - 1.00
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
    finished: boolean('finished').default(false),
  },
  (table) => ({
    pk: primaryKey(table.userId, table.sessionId),
  })
);
```

### reactions

Хранит реакции пользователей во время сессии чтения:

```typescript
export const reactions = pgTable('reactions', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  sessionId: integer('session_id').references(() => readingSessions.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  type: varchar('type', { length: 20 }).notNull(), // like, love, laugh, surprised, sad, angry
  timestamp: integer('timestamp').notNull(), // Время в секундах от начала аудио
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### questions

Хранит вопросы пользователей во время сессии чтения:

```typescript
export const questions = pgTable('questions', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  sessionId: integer('session_id').references(() => readingSessions.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  answered: boolean('answered').default(false),
  answeredAt: timestamp('answered_at'),
  answeredBy: integer('answered_by').references(() => users.id), // Кто ответил
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### notifications

Хранит уведомления пользователям:

```typescript
export const notifications = pgTable('notifications', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // club_invite, book_added, session_started, etc.
  read: boolean('read').default(false),
  metadata: json('metadata'), // Дополнительные данные (JSON)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### scheduledSessions

Хранит запланированные сессии чтения:

```typescript
export const scheduledSessions = pgTable('scheduled_sessions', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  clubId: integer('club_id').references(() => clubs.id).notNull(),
  bookId: integer('book_id').references(() => books.id).notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  duration: integer('duration').default(3600), // Продолжительность в секундах
  hostId: integer('host_id').references(() => users.id), // Кто будет вести (опционально)
  title: text('title'),
  description: text('description'),
  reminderSent: boolean('reminder_sent').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

## Индексы

Для оптимизации запросов созданы следующие индексы:

```typescript
// Индексы для таблицы пользователей
export const idxUsersEmail = index('idx_users_email').on(users.email);

// Индексы для таблицы клубов
export const idxClubsOwner = index('idx_clubs_owner').on(clubs.ownerId);
export const idxClubsPublic = index('idx_clubs_public').on(clubs.isPublic);

// Индексы для таблицы книг
export const idxBooksUploader = index('idx_books_uploader').on(books.uploaderId);
export const idxBooksClub = index('idx_books_club').on(books.clubId);

// Индексы для таблицы сессий чтения
export const idxSessionsBook = index('idx_sessions_book').on(readingSessions.bookId);
export const idxSessionsClub = index('idx_sessions_club').on(readingSessions.clubId);
export const idxSessionsHost = index('idx_sessions_host').on(readingSessions.hostId);
export const idxSessionsStatus = index('idx_sessions_status').on(readingSessions.status);

// Индексы для прогресса чтения
export const idxProgressUser = index('idx_progress_user').on(readingProgress.userId);
export const idxProgressSession = index('idx_progress_session').on(readingProgress.sessionId);
```

## Связи между таблицами

Схема включает следующие отношения:

- **Один ко многим**: 
  - users → clubs (один пользователь владеет многими клубами)
  - users → books (один пользователь загружает много книг)
  - clubs → books (один клуб имеет много книг)
  - books → readingSessions (одна книга читается в много сессий)
  - clubs → readingSessions (один клуб проводит много сессий)

- **Многие ко многим**:
  - users и clubs (через clubMembers)
  - users и readingSessions (через sessionParticipants)

- **Один ко многим с каскадным удалением**:
  - clubs → clubMembers (при удалении клуба удаляются все членства)
  - users → notifications (при удалении пользователя удаляются его уведомления)

## Безопасность

Схема включает следующие меры безопасности:

- Хранение паролей только в виде хешей
- Ограничения на уникальность email
- Проверка ролей пользователей
- Каскадное удаление связанных данных
- Ограничения на максимальные длины строк

## Рекомендации

1. Используйте транзакции при выполнении сложных операций с несколькими таблицами
2. Применяйте индексы для часто запрашиваемых полей
3. Проверяйте права доступа к данным на уровне приложения
4. Используйте связи между таблицами для обеспечения целостности данных
5. Регулярно обновляйте статистику индексов для оптимизации запросов