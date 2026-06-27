import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, foreignKey, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["user", "admin", "moderator"] as const;
export type UserRole = typeof userRoles[number];

export const userStatuses = ["pending", "active", "suspended", "deleted"] as const;
export type UserStatus = typeof userStatuses[number];

export const clubTypes = ["standard", "premium", "reader-led", "reading_club"] as const;
export type ClubType = typeof clubTypes[number];

export const clubStatuses = ["pending", "recruiting", "active", "completed", "archived"] as const;
export type ClubStatus = typeof clubStatuses[number];

export const clubMemberRoles = ["owner", "moderator", "member"] as const;
export type ClubMemberRole = typeof clubMemberRoles[number];

export const bookStatuses = ["active", "blocked", "deleted"] as const;
export type BookStatus = typeof bookStatuses[number];

// Using pgTable with extraConfig for foreign keys is the correct Drizzle ORM pattern
export const users = pgTable( // NOSONAR typescript:S1874
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    role: text("role").notNull().default("user").$type<UserRole>(),
    status: text("status").notNull().default("pending").$type<UserStatus>(),
    emailConfirmed: boolean("email_confirmed").notNull().default(false),
    confirmationToken: varchar("confirmation_token", { length: 64 }),
    invitedBy: varchar("invited_by"), // Кто пригласил пользователя
    invitedToClub: varchar("invited_to_club"), // В какой клуб приглашен
    lastActivityAt: timestamp("last_activity_at"),
    suspensionReason: text("suspension_reason"),
    suspendedUntil: timestamp("suspended_until"),
    failedLoginAttempts: integer("failed_login_attempts").default(0),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (table) => ({
    invitedByFk: foreignKey({
      columns: [table.invitedBy],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  })
);


// Refresh tokens for JWT authentication
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  isRevoked: boolean("is_revoked").notNull().default(false),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  usedAt: timestamp("used_at"),
  requestedByAdminId: varchar("requested_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  requestedFromIp: text("requested_from_ip"),
});

export const bookProcessingStatuses = ["pending", "processing", "completed", "failed"] as const;
export type BookProcessingStatus = typeof bookProcessingStatuses[number];

// Books table
export const books = pgTable("books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverUrl: text("cover_url"),
  description: text("description"),
  isbn: text("isbn"),
  language: text("language"), // Book language (ru, en, etc.)
  publisher: text("publisher"), // Book publisher
  publishDate: text("publish_date"), // Publication date/year
  totalChapters: integer("total_chapters").default(1),
  contentType: text("content_type").default("text"), // "text", "epub", "fb2"
  contentPath: text("content_path"), // Path to uploaded file in S3
  originalFilename: text("original_filename"), // Original uploaded filename
  fileSize: integer("file_size"), // File size in bytes
  uploadedBy: varchar("uploaded_by").references(() => users.id), // User who uploaded the book
  uploadedAt: timestamp("uploaded_at"), // VoxLibris Upload: when book was uploaded
  contentHash: varchar("content_hash", { length: 64 }), // VoxLibris Upload: file content hash
  wordCount: integer("word_count").default(0), // VoxLibris Upload: estimated word count
  processingStatus: text("processing_status").default("pending").$type<BookProcessingStatus>(), // VoxLibris Upload: processing status
  status: text("status").notNull().default("active").$type<BookStatus>(),
  blockedAt: timestamp("blocked_at"),
  blockReason: text("block_reason"),
  downloadCount: integer("download_count").default(0),
  // VoxLibris Upload Context
  uploadContextId: varchar("upload_context_id").references(() => uploadContexts.id, { onDelete: "cascade" }), // каскадное удаление книг при удалении контекста
  visibility: text("visibility").notNull().default("private").$type<BookVisibility>(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Book chapters/content table
export const bookContent = pgTable("book_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Clubs table
export const clubs = pgTable("clubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  coverImage: text("cover_image"), // URL обложки клуба
  bookId: varchar("book_id"), // nullable - ссылка на club_books.id (FK добавлен в миграции 0016)
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  type: text("type").notNull().default("standard").$type<ClubType>(),
  status: text("status").notNull().default("recruiting").$type<ClubStatus>(),
  maxMembers: integer("max_members").notNull().default(50),
  isPrivate: boolean("is_private").notNull().default(false), // Приватный клуб (только по приглашениям)
  isActive: boolean("is_active").notNull().default(true),
  isLive: boolean("is_live").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  popularityScore: integer("popularity_score").notNull().default(0), // Оценка популярности для сортировки
  schedule: text("schedule"), // JSON string for reading schedule
  settings: text("settings"), // JSON строка с дополнительными настройками клуба
  archivedAt: timestamp("archived_at"),
  archiveReason: text("archive_reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Club members relationship
export const clubMembers = pgTable("club_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member").$type<ClubMemberRole>(), // Роль участника в клубе
  joinedAt: timestamp("joined_at").notNull().default(sql`now()`),
  isActive: boolean("is_active").notNull().default(true),
  mutedUntil: timestamp("muted_until"),
  deactivatedUntil: timestamp("deactivated_until"),
  restrictionReason: text("restriction_reason"),
  restrictedBy: varchar("restricted_by").references(() => users.id),
  restrictedAt: timestamp("restricted_at"),
});

// Club invitations - система приглашений участников
export const invitationStatuses = ["pending", "accepted", "declined", "expired"] as const;
export type InvitationStatus = typeof invitationStatuses[number];

export const clubInvitations = pgTable("club_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  inviteToken: varchar("invite_token", { length: 64 }).notNull().unique(),
  status: text("status").notNull().default("pending").$type<InvitationStatus>(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Tags - справочник тегов/жанров
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(), // fantasy, sf_heroic, lit_rpg и т.д.
  nameRu: text("name_ru").notNull(), // фэнтези, героическая фантастика, литРПГ
  nameEn: text("name_en").notNull(), // fantasy, heroic fantasy, LitRPG
  description: text("description"), // описание жанра
  category: varchar("category"), // fantasy, sf, detective, romance и т.д.
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Club tags - связь клубов с тегами (many-to-many)
export const clubTags = pgTable("club_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Personal book tags - связь личных книг с тегами (many-to-many)
export const personalBookTags = pgTable("personal_book_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => personalBooks.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Club book tags - связь книг клубов с тегами (many-to-many)
export const clubBookTags = pgTable("club_book_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => clubBooks.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// System settings - настройки системы (SMTP, etc)
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  category: varchar("category", { length: 50 }).notNull().default("general"), // 'smtp', 'general', 'email', etc
  description: text("description"),
  isEncrypted: boolean("is_encrypted").notNull().default(false), // для паролей SMTP
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// RefreshToken type
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = typeof refreshTokens.$inferInsert;

// PasswordResetToken type
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  invitedBy: true,
  invitedToClub: true,
  status: true,
});

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).pick({
  token: true,
  userId: true,
  expiresAt: true,
});

export const insertBookSchema = createInsertSchema(books).pick({
  title: true,
  author: true,
  coverUrl: true,
  description: true,
  isbn: true,
  language: true,
  publisher: true,
  publishDate: true,
  totalChapters: true,
  contentType: true,
  contentPath: true,
  originalFilename: true,
  fileSize: true,
});

export const insertBookContentSchema = createInsertSchema(bookContent).pick({
  bookId: true,
  chapterNumber: true,
  title: true,
  content: true,
  wordCount: true,
});

export const insertClubSchema = createInsertSchema(clubs).omit({
  id: true,
  ownerId: true,
  status: true,
  isActive: true,
  isLive: true,
  isFeatured: true,
  archivedAt: true,
  archiveReason: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bookId: z.string().optional(), // bookId теперь необязательный - книга загружается после создания клуба
});

export const insertClubMemberSchema = createInsertSchema(clubMembers).pick({
  clubId: true,
  userId: true,
  role: true,
});

export const insertClubInvitationSchema = createInsertSchema(clubInvitations).pick({
  clubId: true,
  email: true,
  invitedBy: true,
  inviteToken: true,
  expiresAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof books.$inferSelect;

export type InsertBookContent = z.infer<typeof insertBookContentSchema>;
export type BookContent = typeof bookContent.$inferSelect;

export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubs.$inferSelect;

export type InsertClubMember = z.infer<typeof insertClubMemberSchema>;
export type ClubMember = typeof clubMembers.$inferSelect;

export type InsertClubInvitation = z.infer<typeof insertClubInvitationSchema>;
export type ClubInvitation = typeof clubInvitations.$inferSelect;

export type ClubInvitationWithInviter = ClubInvitation & {
  inviterName: string | null;
};

// Tag types
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export type ClubTag = typeof clubTags.$inferSelect;
export type InsertClubTag = typeof clubTags.$inferInsert;

export type PersonalBookTag = typeof personalBookTags.$inferSelect;
export type InsertPersonalBookTag = typeof personalBookTags.$inferInsert;

export type ClubBookTag = typeof clubBookTags.$inferSelect;
export type InsertClubBookTag = typeof clubBookTags.$inferInsert;

export const insertSettingSchema = createInsertSchema(settings).pick({
  key: true,
  value: true,
  category: true,
  description: true,
  isEncrypted: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Reading sessions table - for live reading sessions
export const readingSessions = pgTable("reading_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  readerId: varchar("reader_id").notNull().references(() => users.id),
  bookId: varchar("book_id").notNull(), // Может ссылаться на books.id или club_books.id
  title: text("title").notNull(),
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON with detailed position info
  isActive: boolean("is_active").notNull().default(true),
  isLive: boolean("is_live").notNull().default(false),
  startedAt: timestamp("started_at").notNull().default(sql`now()`),
  endedAt: timestamp("ended_at"),
  emotionalMapCache: jsonb("emotional_map_cache"),
  emotionalMapBuiltAt: timestamp("emotional_map_built_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Reading progress for individual users
export const readingProgress = pgTable("reading_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  bookId: varchar("book_id").notNull(), // Может ссылаться на books.id или personal_books.id
  clubId: varchar("club_id").references(() => clubs.id, { onDelete: "cascade" }),
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON with detailed position
  progress: integer("progress").notNull().default(0), // percentage 0-100
  lastReadAt: timestamp("last_read_at").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Reading History - completed books only
export const readingHistory = pgTable("reading_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(), // personal_books.id
  bookTitle: text("book_title").notNull(), // Статичная копия для истории
  bookAuthor: text("book_author").notNull(), // Статичная копия для истории
  bookCoverUrl: text("book_cover_url"), // Статичная копия обложки
  completedAt: timestamp("completed_at").notNull().default(sql`now()`), // Когда завершено чтение
  readingTimeMinutes: integer("reading_time_minutes").default(0), // Общее время чтения в минутах
});

// Session listeners - who is listening to which session
export const sessionListeners = pgTable("session_listeners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id),
  listenerId: varchar("listener_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").notNull().default(sql`now()`),
  leftAt: timestamp("left_at"),
  isActive: boolean("is_active").notNull().default(true),
});

// Reader ratings and feedback
export const readerRatings = pgTable("reader_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id),
  readerId: varchar("reader_id").notNull().references(() => users.id),
  raterId: varchar("rater_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(), // 1-5 stars
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// User profiles extension for readers
export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  displayName: text("display_name"),
  avatar: text("avatar"),
  coverImage: text("cover_image"), // URL обложки профиля
  bio: text("bio"),
  profileQuote: text("profile_quote"),
  profileQuoteAuthor: text("profile_quote_author"),
  favoriteGenres: text("favorite_genres"), // JSON array
  readerSettings: text("reader_settings"), // JSON с настройками ридера для синхронизации между устройствами
  isReader: boolean("is_reader").notNull().default(false),
  readerRating: integer("reader_rating").notNull().default(0), // 0-500 (5.0 * 100)
  totalReadingSessions: integer("total_reading_sessions").notNull().default(0),
  totalListeners: integer("total_listeners").notNull().default(0),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  feedLastSeenAt: timestamp("feed_last_seen_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const profileBookshelf = pgTable("profile_bookshelf", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  reviewText: text("review_text"),
  rating: integer("rating"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Schemas for validation
export const insertReadingSessionSchema = createInsertSchema(readingSessions).pick({
  clubId: true,
  bookId: true,
  title: true,
  currentChapter: true,
  currentPosition: true,
});

export const insertReadingProgressSchema = createInsertSchema(readingProgress).pick({
  bookId: true,
  clubId: true,
  currentChapter: true,
  currentPosition: true,
  progress: true,
});

export const insertReaderRatingSchema = createInsertSchema(readerRatings).pick({
  sessionId: true,
  readerId: true,
  rating: true,
  feedback: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  displayName: true,
  avatar: true,
  coverImage: true,
  bio: true,
  favoriteGenres: true,
  isReader: true,
  profileQuote: true,
  profileQuoteAuthor: true,
});

export const insertProfileBookshelfSchema = createInsertSchema(profileBookshelf).pick({
  bookId: true,
  bookType: true,
  reviewText: true,
  rating: true,
  displayOrder: true,
});

// Types for reading system
export type InsertReadingSession = z.infer<typeof insertReadingSessionSchema>;
export type ReadingSession = typeof readingSessions.$inferSelect;

export type InsertReadingProgress = z.infer<typeof insertReadingProgressSchema>;
export type ReadingProgress = typeof readingProgress.$inferSelect;

// Reading History schemas
export const insertReadingHistorySchema = createInsertSchema(readingHistory);
export type InsertReadingHistory = z.infer<typeof insertReadingHistorySchema>;
export type ReadingHistory = typeof readingHistory.$inferSelect;

export type InsertReaderRating = z.infer<typeof insertReaderRatingSchema>;
export type ReaderRating = typeof readerRatings.$inferSelect;

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export type SessionListener = typeof sessionListeners.$inferSelect;

// VoxLibris Upload System tables (ТЗ секция 7.1)
export const bookFormats = ["FB2", "EPUB"] as const;
export type BookFormat = typeof bookFormats[number];

export const bookTypes = ["personal", "club"] as const;
export type BookType = typeof bookTypes[number];

export const genreSources = ["metadata", "manual", "migration", "admin"] as const;
export type GenreSource = typeof genreSources[number];

export const accessActions = ["READ_OPENED", "READ_SESSION_END", "READ_DELETED"] as const;
export type AccessAction = typeof accessActions[number];

export const genres = pgTable("genres", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 120 }).notNull().unique(),
  labelRu: text("label_ru").notNull(),
  labelEn: text("label_en"),
  groupKey: varchar("group_key", { length: 80 }),
  description: text("description"),
  aliasesJson: text("aliases_json"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Таблица личных книг пользователя (ТЗ 7.1)
export const personalBooks = pgTable("personal_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  publicationYear: integer("publication_year"),
  genre: text("genre"),
  primaryGenreId: varchar("primary_genre_id").references(() => genres.id, { onDelete: "set null" }),
  language: text("language"),
  format: text("format").notNull().$type<BookFormat>(),
  fileHash: varchar("file_hash", { length: 64 }),
  fileSizeBytes: integer("file_size_bytes"),
  storagePath: text("storage_path").notNull(),
  encryptedContentKey: text("encrypted_content_key"),
  coverUrl: text("cover_url"),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
  isDeleted: boolean("is_deleted").notNull().default(false),
  softDeletedAt: timestamp("soft_deleted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Таблица клубных книг (ТЗ 7.1)
export const clubBooks = pgTable("club_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  publicationYear: integer("publication_year"),
  genre: text("genre"),
  primaryGenreId: varchar("primary_genre_id").references(() => genres.id, { onDelete: "set null" }),
  language: text("language"),
  format: text("format").notNull().$type<BookFormat>(),
  fileHash: varchar("file_hash", { length: 64 }),
  fileSizeBytes: integer("file_size_bytes"),
  storagePath: text("storage_path").notNull(),
  encryptedContentKey: text("encrypted_content_key"),
  coverUrl: text("cover_url"),
  recommendedReadingOrder: integer("recommended_reading_order"),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
  isDeleted: boolean("is_deleted").notNull().default(false),
  softDeletedAt: timestamp("soft_deleted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const bookGenres = pgTable("book_genres", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  genreId: varchar("genre_id").notNull().references(() => genres.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("metadata").$type<GenreSource>(),
  isPrimary: boolean("is_primary").notNull().default(false),
  confidence: integer("confidence"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Логирование доступа к книгам (ТЗ 7.1)
export const bookAccessLogs = pgTable("book_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull().$type<AccessAction>(),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
  deviceType: text("device_type"),
  sessionDurationMinutes: integer("session_duration_minutes"),
  ipHash: text("ip_hash"),
});

// VoxLibris Upload validation schemas
export const insertPersonalBookSchema = createInsertSchema(personalBooks).pick({
  title: true,
  author: true,
  description: true,
  publicationYear: true,
  genre: true,
  primaryGenreId: true,
  language: true,
  format: true,
  fileHash: true,
  fileSizeBytes: true,
  coverUrl: true,
  storagePath: true,
  encryptedContentKey: true,
});

export const insertClubBookSchema = createInsertSchema(clubBooks).pick({
  clubId: true,
  title: true,
  author: true,
  description: true,
  publicationYear: true,
  genre: true,
  primaryGenreId: true,
  language: true,
  format: true,
  fileHash: true,
  fileSizeBytes: true,
  storagePath: true,
  encryptedContentKey: true,
  coverUrl: true,
  recommendedReadingOrder: true,
});

export const insertBookAccessLogSchema = createInsertSchema(bookAccessLogs).pick({
  bookId: true,
  bookType: true,
  action: true,
  deviceType: true,
  sessionDurationMinutes: true,
  ipHash: true,
});

export const insertGenreSchema = createInsertSchema(genres).pick({
  code: true,
  labelRu: true,
  labelEn: true,
  groupKey: true,
  description: true,
  aliasesJson: true,
  sortOrder: true,
  isActive: true,
});

export const insertBookGenreSchema = createInsertSchema(bookGenres).pick({
  bookId: true,
  bookType: true,
  genreId: true,
  source: true,
  isPrimary: true,
  confidence: true,
});

// VoxLibris Upload types
export type InsertPersonalBook = z.infer<typeof insertPersonalBookSchema>;
export type PersonalBook = typeof personalBooks.$inferSelect;

export type InsertClubBook = z.infer<typeof insertClubBookSchema>;
export type ClubBook = typeof clubBooks.$inferSelect;

export type InsertBookAccessLog = z.infer<typeof insertBookAccessLogSchema>;
export type BookAccessLog = typeof bookAccessLogs.$inferSelect;

export type InsertGenre = z.infer<typeof insertGenreSchema>;
export type Genre = typeof genres.$inferSelect;

export type InsertBookGenre = z.infer<typeof insertBookGenreSchema>;
export type BookGenre = typeof bookGenres.$inferSelect;

// Admin tables for VoxLibris admin panel
export const moderationReportTypes = ["user", "club", "book", "chat", "reader"] as const;
export type ModerationReportType = typeof moderationReportTypes[number];

export const moderationReportReasons = [
  "spam", "inappropriate_content", "harassment", "copyright_violation",
  "fake_profile", "offensive_language", "underage", "other"
] as const;
export type ModerationReportReason = typeof moderationReportReasons[number];

export const moderationReportStatuses = ["new", "in_progress", "resolved", "dismissed"] as const;
export type ModerationReportStatus = typeof moderationReportStatuses[number];

export const moderationReportPriorities = ["low", "medium", "high", "critical"] as const;
export type ModerationReportPriority = typeof moderationReportPriorities[number];

export const moderationReports = pgTable("moderation_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().$type<ModerationReportType>(),
  targetId: varchar("target_id").notNull(),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().$type<ModerationReportReason>(),
  description: text("description").notNull(),
  status: text("status").notNull().default("new").$type<ModerationReportStatus>(),
  priority: text("priority").notNull().default("medium").$type<ModerationReportPriority>(),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  resolution: text("resolution"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  resolvedAt: timestamp("resolved_at"),
});

export const adminActionTypes = [
  "block_user", "unblock_user", "change_user_role", "change_user_status", "delete_user", "restore_user", "permanent_delete_user",
  "reset_password", "impersonate", "edit_user_fields", "send_test_push",
  "archive_club", "delete_club", "block_club", "unblock_club", "update_club", "update_club_privacy",
  "delete_book", "block_book", "unblock_book", "update_book_status",
  "delete_message", "block_message",
  "resolve_report", "dismiss_report", "assign_report", "update_report_status",
  "review_dm_report", "dismiss_dm_report", "view_dm_conversation",
  "update_settings", "update_smtp_settings", "test_smtp", "backup_data", "restore_data"
] as const;
export type AdminActionType = typeof adminActionTypes[number];

export const adminActionTargetTypes = ["user", "club", "book", "message", "report", "system", "settings"] as const;
export type AdminActionTargetType = typeof adminActionTargetTypes[number];

export const adminActions = pgTable("admin_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull().$type<AdminActionType>(),
  targetType: text("target_type").notNull().$type<AdminActionTargetType>(),
  targetId: varchar("target_id").notNull(),
  reason: text("reason"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  metadata: text("metadata"), // JSON string for additional data
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const systemSettingTypes = ["string", "number", "boolean", "json"] as const;
export type SystemSettingType = typeof systemSettingTypes[number];

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  type: text("type").notNull().$type<SystemSettingType>(),
  category: text("category").notNull().default("general"),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Reading status tracking
export const bookReadingStatuses = ["reading", "completed", "planned", "abandoned"] as const;
export type BookReadingStatus = typeof bookReadingStatuses[number];

export const bookReadingStatus = pgTable("book_reading_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookType: text("book_type").notNull().$type<BookType>(),
  status: text("status").notNull().$type<BookReadingStatus>(),
  progress: integer("progress").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  rating: integer("rating"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const userReadingGoals = pgTable("user_reading_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  goalBooks: integer("goal_books").notNull().default(12),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Admin schemas for validation
export const insertModerationReportSchema = createInsertSchema(moderationReports).pick({
  type: true,
  targetId: true,
  reporterId: true,
  reason: true,
  description: true,
  priority: true,
});

export const insertAdminActionSchema = createInsertSchema(adminActions).pick({
  adminId: true,
  actionType: true,
  targetType: true,
  targetId: true,
  reason: true,
  previousValue: true,
  newValue: true,
  metadata: true,
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).pick({
  key: true,
  value: true,
  type: true,
  category: true,
  description: true,
  isPublic: true,
});

// Admin Insert Types
export type InsertModerationReport = z.infer<typeof insertModerationReportSchema>;
export type ModerationReport = typeof moderationReports.$inferSelect;

export type InsertAdminAction = z.infer<typeof insertAdminActionSchema>;
export type AdminAction = typeof adminActions.$inferSelect;

export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Reading status types
export type BookReadingStatusRecord = typeof bookReadingStatus.$inferSelect;
export type InsertBookReadingStatus = typeof bookReadingStatus.$inferInsert;

export type ProfileBookshelf = typeof profileBookshelf.$inferSelect;
export type InsertProfileBookshelf = typeof profileBookshelf.$inferInsert;

export type UserReadingGoal = typeof userReadingGoals.$inferSelect;
export type InsertUserReadingGoal = typeof userReadingGoals.$inferInsert;

// Extended types for frontend
export interface ClubWithDetails extends Club {
  book: ClubBook | null;
  books?: ClubBook[];
  owner: User | null;
  tags: string[];
  memberCount: number;
  activeSessions?: ReadingSessionWithDetails[];
}

export interface ReadingSessionWithDetails extends ReadingSession {
  reader: User;
  book: Book;
  club: Club;
  listenerCount: number;
  listeners?: SessionListener[];
  readerProfile?: UserProfile;
}

export interface UserWithProfile extends User {
  profile?: UserProfile;
}

// Reader: Bookmarks
export const bookmarks = pgTable("bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  chapterNumber: integer("chapter_number"),
  position: text("position").notNull(), // JSON: {scrollTop, paragraph, offset}
  title: text("title"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Reader: Notes
export const noteColors = ["yellow", "blue", "green", "pink", "purple"] as const;
export type NoteColor = typeof noteColors[number];

export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  chapterNumber: integer("chapter_number"),
  position: text("position").notNull(), // JSON: {scrollTop, paragraph, offset}
  highlightedText: text("highlighted_text"),
  noteText: text("note_text").notNull(),
  color: varchar("color", { length: 20 }).notNull().default("yellow").$type<NoteColor>(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Reader schemas for validation
export const insertBookmarkSchema = createInsertSchema(bookmarks).pick({
  bookId: true,
  chapterNumber: true,
  position: true,
  title: true,
});

export const insertNoteSchema = createInsertSchema(notes).pick({
  bookId: true,
  chapterNumber: true,
  position: true,
  highlightedText: true,
  noteText: true,
  color: true,
});

// Reader Insert Types
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type Bookmark = typeof bookmarks.$inferSelect;

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

// WebSocket message types
export interface WebSocketMessage {
  type: 'session_start' | 'session_end' | 'position_update' | 'listener_join' | 'listener_leave' | 'rating_update' | 'progress_update' | 'bookmark_add' | 'note_add' | 'club_progress';
  payload: unknown;
  sessionId?: string;
  userId?: string;
}

export interface SessionPositionUpdate {
  sessionId: string;
  currentChapter: number;
  currentPosition: string;
  timestamp: string;
}

export interface ListenerUpdate {
  sessionId: string;
  userId: string;
  action: 'join' | 'leave';
  timestamp: string;
}

export interface ReaderProgressUpdate {
  bookId: string;
  userId: string;
  currentChapter: number;
  currentPosition: string;
  progress: number; // 0-100
  clubId?: string;
}

export interface BookmarkUpdate {
  bookId: string;
  userId: string;
  bookmark: Bookmark;
}

export interface NoteUpdate {
  bookId: string;
  userId: string;
  note: Note;
}

// VoxLibris Upload System - Contexts and Collections

export const uploadContextTypes = ["personal", "club", "reader"] as const;
export type UploadContextType = typeof uploadContextTypes[number];

export const bookVisibilities = ["private", "club", "public"] as const;
export type BookVisibility = typeof bookVisibilities[number];

// Upload Contexts
export const uploadContexts = pgTable("upload_contexts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().$type<UploadContextType>(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clubId: varchar("club_id").references(() => clubs.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Book Collections (series, cycles)
export const bookCollections = pgTable("book_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  uploadContextId: varchar("upload_context_id").notNull().references(() => uploadContexts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Book Collection Items
export const bookCollectionItems = pgTable("book_collection_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull().references(() => bookCollections.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(1),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
});

// Legal Acknowledgments
export const legalAcknowledgments = pgTable("legal_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadContextId: varchar("upload_context_id").notNull().references(() => uploadContexts.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  acknowledgedAt: timestamp("acknowledged_at").notNull().default(sql`now()`),
});

// Personal Books - user's personal library
export const userBooksLibrary = pgTable("user_books_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
  lastReadAt: timestamp("last_read_at"),
});

// Club Books - club's shared library
export const clubBooksLibrary = pgTable("club_books_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  addedBy: varchar("added_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
});

// Types for new tables
export type UploadContext = typeof uploadContexts.$inferSelect;
export type InsertUploadContext = typeof uploadContexts.$inferInsert;

export type BookCollection = typeof bookCollections.$inferSelect;
export type InsertBookCollection = typeof bookCollections.$inferInsert;

export type BookCollectionItem = typeof bookCollectionItems.$inferSelect;
export type InsertBookCollectionItem = typeof bookCollectionItems.$inferInsert;

export type LegalAcknowledgment = typeof legalAcknowledgments.$inferSelect;
export type InsertLegalAcknowledgment = typeof legalAcknowledgments.$inferInsert;

export type UserBookLibrary = typeof userBooksLibrary.$inferSelect;
export type InsertUserBookLibrary = typeof userBooksLibrary.$inferInsert;

export type ClubBookLibrary = typeof clubBooksLibrary.$inferSelect;
export type InsertClubBookLibrary = typeof clubBooksLibrary.$inferInsert;

// ============================================
// КЛУБНЫЙ РИДЕР (CLUB READER)
// ============================================

// Статусы прогресса по плану чтения
export const planProgressStatuses = ["not_started", "in_progress", "completed"] as const;
export type PlanProgressStatus = typeof planProgressStatuses[number];

// Визуальные статусы участника относительно плана
export const userPlanStatuses = ["ahead", "on_track", "behind"] as const;
export type UserPlanStatus = typeof userPlanStatuses[number];

// Визуальность комментариев
export const commentVisibilities = ["public", "private", "moderators"] as const;
export type CommentVisibility = typeof commentVisibilities[number];

// Типы уведомлений
export const notificationTypes = ["reply", "mention", "chapter_ready", "message", "plan_update"] as const;
export type NotificationType = typeof notificationTypes[number];

export const notificationKinds = [
  "dm_message",
  "followed_you",
  "club_discussion_reply",
  "club_membership_approved",
  "comment_reply",
  "mention",
  "chapter_ready",
  "plan_update",
  "achievement_unlocked",
] as const;
export type NotificationKind = typeof notificationKinds[number];

// Типы жалоб
export const reportReasons = ["spam", "abuse", "copyright", "explicit", "other"] as const;
export type ReportReason = typeof reportReasons[number];

export const reportStatuses = ["new", "in_review", "resolved", "dismissed"] as const;
export type ReportStatus = typeof reportStatuses[number];

// План чтения для клубной книги
export const clubReadingPlans = pgTable("club_reading_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubBookId: varchar("club_book_id").notNull().references(() => clubBooks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(), // "Неделя 1: Главы 1–5"
  description: text("description"),
  orderIndex: integer("order_index").notNull(), // порядок этапа
  startChapter: integer("start_chapter"), // опционально
  endChapter: integer("end_chapter"), // опционально
  targetDate: timestamp("target_date"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Прогресс участников по плану чтения
export const clubReadingPlanProgress = pgTable("club_reading_plan_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => clubReadingPlans.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().$type<PlanProgressStatus>(),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Клубные закладки (общие точки для всех участников)
export const clubBookmarks = pgTable("club_bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubBookId: varchar("club_book_id").notNull().references(() => clubBooks.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // логическая позиция в книге
  chapter: varchar("chapter", { length: 255 }),
  title: varchar("title", { length: 255 }).notNull(), // краткое название точки
  description: text("description"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Обсуждения клуба (доска обсуждений)
export const clubDiscussions = pgTable("club_discussions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle limitation for self-referencing tables
  parentId: varchar("parent_id").references((): any => clubDiscussions.id, { onDelete: "cascade" }), // для ответов
  quotedContent: text("quoted_content"), // цитируемое сообщение для ответов
  isWarning: boolean("is_warning").notNull().default(false), // предупреждение от владельца
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Комментарии к тексту (клубные)
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterId: varchar("chapter_id").references(() => bookContent.id, { onDelete: "set null" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number"),
  textFragment: text("text_fragment"), // выделенный фрагмент текста
  textOffset: text("text_offset"), // JSON: {start_position, end_position}
  commentText: text("comment_text").notNull(),
  visibility: varchar("visibility", { length: 20 }).notNull().default("public").$type<CommentVisibility>(),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at"),
});

// Ответы на комментарии
export const commentReplies = pgTable("comment_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentCommentId: varchar("parent_comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  replyText: text("reply_text").notNull(),
  mentions: text("mentions"), // JSON array of user_ids
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at"),
});

// Рейтинги комментариев (лайки/дизлайки)
export const commentRatings = pgTable("comment_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: varchar("rating", { length: 10 }).notNull(), // "like" or "dislike"
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Сообщения общего чата клуба
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  // Логический канал внутри клуба (general, voice, announcements и т.п.)
  channel: varchar("channel", { length: 64 }).notNull().default("general"),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  mentions: text("mentions"), // JSON array of user_ids
  attachments: text("attachments"), // JSON array of attachments
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamp("deleted_at"),
});

// Уведомления пользователей
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull().$type<NotificationType>(),
  sourceCommentId: varchar("source_comment_id").references(() => comments.id, { onDelete: "set null" }),
  sourceUserId: varchar("source_user_id").references(() => users.id, { onDelete: "set null" }),
  sourceMessageId: varchar("source_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 60 }).$type<NotificationKind>(),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: varchar("entity_type", { length: 40 }),
  entityId: varchar("entity_id"),
  actionUrl: text("action_url"),
  payload: jsonb("payload"),
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Browser Web Push subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  auth: text("auth").notNull(),
  p256dh: text("p256dh").notNull(),
  userAgent: text("user_agent"),
  deviceName: text("device_name"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const pushNotificationSettings = pgTable("push_notification_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  sessionStarted: boolean("session_started").notNull().default(true),
  sessionReminder: boolean("session_reminder").notNull().default(true),
  clubDiscussion: boolean("club_discussion").notNull().default(false),
  mentionInChat: boolean("mention_in_chat").notNull().default(true),
  dmReceived: boolean("dm_received").notNull().default(true),
  newFollower: boolean("new_follower").notNull().default(false),
  streakReminder: boolean("streak_reminder").notNull().default(true),
  achievementUnlocked: boolean("achievement_unlocked").notNull().default(true),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart: integer("quiet_hours_start").default(23),
  quietHoursEnd: integer("quiet_hours_end").default(8),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const pushNotificationLog = pgTable("push_notification_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  sentAt: timestamp("sent_at").notNull().default(sql`now()`),
  deliveredAt: timestamp("delivered_at"),
  clickedAt: timestamp("clicked_at"),
  errorCode: text("error_code"),
});

// Избранные комментарии
export const favoriteComments = pgTable("favorite_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  commentId: varchar("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Жалобы на комментарии
export const commentReports = pgTable("comment_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 20 }).notNull().$type<ReportReason>(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("new").$type<ReportStatus>(),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Schemas для валидации Club Reader
export const insertClubReadingPlanSchema = createInsertSchema(clubReadingPlans).pick({
  clubBookId: true,
  title: true,
  description: true,
  orderIndex: true,
  startChapter: true,
  endChapter: true,
  targetDate: true,
});

export const insertClubReadingPlanProgressSchema = createInsertSchema(clubReadingPlanProgress).pick({
  planId: true,
  userId: true,
  status: true,
});

export const insertClubBookmarkSchema = createInsertSchema(clubBookmarks).pick({
  clubBookId: true,
  position: true,
  chapter: true,
  title: true,
  description: true,
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  clubId: true,
  bookId: true,
  chapterId: true,
  pageNumber: true,
  textFragment: true,
  textOffset: true,
  commentText: true,
  visibility: true,
});

export const insertCommentReplySchema = createInsertSchema(commentReplies).pick({
  parentCommentId: true,
  replyText: true,
  mentions: true,
});

export const insertCommentRatingSchema = createInsertSchema(commentRatings).pick({
  commentId: true,
  rating: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  clubId: true,
  channel: true,
  text: true,
  mentions: true,
  attachments: true,
});

export const insertFavoriteCommentSchema = createInsertSchema(favoriteComments).pick({
  commentId: true,
});

export const insertCommentReportSchema = createInsertSchema(commentReports).pick({
  commentId: true,
  reason: true,
  description: true,
});

// Types для Club Reader
export type InsertClubReadingPlan = z.infer<typeof insertClubReadingPlanSchema>;
export type ClubReadingPlan = typeof clubReadingPlans.$inferSelect;

export type InsertClubReadingPlanProgress = z.infer<typeof insertClubReadingPlanProgressSchema>;
export type ClubReadingPlanProgress = typeof clubReadingPlanProgress.$inferSelect;

export type InsertClubBookmark = z.infer<typeof insertClubBookmarkSchema>;
export type ClubBookmark = typeof clubBookmarks.$inferSelect;

export type ClubDiscussion = typeof clubDiscussions.$inferSelect;
export type InsertClubDiscussion = typeof clubDiscussions.$inferInsert;

export const insertClubDiscussionSchema = createInsertSchema(clubDiscussions).pick({
  clubId: true,
  content: true,
  parentId: true,
  quotedContent: true,
  isWarning: true,
});

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

export type InsertCommentReply = z.infer<typeof insertCommentReplySchema>;
export type CommentReply = typeof commentReplies.$inferSelect;

export type InsertCommentRating = z.infer<typeof insertCommentRatingSchema>;
export type CommentRating = typeof commentRatings.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertFavoriteComment = z.infer<typeof insertFavoriteCommentSchema>;
export type FavoriteComment = typeof favoriteComments.$inferSelect;

export type InsertCommentReport = z.infer<typeof insertCommentReportSchema>;
export type CommentReport = typeof commentReports.$inferSelect;

// Extended types для Club Reader
export interface ClubReadingPlanWithProgress extends ClubReadingPlan {
  statusForUser?: PlanProgressStatus;
  completedUsersCount?: number;
  totalUsers?: number;
}

export interface CommentWithReplies extends Comment {
  user: User;
  replies: CommentReply[];
  replyCount: number;
  likeCount: number;
  dislikeCount: number;
  userRating?: "like" | "dislike";
  isFavorite?: boolean;
}

export interface CommentReplyWithUser extends CommentReply {
  user: User;
}

export interface ChatUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
}

export interface ChatMessageWithUser extends ChatMessage {
  user: ChatUser;
  likesCount?: number;
}

export interface NotificationWithDetails {
  id: string;
  type: NotificationType;
  message: string;
  readAt: Date | null;
  createdAt: Date;
  sourceComment?: CommentWithReplies;
  sourceUser?: User;
  sourceMessage?: ChatMessageWithUser;
}

// Analytics Events - собственная система аналитики для книжных метрик
export const analyticsEventTypes = [
  "book_open",           // Открытие книги
  "chapter_start",       // Начало чтения главы
  "chapter_complete",    // Завершение главы
  "reading_session",     // Сессия чтения (периодическая отправка)
  "bookmark_create",     // Создание закладки
  "note_create",         // Создание заметки
  "book_complete",       // Завершение книги
  "club_join",           // Вступление в клуб
  "club_leave",          // Выход из клуба
  "book_upload",         // Загрузка книги
  "pwa_install",         // Установка PWA на устройство
  "pwa_homescreen_open", // Открытие PWA с домашнего экрана
] as const;
export type AnalyticsEventType = typeof analyticsEventTypes[number];

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull().$type<AnalyticsEventType>(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // null для анонимных
  bookId: varchar("book_id").references(() => books.id, { onDelete: "set null" }),
  clubId: varchar("club_id").references(() => clubs.id, { onDelete: "set null" }),
  chapterNumber: integer("chapter_number"),
  duration: integer("duration"), // Длительность в секундах (для reading_session)
  progress: integer("progress"), // Прогресс чтения 0-100
  metadata: text("metadata"), // JSON для дополнительных данных
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// ============================================
// VOXLIBRIS STUDIO - Аудио чтение и WebRTC
// ============================================

// Типы сессий
export const sessionTypes = ["general", "reader_club"] as const;
export type SessionType = typeof sessionTypes[number];

// Статус чтения в клубе (поддерживает множественных чтецов)
export const clubReadingStatus = pgTable("club_reading_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id), // Кто читает
  bookId: varchar("book_id").notNull().references(() => books.id),
  sessionId: varchar("session_id").references(() => readingSessions.id),
  
  // Статус
  isActive: boolean("is_active").notNull().default(false),
  startedAt: timestamp("started_at"),
  
  // Текущая позиция
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON: {scrollTop, paragraph, offset}
  
  // Для клуба Чтеца - может ли подключаться
  isOpenForListeners: boolean("is_open_for_listeners").notNull().default(true),
  
  // Количество слушателей
  listenerCount: integer("listener_count").notNull().default(0),
  
  // Тип сессии (для фильтрации)
  sessionType: varchar("session_type", { length: 20 }).notNull().default("general").$type<SessionType>(),
  
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Реакции слушателей (с поддержкой положительных и отрицательных)
export const reactionTypes = ["positive", "negative"] as const;
export type ReactionType = typeof reactionTypes[number];

export const sessionReactions = pgTable("session_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  emoji: varchar("emoji", { length: 50 }).notNull(), // "👍", "❤️", "🔥", "👎", "💩", etc
  type: varchar("type", { length: 20 }).notNull().default("positive").$type<ReactionType>(), // positive, negative
  position: text("position"), // Позиция в аудио (timestamp в секундах)
  audioTimestampMs: integer("audio_timestamp_ms"), // Миллисекунды от начала аудио/записи
  chapterNumber: integer("chapter_number"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Вопросы к чтецу (в контексте чата)
export const sessionQuestions = pgTable("session_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  question: text("question").notNull(),
  isAnswered: boolean("is_answered").notNull().default(false),
  answer: text("answer"),
  answeredAt: timestamp("answered_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Аналитика сессий чтения
export const sessionAnalytics = pgTable("session_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  
  // Статистика слушателей
  peakListenerCount: integer("peak_listener_count").default(0),
  averageListenerCount: integer("average_listener_count").default(0),
  totalListeners: integer("total_listeners").default(0), // Уникальные слушатели
  
  // Время прослушивания
  totalListenTime: integer("total_listen_time").default(0), // В секундах
  averageSessionDuration: integer("average_session_duration").default(0), // В секундах
  
  // Реакции и вопросы
  reactionCount: integer("reaction_count").default(0),
  positiveReactionCount: integer("positive_reaction_count").default(0),
  negativeReactionCount: integer("negative_reaction_count").default(0),
  questionCount: integer("question_count").default(0),
  
  // Качество
  audioQualityScore: integer("audio_quality_score"), // 0-100
  networkQualityScore: integer("network_quality_score"), // 0-100
  
  // География (JSON)
  listenerRegions: text("listener_regions"), // JSON: {RU: 10, US: 5, ...}
  listenerCities: text("listener_cities"), // JSON: {Moscow: 8, "New York": 3, ...}
  
  // Устройства (JSON)
  deviceTypes: text("device_types"), // JSON: {desktop: 12, mobile: 8, tablet: 2}
  
  // Удержание (JSON)
  retention: text("retention"), // JSON: {"1min": 20, "5min": 15, "10min": 10}
  
  // Дополнительные метаданные
  metadata: text("metadata"), // JSON для любых дополнительных данных
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ============================================
// МОНИТИЗАЦИЯ
// ============================================

// Типы монетизации
export const monetizationTypes = ["one_time", "subscription", "donation"] as const;
export type MonetizationType = typeof monetizationTypes[number];

// Статусы платежей
export const paymentStatuses = ["pending", "completed", "failed", "refunded", "cancelled"] as const;
export type PaymentStatus = typeof paymentStatuses[number];

// Legacy monetization tables. Do not use for new RF commerce features.
// Настройки монетизации для клуба
export const clubMonetization = pgTable("club_monetization", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  
  // Тип монетизации
  type: varchar("type", { length: 20 }).notNull().$type<MonetizationType>(),
  
  // Для разовой оплаты (one_time)
  oneTimeAmount: integer("one_time_amount"), // В копейках/центах
  oneTimeCurrency: varchar("one_time_currency", { length: 3 }).default("USD"),
  
  // Для подписки (subscription)
  subscriptionAmount: integer("subscription_amount"), // В копейках/центах за месяц
  subscriptionCurrency: varchar("subscription_currency", { length: 3 }).default("USD"),
  subscriptionInterval: varchar("subscription_interval", { length: 20 }).default("monthly"), // monthly, yearly
  
  // Для пожертвований (donation)
  donationMinAmount: integer("donation_min_amount"), // Минимальная сумма
  donationMaxAmount: integer("donation_max_amount"), // Максимальная сумма
  donationSuggestedAmounts: text("donation_suggested_amounts"), // JSON: [100, 500, 1000] в копейках
  donationCurrency: varchar("donation_currency", { length: 3 }).default("USD"),
  
  // Процент платформы
  platformFeePercent: integer("platform_fee_percent").notNull().default(10), // 10%
  
  // Способ выплат
  payoutMethod: varchar("payout_method", { length: 50 }), // stripe, bank, crypto, etc
  payoutDetails: text("payout_details"), // JSON: {accountNumber, routingNumber, ...}
  
  // Статус
  isActive: boolean("is_active").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Доходы чтеца
export const earningStatuses = ["pending", "processing", "paid", "failed"] as const;
export type EarningStatus = typeof earningStatuses[number];

export const readerEarnings = pgTable("reader_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  readerId: varchar("reader_id").notNull().references(() => users.id),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  
  // Тип монетизации сессии
  monetizationType: varchar("monetization_type", { length: 20 }).notNull().$type<MonetizationType>(),
  
  // Доход (до вычета процента платформы)
  grossAmount: integer("gross_amount").notNull(), // В копейках/центах
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Процент платформы
  platformFeePercent: integer("platform_fee_percent").notNull(),
  platformFeeAmount: integer("platform_fee_amount").notNull(), // В копейках/центах
  
  // Чистый доход
  netAmount: integer("net_amount").notNull(), // В копейках/центах
  
  // Статистика
  listenerCount: integer("listener_count").default(0),
  paymentCount: integer("payment_count").default(0), // Количество платежей
  
  // Статус
  status: varchar("status", { length: 20 }).notNull().default("pending").$type<EarningStatus>(),
  
  // Выплата
  payoutId: varchar("payout_id"), // ID выплаты от платежной системы
  payoutStatus: varchar("payout_status", { length: 20 }), // pending, completed, failed
  payoutAt: timestamp("payout_at"),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Платежи слушателей
export const listenerPayments = pgTable("listener_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => readingSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  
  // Тип монетизации
  monetizationType: varchar("monetization_type", { length: 20 }).notNull().$type<MonetizationType>(),
  
  // Сумма
  amount: integer("amount").notNull(), // В копейках/центах
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Платежная система
  paymentProvider: varchar("payment_provider", { length: 50 }), // stripe, paypal, etc
  paymentIntentId: varchar("payment_intent_id"), // ID от платежной системы
  paymentMethodId: varchar("payment_method_id"), // ID метода оплаты
  
  // Статус
  status: varchar("status", { length: 20 }).notNull().default("pending").$type<PaymentStatus>(),
  
  // Возврат
  refundId: varchar("refund_id"),
  refundAmount: integer("refund_amount"),
  refundReason: text("refund_reason"),
  refundedAt: timestamp("refunded_at"),
  
  // Дополнительно
  metadata: text("metadata"), // JSON: {receiptUrl, fraudScore, ...}
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Подписки на клубы
export const subscriptionStatuses = ["active", "past_due", "canceled", "unpaid", "trialing"] as const;
export type SubscriptionStatus = typeof subscriptionStatuses[number];

export const clubSubscriptions = pgTable("club_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Детали подписки
  amount: integer("amount").notNull(), // В копейках/центах
  currency: varchar("currency", { length: 3 }).default("USD"),
  interval: varchar("interval", { length: 20 }).notNull().default("monthly"), // monthly, yearly
  
  // Статус
  status: varchar("status", { length: 20 }).notNull().default("active").$type<SubscriptionStatus>(),
  
  // Даты
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at"),
  
  // Платежная система
  paymentProvider: varchar("payment_provider", { length: 50 }),
  subscriptionId: varchar("subscription_id"), // ID от платежной системы
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ============================================
// РАСПИСАНИЕ СЕССИЙ
// ============================================

// Статусы расписания
export const scheduleStatuses = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type ScheduleStatus = typeof scheduleStatuses[number];

// Расписание сессий чтения
export const readingSchedule = pgTable("reading_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(), // "Чтение главы 1-3"
  description: text("description"),
  
  // Время проведения
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end"),
  estimatedDuration: integer("estimated_duration"), // В минутах
  
  // Текущая позиция в книге
  startChapter: integer("start_chapter").notNull().default(1),
  startPosition: text("start_position"), // JSON: {scrollTop, paragraph, offset}
  endChapter: integer("end_chapter"),
  endPosition: text("end_position"), // JSON
  
  // Статус расписания
  status: varchar("status", { length: 20 }).notNull().default("scheduled").$type<ScheduleStatus>(),
  
  // Привязка к сессии чтения
  sessionId: varchar("session_id").references(() => readingSessions.id),
  
  // Повторение
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringPattern: text("recurring_pattern"), // JSON: {frequency: 'weekly', days: [1,3,5], endDate: '2025-03-01'}
  
  // Уведомления
  reminderMinutes: integer("reminder_minutes").default(15), // За сколько минут напомнить
  remindersSent: boolean("reminders_sent").notNull().default(false),
  
  // Статистика
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  attendeesCount: integer("attendees_count").default(0),
  
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ============================================
// ЗАПИСИ СЕССИЙ (для клубов Чтеца)
// ============================================

// Статусы записи
export const recordingStatuses = ["processing", "ready", "failed", "deleted"] as const;
export type RecordingStatus = typeof recordingStatuses[number];
export const recordingModerationStatuses = ["pending", "approved", "rejected"] as const;
export type RecordingModerationStatus = typeof recordingModerationStatuses[number];

// Записи сессий (для клубов Чтеца)
export const sessionRecordings = pgTable("session_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => readingSessions.id, { onDelete: "cascade" }),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  
  // Файл записи
  recordingUrl: text("recording_url"), // URL к записи на S3/локальном хранилище
  storageKey: text("storage_key"), // Ключ в хранилище
  duration: integer("duration"), // Длительность в секундах
  fileSize: integer("file_size"), // Размер в байтах
  format: varchar("format", { length: 20 }).default("webm"), // webm, mp3, etc
  
  // Статус обработки
  status: varchar("status", { length: 20 }).notNull().default("processing").$type<RecordingStatus>(),
  
  // Тип записи
  isLocal: boolean("is_local").default(false), // Локальная запись при сбое связи
  isBackup: boolean("is_backup").default(false), // Резервная копия
  
  // Качество
  bitrate: integer("bitrate"), // В kbps
  sampleRate: integer("sample_rate"), // В Hz
  channels: integer("channels"), // 1 = mono, 2 = stereo
  
  // Доступность
  isAvailable: boolean("is_available").notNull().default(true),
  availableUntil: timestamp("available_until"), // Дата, когда запись перестанет быть доступной

  // Модерация и публикация
  publicationRequested: boolean("publication_requested").notNull().default(true),
  moderationStatus: varchar("moderation_status", { length: 20 }).notNull().default("pending").$type<RecordingModerationStatus>(),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationNotes: text("moderation_notes"),
  publishedBy: varchar("published_by").references(() => users.id),
  publishedAt: timestamp("published_at"),
  isPublished: boolean("is_published").notNull().default(false),

  // Будущее оформление публичной карточки записи
  publicTitle: varchar("public_title", { length: 255 }),
  publicAuthor: varchar("public_author", { length: 255 }),
  publicDescription: text("public_description"),
  coverImageUrl: text("cover_image_url"),

  // Тарифные ворота: фактический доступ дополнительно проверяется тарифом пользователя
  allowStreaming: boolean("allow_streaming").notNull().default(false),
  allowDownload: boolean("allow_download").notNull().default(false),
  
  // Дополнительно
  metadata: text("metadata"), // JSON для любых дополнительных данных
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ============================================
// ОЦЕНКА КАЧЕСТВА ЧТЕНИЯ
// ============================================

// Оценки качества чтения (от других чтецов)
export const readerQualityRatings = pgTable("reader_quality_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ratedUserId: varchar("rated_user_id").notNull().references(() => users.id), // Чей рейтинг
  raterUserId: varchar("rater_user_id").notNull().references(() => users.id), // Кто оценил
  clubId: varchar("club_id").references(() => clubs.id), // В каком клубе (может быть null для общего рейтинга)
  
  // Критерии оценки
  voiceQuality: integer("voice_quality"), // 1-5, качество голоса
  readingPace: integer("reading_pace"), // 1-5, темп чтения
  articulation: integer("articulation"), // 1-5, артикуляция
  emotion: integer("emotion"), // 1-5, эмоциональная подача
  
  // Общая оценка
  overallRating: integer("overall_rating").notNull(), // 1-5
  
  // Комментарий
  feedback: text("feedback"),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// ============================================
// SCHEMAS ДЛЯ ВАЛИДАЦИИ
// ============================================

// Club Reading Status
export const insertClubReadingStatusSchema = createInsertSchema(clubReadingStatus).pick({
  clubId: true,
  userId: true,
  bookId: true,
  sessionId: true,
  currentChapter: true,
  currentPosition: true,
  isOpenForListeners: true,
  sessionType: true,
});

// ============================================
// GUEST SYSTEM (v2.1 - KISS)
// ============================================

// Guest Account Status
export const guestAccountStatuses = ["active", "expired", "deleted"] as const;
export type GuestAccountStatus = typeof guestAccountStatuses[number];

// Guest Book Format
export const guestBookFormats = ["epub", "fb2"] as const;
export type GuestBookFormat = typeof guestBookFormats[number];

// Guest Book Moderation Status
export const guestBookModerationStatuses = ["pending", "approved", "rejected"] as const;
export type GuestBookModerationStatus = typeof guestBookModerationStatuses[number];

// Guest Analytics Event Types
export const guestAnalyticsEventTypes = ["book_upload", "session_start", "session_end", "book_open"] as const;
export type GuestAnalyticsEventType = typeof guestAnalyticsEventTypes[number];

// Guest Accounts
export const guestAccounts = pgTable("guest_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accessCode: varchar("access_code", { length: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  status: text("status").notNull().default("active").$type<GuestAccountStatus>(),
  createdFromIp: varchar("created_from_ip", { length: 45 }), // IPv6 compatible
  createdUserAgent: text("created_user_agent"),
  browserFingerprint: varchar("browser_fingerprint", { length: 64 }),
  recoveryAttempts: integer("recovery_attempts").default(0),
  lastRecoveryAt: timestamp("last_recovery_at"),
});

// Guest Books
export const guestBooks = pgTable("guest_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestAccountId: varchar("guest_account_id").notNull().references(() => guestAccounts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  format: text("format").notNull().$type<GuestBookFormat>(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  originalFilename: text("original_filename"),
  originalFileStorageKey: text("original_file_storage_key"),
  originalFileContentType: text("original_file_content_type"),
  flatContent: text("flat_content").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  wordCount: integer("word_count").default(0),
  uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  // Moderation
  moderationStatus: text("moderation_status").default("pending").$type<GuestBookModerationStatus>(),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationNotes: text("moderation_notes"),
});

// Guest Reading Positions
export const guestReadingPositions = pgTable("guest_reading_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestAccountId: varchar("guest_account_id").notNull().references(() => guestAccounts.id, { onDelete: "cascade" }),
  guestBookId: varchar("guest_book_id").notNull().references(() => guestBooks.id, { onDelete: "cascade" }),
  progressPercent: integer("progress_percent").notNull().default(0),
  currentPosition: jsonb("current_position").default({}),
  readingTimeMinutes: integer("reading_time_minutes").default(0),
  lastReadAt: timestamp("last_read_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Guest Analytics (simplified)
export const guestAnalytics = pgTable("guest_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestAccountId: varchar("guest_account_id").notNull().references(() => guestAccounts.id, { onDelete: "cascade" }),
  guestBookId: varchar("guest_book_id").references(() => guestBooks.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull().$type<GuestAnalyticsEventType>(),
  eventData: jsonb("event_data").default({}),
  sessionId: varchar("session_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Guest Insert Schemas
export const insertGuestAccountSchema = createInsertSchema(guestAccounts).pick({
  accessCode: true,
  expiresAt: true,
  status: true,
  createdFromIp: true,
  createdUserAgent: true,
  browserFingerprint: true,
});

export const insertGuestBookSchema = createInsertSchema(guestBooks).pick({
  guestAccountId: true,
  title: true,
  author: true,
  description: true,
  format: true,
  fileSizeBytes: true,
  originalFilename: true,
  originalFileStorageKey: true,
  originalFileContentType: true,
  flatContent: true,
  contentHash: true,
  wordCount: true,
  expiresAt: true,
});

export const updateGuestBookSchema = createInsertSchema(guestBooks).pick({
  moderationStatus: true,
  moderatedBy: true,
  moderatedAt: true,
  moderationNotes: true,
  isDeleted: true,
  deletedAt: true,
});

export const insertGuestReadingPositionSchema = createInsertSchema(guestReadingPositions).pick({
  guestAccountId: true,
  guestBookId: true,
  progressPercent: true,
  currentPosition: true,
  readingTimeMinutes: true,
});

export const updateGuestReadingPositionSchema = createInsertSchema(guestReadingPositions).pick({
  progressPercent: true,
  currentPosition: true,
  readingTimeMinutes: true,
  lastReadAt: true,
});

export const insertGuestAnalyticsSchema = createInsertSchema(guestAnalytics).pick({
  guestAccountId: true,
  guestBookId: true,
  eventType: true,
  eventData: true,
  sessionId: true,
});

// Session Reactions
export const insertSessionReactionSchema = createInsertSchema(sessionReactions).pick({
  sessionId: true,
  userId: true,
  emoji: true,
  type: true,
  position: true,
  audioTimestampMs: true,
  chapterNumber: true,
});

// Session Questions
export const insertSessionQuestionSchema = createInsertSchema(sessionQuestions).pick({
  sessionId: true,
  userId: true,
  question: true,
});

export const updateSessionQuestionSchema = createInsertSchema(sessionQuestions).pick({
  answer: true,
  isAnswered: true,
  answeredAt: true,
});

// Session Analytics
export const insertSessionAnalyticsSchema = createInsertSchema(sessionAnalytics).pick({
  sessionId: true,
  peakListenerCount: true,
  averageListenerCount: true,
  totalListeners: true,
  totalListenTime: true,
  averageSessionDuration: true,
  reactionCount: true,
  positiveReactionCount: true,
  negativeReactionCount: true,
  questionCount: true,
  audioQualityScore: true,
  networkQualityScore: true,
  listenerRegions: true,
  listenerCities: true,
  deviceTypes: true,
  retention: true,
  metadata: true,
});

// Club Monetization
export const insertClubMonetizationSchema = createInsertSchema(clubMonetization).pick({
  clubId: true,
  type: true,
  oneTimeAmount: true,
  oneTimeCurrency: true,
  subscriptionAmount: true,
  subscriptionCurrency: true,
  subscriptionInterval: true,
  donationMinAmount: true,
  donationMaxAmount: true,
  donationSuggestedAmounts: true,
  donationCurrency: true,
  platformFeePercent: true,
  payoutMethod: true,
  payoutDetails: true,
  isActive: true,
});

// Reader Earnings
export const insertReaderEarningSchema = createInsertSchema(readerEarnings).pick({
  sessionId: true,
  readerId: true,
  clubId: true,
  monetizationType: true,
  grossAmount: true,
  currency: true,
  platformFeePercent: true,
  platformFeeAmount: true,
  netAmount: true,
  listenerCount: true,
  paymentCount: true,
  status: true,
});

// Listener Payments
export const insertListenerPaymentSchema = createInsertSchema(listenerPayments).pick({
  sessionId: true,
  userId: true,
  clubId: true,
  monetizationType: true,
  amount: true,
  currency: true,
  paymentProvider: true,
  paymentIntentId: true,
  paymentMethodId: true,
  status: true,
  metadata: true,
});

// Club Subscriptions
export const insertClubSubscriptionSchema = createInsertSchema(clubSubscriptions).pick({
  clubId: true,
  userId: true,
  amount: true,
  currency: true,
  interval: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  paymentProvider: true,
  subscriptionId: true,
});

// Reading Schedule
export const insertReadingScheduleSchema = createInsertSchema(readingSchedule).pick({
  clubId: true,
  bookId: true,
  title: true,
  description: true,
  scheduledStart: true,
  scheduledEnd: true,
  estimatedDuration: true,
  startChapter: true,
  startPosition: true,
  endChapter: true,
  endPosition: true,
  isRecurring: true,
  recurringPattern: true,
  reminderMinutes: true,
  createdBy: true,
});

// Session Recordings
export const insertSessionRecordingSchema = createInsertSchema(sessionRecordings).pick({
  sessionId: true,
  clubId: true,
  recordingUrl: true,
  storageKey: true,
  duration: true,
  fileSize: true,
  format: true,
  isLocal: true,
  isBackup: true,
  bitrate: true,
  sampleRate: true,
  channels: true,
  isAvailable: true,
  availableUntil: true,
  moderationStatus: true,
  moderatedBy: true,
  moderatedAt: true,
  moderationNotes: true,
  publishedBy: true,
  publishedAt: true,
  isPublished: true,
  publicTitle: true,
  publicAuthor: true,
  publicDescription: true,
  coverImageUrl: true,
  allowStreaming: true,
  allowDownload: true,
  metadata: true,
});

// Reader Quality Ratings
export const insertReaderQualityRatingSchema = createInsertSchema(readerQualityRatings).pick({
  ratedUserId: true,
  raterUserId: true,
  clubId: true,
  voiceQuality: true,
  readingPace: true,
  articulation: true,
  emotion: true,
  overallRating: true,
  feedback: true,
});

// ============================================
// TYPES
// ============================================

// VoxLibris Studio Types
export type ClubReadingStatus = typeof clubReadingStatus.$inferSelect;
export type InsertClubReadingStatus = z.infer<typeof insertClubReadingStatusSchema>;

export type SessionReaction = typeof sessionReactions.$inferSelect;
export type InsertSessionReaction = z.infer<typeof insertSessionReactionSchema>;

export type SessionQuestion = typeof sessionQuestions.$inferSelect;
export type InsertSessionQuestion = z.infer<typeof insertSessionQuestionSchema>;
export type UpdateSessionQuestion = z.infer<typeof updateSessionQuestionSchema>;

export type SessionAnalytics = typeof sessionAnalytics.$inferSelect;
export type InsertSessionAnalytics = z.infer<typeof insertSessionAnalyticsSchema>;

export type ClubMonetization = typeof clubMonetization.$inferSelect;
export type InsertClubMonetization = z.infer<typeof insertClubMonetizationSchema>;

export type ReaderEarning = typeof readerEarnings.$inferSelect;
export type InsertReaderEarning = z.infer<typeof insertReaderEarningSchema>;

export type ListenerPayment = typeof listenerPayments.$inferSelect;
export type InsertListenerPayment = z.infer<typeof insertListenerPaymentSchema>;

export type ClubSubscription = typeof clubSubscriptions.$inferSelect;
export type InsertClubSubscription = z.infer<typeof insertClubSubscriptionSchema>;

export type ReadingSchedule = typeof readingSchedule.$inferSelect;
export type InsertReadingSchedule = z.infer<typeof insertReadingScheduleSchema>;

export type SessionRecording = typeof sessionRecordings.$inferSelect;
export type InsertSessionRecording = z.infer<typeof insertSessionRecordingSchema>;

export type ReaderQualityRating = typeof readerQualityRatings.$inferSelect;
export type InsertReaderQualityRating = z.infer<typeof insertReaderQualityRatingSchema>;

// Extended Types
export interface ClubReadingStatusWithDetails extends ClubReadingStatus {
  user: User;
  book: Book;
  club: Club;
}

export interface SessionReactionWithDetails extends SessionReaction {
  user: User;
}

export interface SessionQuestionWithDetails extends SessionQuestion {
  user: User;
}

export interface SessionAnalyticsWithDetails extends SessionAnalytics {
  session: ReadingSession;
  club: Club;
  reader: User;
}

export interface ReaderEarningWithDetails extends ReaderEarning {
  session: ReadingSession;
  club: Club;
  reader: User;
}

export interface ReaderQualityRatingWithDetails extends ReaderQualityRating {
  ratedUser: User;
  raterUser: User;
  club?: Club;
}

// ============================================
// GUEST SYSTEM TYPES
// ============================================

// Guest Account Types
export type GuestAccount = typeof guestAccounts.$inferSelect;
export type InsertGuestAccount = z.infer<typeof insertGuestAccountSchema>;

// Guest Book Types
export type GuestBook = typeof guestBooks.$inferSelect;
export type InsertGuestBook = z.infer<typeof insertGuestBookSchema>;
export type UpdateGuestBook = z.infer<typeof updateGuestBookSchema>;

// Guest Reading Position Types
export type GuestReadingPosition = typeof guestReadingPositions.$inferSelect;
export type InsertGuestReadingPosition = z.infer<typeof insertGuestReadingPositionSchema>;
export type UpdateGuestReadingPosition = z.infer<typeof updateGuestReadingPositionSchema>;

// Guest Analytics Types
export type GuestAnalytics = typeof guestAnalytics.$inferSelect;
export type InsertGuestAnalytics = z.infer<typeof insertGuestAnalyticsSchema>;

// Guest API Response DTOs
export interface GuestAccountResponse {
  guestId: string;
  accessCode: string;
  expiresAt: string;
  hasBook: boolean;
  canRecover: boolean;
}

export interface GuestBookResponse {
  bookId: string;
  title: string;
  author: string;
  format: GuestBookFormat;
  wordCount: number;
  uploadedAt: string;
  expiresAt: string;
  moderationStatus: GuestBookModerationStatus;
}

export interface GuestReadingProgressResponse {
  progressPercent: number;
  currentPosition: Record<string, unknown>;
  readingTimeMinutes: number;
  lastReadAt: string;
}

export interface GuestAnalyticsSummaryResponse {
  totalReadingTime: number;
  sessionsCount: number;
  averageSessionTime: number;
  lastActivity: string;
}

// ============================================
// СОЦИАЛЬНЫЙ ГРАФ (SOCIAL GRAPH)
// ============================================

export const profileVisibilities = ['public', 'followers', 'private'] as const;
export type ProfileVisibility = typeof profileVisibilities[number];

export const dmPermissions = ['everyone', 'followers', 'nobody'] as const;
export type DmPermission = typeof dmPermissions[number];

// Подписки (follower → following)
export const userFollows = pgTable('user_follows', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: varchar('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Блокировки
export const userBlocks = pgTable('user_blocks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  blockerId: varchar('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: varchar('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Муты (скрыть активность без блокировки)
export const userMutes = pgTable('user_mutes', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  muterId: varchar('muter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mutedId: varchar('muted_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Настройки приватности профиля
export const userPrivacySettings = pgTable('user_privacy_settings', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  profileVisibility: text('profile_visibility').notNull().default('public').$type<ProfileVisibility>(),
  readingStatsVisible: boolean('reading_stats_visible').notNull().default(true),
  clubsVisible: boolean('clubs_visible').notNull().default(true),
  readingHistoryVisible: boolean('reading_history_visible').notNull().default(true),
  allowDmFrom: text('allow_dm_from').notNull().default('followers').$type<DmPermission>(),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

// Схемы валидации
export const insertUserFollowSchema = createInsertSchema(userFollows).pick({
  followingId: true,
});

export const insertUserPrivacySettingsSchema = createInsertSchema(userPrivacySettings).pick({
  profileVisibility: true,
  readingStatsVisible: true,
  clubsVisible: true,
  readingHistoryVisible: true,
  allowDmFrom: true,
});

// Типы
export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = typeof userFollows.$inferInsert;

export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;

export type UserMute = typeof userMutes.$inferSelect;
export type InsertUserMute = typeof userMutes.$inferInsert;

export type UserPrivacySettings = typeof userPrivacySettings.$inferSelect;
export type InsertUserPrivacySettings = Pick<
  typeof userPrivacySettings.$inferInsert,
  | 'profileVisibility'
  | 'readingStatsVisible'
  | 'clubsVisible'
  | 'readingHistoryVisible'
  | 'allowDmFrom'
>;

// Расширенный тип публичного профиля
export interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  favoriteGenres: string[];
  isReader: boolean;
  readerRating: number;
  followersCount: number;
  followingCount: number;
  totalReadingSessions: number;
  totalListeners: number;
  createdAt: Date;
  // Социальный контекст (если viewer авторизован)
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  isBlocked?: boolean;
}

// ─── Лента активности (Sprint 2.1) ───────────────────────────────────────────

export const activityEventTypes = [
  'session_started',
  'session_ended',
  'joined_club',
  'left_club',
  'club_created',
  'reading_completed',
  'book_review_posted',
  'achievement_unlocked',
  'club_session_scheduled',
  'discussion_hot',
  'followed_user',
  'book_added_to_club',
] as const;
export type ActivityEventType = (typeof activityEventTypes)[number];

export const activityEvents = pgTable('activity_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar('actor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull().$type<ActivityEventType>(),
  targetType: text('target_type'), // 'session' | 'club' | 'book' | 'user' | 'achievement'
  targetId: varchar('target_id'),
  metadata: jsonb('metadata'), // денормализованный снапшот для рендеринга
  visibility: text('visibility')
    .notNull()
    .default('followers')
    .$type<'public' | 'followers' | 'private'>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;

export interface ActivityEventWithActor extends ActivityEvent {
  actor: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isReader: boolean;
  };
}

// ─── Рекомендации (Sprint 2.6, этап после 0046) ────────────────────────────

export const recommendationEntityTypes = ['book', 'club', 'reader', 'live'] as const;
export type RecommendationEntityType = (typeof recommendationEntityTypes)[number];

export const recommendationSourceTypes = ['activity', 'community', 'mixed'] as const;
export type RecommendationSourceType = (typeof recommendationSourceTypes)[number];

export const recommendationBookSourcePreferences = ['all', 'activity', 'community'] as const;
export type RecommendationBookSourcePreference = (typeof recommendationBookSourcePreferences)[number];

export const recommendationDismissals = pgTable('recommendation_dismissals', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull().$type<RecommendationEntityType>(),
  entityId: varchar('entity_id').notNull(),
  source: varchar('source', { length: 20 }).$type<RecommendationSourceType | null>(),
  reason: varchar('reason', { length: 120 }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const recommendationPreferences = pgTable('recommendation_preferences', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  excludedTypesJson: text('excluded_types_json').notNull().default('[]'),
  booksSourcePreference: varchar('books_source_preference', { length: 20 })
    .notNull()
    .default('all')
    .$type<RecommendationBookSourcePreference>(),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export type RecommendationDismissal = typeof recommendationDismissals.$inferSelect;
export type RecommendationPreference = typeof recommendationPreferences.$inferSelect;

// ─── Личные сообщения (Sprint 2.3) ───────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  participantA: varchar('participant_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
  participantB: varchar('participant_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastMessageAt: timestamp('last_message_at'),
  lastMessageId: varchar('last_message_id'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const directMessages = pgTable('direct_messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  readAt: timestamp('read_at'),
});

export const conversationUnread = pgTable('conversation_unread', {
  conversationId: varchar('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  unreadCount: integer('unread_count').notNull().default(0),
});

export type Conversation = typeof conversations.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type ConversationUnread = typeof conversationUnread.$inferSelect;

// ─── Жалобы на ЛС + аудит доступа администраторов (Sprint 2.3) ───────────────

export const dmReports = pgTable('dm_reports', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar('message_id').notNull().references(() => directMessages.id, { onDelete: 'cascade' }),
  reporterId: varchar('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: varchar('category').notNull().$type<'spam' | 'harassment' | 'threats' | 'other'>(),
  comment: text('comment'),
  status: varchar('status').notNull().default('pending').$type<'pending' | 'reviewed' | 'dismissed'>(),
  reviewedBy: varchar('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export const dmAdminAccessLog = pgTable('dm_admin_access_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  reportId: varchar('report_id').references(() => dmReports.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  accessedAt: timestamp('accessed_at').notNull().default(sql`now()`),
});

export type DmReport = typeof dmReports.$inferSelect;
export type DmAdminAccessLog = typeof dmAdminAccessLog.$inferSelect;

// ─── Геймификация (Sprint 2.4) ──────────────────────────────────────────────

export const achievementStatuses = ['draft', 'active', 'archived'] as const;
export type AchievementStatus = (typeof achievementStatuses)[number];

export const achievementIconTypes = ['badge', 'star', 'title'] as const;
export type AchievementIconType = (typeof achievementIconTypes)[number];

export const achievements = pgTable('achievements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 100 }).notNull().unique(),
  titleRu: varchar('title_ru', { length: 120 }).notNull(),
  descriptionRu: text('description_ru'),
  iconType: varchar('icon_type', { length: 30 }).notNull().default('badge').$type<AchievementIconType>(),
  badgeImageUrl: text('badge_image_url'),
  rewardPayload: jsonb('reward_payload'),
  conditionsPayload: jsonb('conditions_payload').notNull().default(sql`'[]'::jsonb`),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<AchievementStatus>(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const achievementBuildingBlocks = pgTable('achievement_building_blocks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 100 }).notNull().unique(),
  labelRu: varchar('label_ru', { length: 120 }).notNull(),
  valueType: varchar('value_type', { length: 20 }).notNull().$type<'number' | 'string' | 'boolean'>(),
  supportedOperators: jsonb('supported_operators').notNull().default(sql`'[]'::jsonb`),
  sourceKey: varchar('source_key', { length: 200 }),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const achievementRewardAssets = pgTable('achievement_reward_assets', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  assetType: varchar('asset_type', { length: 20 }).notNull().$type<AchievementIconType>(),
  nameRu: varchar('name_ru', { length: 120 }).notNull(),
  imageUrl: text('image_url').notNull(),
  descriptionRu: text('description_ru'),
  groupKey: varchar('group_key', { length: 80 }).notNull().default('default'),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const userAchievements = pgTable('user_achievements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: varchar('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  awardedAt: timestamp('awarded_at').notNull().default(sql`now()`),
  awardedBy: varchar('awarded_by').references(() => users.id, { onDelete: 'set null' }),
  meta: jsonb('meta'),
});

export const userActivityCounters = pgTable('user_activity_counters', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  completedBooksCount: integer('completed_books_count').notNull().default(0),
  sentDmCount: integer('sent_dm_count').notNull().default(0),
  followingCountSnapshot: integer('following_count_snapshot').notNull().default(0),
  followersCountSnapshot: integer('followers_count_snapshot').notNull().default(0),
  clubSessionsJoinedCount: integer('club_sessions_joined_count').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const userStreaks = pgTable('user_streaks', {
  userId: varchar('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  currentStreakDays: integer('current_streak_days').notNull().default(0),
  bestStreakDays: integer('best_streak_days').notNull().default(0),
  lastActiveDate: text('last_active_date'),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = typeof achievements.$inferInsert;

export type AchievementBuildingBlock = typeof achievementBuildingBlocks.$inferSelect;
export type InsertAchievementBuildingBlock = typeof achievementBuildingBlocks.$inferInsert;

export type AchievementRewardAsset = typeof achievementRewardAssets.$inferSelect;
export type InsertAchievementRewardAsset = typeof achievementRewardAssets.$inferInsert;

export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = typeof userAchievements.$inferInsert;

export type UserActivityCounters = typeof userActivityCounters.$inferSelect;
export type InsertUserActivityCounters = typeof userActivityCounters.$inferInsert;

export type UserStreak = typeof userStreaks.$inferSelect;
export type InsertUserStreak = typeof userStreaks.$inferInsert;

export type PaymentProviderCode = 'yookassa';
export type PaymentProviderStatus = 'active' | 'inactive';
export type CommerceProductType = 'platform_subscription' | 'club_subscription' | 'reader_club_subscription' | 'ticket' | 'recording_access' | 'donation';
export type CommerceScopeType = 'platform' | 'club' | 'reader_club' | 'session' | 'recording' | 'reader';
export type CommerceProductStatus = 'draft' | 'active' | 'archived';
export type CommerceProductVisibility = 'public' | 'private';
export type CommercePricePeriod = 'one_time' | 'week' | 'month' | 'quarter' | 'year';
export type CommercePriceStatus = 'active' | 'archived';
export type CommerceOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed';
export type CommercePaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
export type CommercePaymentEventStatus = 'received' | 'processed' | 'failed';
export type CommerceSubscriptionStatus = 'pending' | 'active' | 'grace' | 'past_due' | 'cancelled' | 'expired';
export type CommerceEntitlementSourceType = 'payment' | 'subscription' | 'promo' | 'admin_grant' | 'migration';
export type CommerceEntitlementStatus = 'active' | 'revoked' | 'expired' | 'deleted';
export type CommerceEntitlementRenewalStatus = 'active' | 'cancel_at_period_end';
export type CommerceEntitlementActionType = 'revoke_now' | 'cancel_at_period_end' | 'restore' | 'delete_revoked';
export type CommerceFeatureValueType = 'boolean' | 'integer' | 'string' | 'json';
export type CommerceFeatureResetPeriod = 'day' | 'week' | 'month' | 'year' | null;
export type ReaderClubTariffTemplateStatus = 'draft' | 'active' | 'archived';
export type ReaderClubTariffVisibility = 'public' | 'private';
export type ReaderClubTariffRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ReaderClubTariffAssignmentStatus = 'active' | 'inactive' | 'archived';
export type CommerceLedgerEntryType = 'acquiring_fee' | 'reader_earning' | 'platform_fee';
export type CommerceLedgerEntryStatus = 'pending' | 'available' | 'paid' | 'void';

export const paymentProviders = pgTable('payment_providers', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 40 }).notNull().$type<PaymentProviderCode>(),
  name: varchar('name', { length: 120 }).notNull(),
  encryptedCredentials: text('encrypted_credentials').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('inactive').$type<PaymentProviderStatus>(),
  priority: integer('priority').notNull().default(100),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  oneActiveProvider: uniqueIndex('payment_providers_one_active_idx').on(table.status),
}));

export const commerceProducts = pgTable('commerce_products', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  type: varchar('type', { length: 40 }).notNull().$type<CommerceProductType>(),
  scopeType: varchar('scope_type', { length: 30 }).notNull().$type<CommerceScopeType>(),
  scopeId: varchar('scope_id'),
  code: varchar('code', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<CommerceProductStatus>(),
  visibility: varchar('visibility', { length: 20 }).notNull().default('private').$type<CommerceProductVisibility>(),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commercePrices = pgTable('commerce_prices', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  amountRub: integer('amount_rub').notNull(),
  period: varchar('period', { length: 20 }).notNull().$type<CommercePricePeriod>(),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<CommercePriceStatus>(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commerceFeatureRegistry = pgTable('commerce_feature_registry', {
  key: varchar('key', { length: 120 }).primaryKey(),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 60 }).notNull(),
  scopeType: varchar('scope_type', { length: 30 }).notNull().$type<CommerceScopeType>(),
  valueType: varchar('value_type', { length: 20 }).notNull().default('boolean').$type<CommerceFeatureValueType>(),
  defaultBool: boolean('default_bool'),
  defaultInt: integer('default_int'),
  defaultText: text('default_text'),
  defaultJson: jsonb('default_json'),
  isPublic: boolean('is_public').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  scopeIdx: index('commerce_feature_registry_scope_idx').on(table.scopeType, table.category, table.isActive),
}));

export const commerceProductFeatures = pgTable('commerce_product_features', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  featureKey: varchar('feature_key', { length: 120 }).notNull(),
  valueType: varchar('value_type', { length: 20 }).notNull().default('boolean').$type<CommerceFeatureValueType>(),
  valueBool: boolean('value_bool'),
  valueInt: integer('value_int'),
  valueText: text('value_text'),
  valueJson: jsonb('value_json'),
  resetPeriod: varchar('reset_period', { length: 20 }).$type<CommerceFeatureResetPeriod>(),
  sortOrder: integer('sort_order').notNull().default(0),
  isHighlighted: boolean('is_highlighted').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  featureKeyIdx: index('commerce_product_features_feature_key_idx').on(table.featureKey),
}));

export const commerceOrders = pgTable('commerce_orders', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id),
  priceId: varchar('price_id').notNull().references(() => commercePrices.id),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<CommerceOrderStatus>(),
  amountRub: integer('amount_rub').notNull(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commercePayments = pgTable('commerce_payments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar('order_id').notNull().references(() => commerceOrders.id, { onDelete: 'cascade' }),
  providerId: varchar('provider_id').references(() => paymentProviders.id, { onDelete: 'set null' }),
  providerPaymentId: varchar('provider_payment_id', { length: 180 }),
  status: varchar('status', { length: 30 }).notNull().default('pending').$type<CommercePaymentStatus>(),
  amountRub: integer('amount_rub').notNull(),
  paymentMethodToken: text('payment_method_token'),
  fiscalReceiptId: varchar('fiscal_receipt_id', { length: 180 }),
  fiscalReceiptUrl: text('fiscal_receipt_url'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  providerPaymentUnique: uniqueIndex('commerce_payments_provider_payment_idx').on(table.providerId, table.providerPaymentId),
}));

export const commercePaymentEvents = pgTable('commerce_payment_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  providerCode: varchar('provider_code', { length: 40 }).notNull().$type<PaymentProviderCode>(),
  providerEventId: varchar('provider_event_id', { length: 180 }).notNull(),
  providerPaymentId: varchar('provider_payment_id', { length: 180 }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('received').$type<CommercePaymentEventStatus>(),
  receivedAt: timestamp('received_at').notNull().default(sql`now()`),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
}, (table) => ({
  providerEventUnique: uniqueIndex('commerce_payment_events_provider_event_idx').on(table.providerCode, table.providerEventId),
}));

export const commerceSubscriptions = pgTable('commerce_subscriptions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id),
  priceId: varchar('price_id').notNull().references(() => commercePrices.id),
  providerId: varchar('provider_id').references(() => paymentProviders.id, { onDelete: 'set null' }),
  providerSubscriptionId: varchar('provider_subscription_id', { length: 180 }),
  paymentMethodToken: text('payment_method_token'),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<CommerceSubscriptionStatus>(),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  graceUntil: timestamp('grace_until'),
  retryCount: integer('retry_count').notNull().default(0),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commerceEntitlements = pgTable('commerce_entitlements', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopeType: varchar('scope_type', { length: 30 }).notNull().$type<CommerceScopeType>(),
  scopeId: varchar('scope_id'),
  featureKey: varchar('feature_key', { length: 120 }).notNull(),
  sourceType: varchar('source_type', { length: 30 }).notNull().$type<CommerceEntitlementSourceType>(),
  sourceId: varchar('source_id'),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<CommerceEntitlementStatus>(),
  renewalStatus: varchar('renewal_status', { length: 30 }).notNull().default('active').$type<CommerceEntitlementRenewalStatus>(),
  renewalCancelledAt: timestamp('renewal_cancelled_at'),
  startsAt: timestamp('starts_at').notNull().default(sql`now()`),
  endsAt: timestamp('ends_at'),
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const commerceEntitlementActions = pgTable('commerce_entitlement_actions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  entitlementId: varchar('entitlement_id').notNull().references(() => commerceEntitlements.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  adminUserId: varchar('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: varchar('action_type', { length: 40 }).notNull().$type<CommerceEntitlementActionType>(),
  reason: text('reason').notNull(),
  previousStatus: varchar('previous_status', { length: 20 }).notNull().$type<CommerceEntitlementStatus>(),
  newStatus: varchar('new_status', { length: 20 }).notNull().$type<CommerceEntitlementStatus>(),
  previousEndsAt: timestamp('previous_ends_at'),
  newEndsAt: timestamp('new_ends_at'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  entitlementIdx: index('commerce_entitlement_actions_entitlement_idx').on(table.entitlementId, table.createdAt),
  userIdx: index('commerce_entitlement_actions_user_idx').on(table.userId, table.createdAt),
}));

export const readerClubTariffTemplates = pgTable('reader_club_tariff_templates', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  amountRub: integer('amount_rub').notNull(),
  period: varchar('period', { length: 20 }).notNull().$type<Exclude<CommercePricePeriod, 'one_time'>>(),
  readerShareBps: integer('reader_share_bps').notNull(),
  acquiringFeeBps: integer('acquiring_fee_bps').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<ReaderClubTariffTemplateStatus>(),
  visibility: varchar('visibility', { length: 20 }).notNull().default('private').$type<ReaderClubTariffVisibility>(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  statusIdx: index('reader_club_tariff_templates_status_idx').on(table.status, table.visibility, table.sortOrder),
}));

export const readerClubTariffRequests = pgTable('reader_club_tariff_requests', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  requestedBy: varchar('requested_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 180 }).notNull(),
  description: text('description'),
  requestedAmountRub: integer('requested_amount_rub').notNull(),
  requestedPeriod: varchar('requested_period', { length: 20 }).notNull().$type<Exclude<CommercePricePeriod, 'one_time'>>(),
  message: text('message'),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<ReaderClubTariffRequestStatus>(),
  reviewedBy: varchar('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  reviewComment: text('review_comment'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  clubStatusIdx: index('reader_club_tariff_requests_club_status_idx').on(table.clubId, table.status),
}));

export const readerClubTariffAssignments = pgTable('reader_club_tariff_assignments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  templateId: varchar('template_id').references(() => readerClubTariffTemplates.id, { onDelete: 'set null' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  selectedBy: varchar('selected_by').references(() => users.id, { onDelete: 'set null' }),
  readerShareBps: integer('reader_share_bps').notNull(),
  acquiringFeeBps: integer('acquiring_fee_bps').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<ReaderClubTariffAssignmentStatus>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => ({
  activeClubIdx: uniqueIndex('reader_club_tariff_assignments_active_club_idx').on(table.clubId).where(sql`${table.status} = 'active'`),
}));

export const commerceLedgerEntries = pgTable('commerce_ledger_entries', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  paymentId: varchar('payment_id').notNull().references(() => commercePayments.id, { onDelete: 'cascade' }),
  orderId: varchar('order_id').notNull().references(() => commerceOrders.id, { onDelete: 'cascade' }),
  productId: varchar('product_id').notNull().references(() => commerceProducts.id, { onDelete: 'cascade' }),
  clubId: varchar('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  readerUserId: varchar('reader_user_id').references(() => users.id, { onDelete: 'set null' }),
  entryType: varchar('entry_type', { length: 30 }).notNull().$type<CommerceLedgerEntryType>(),
  amountKopecks: integer('amount_kopecks').notNull(),
  shareBps: integer('share_bps'),
  status: varchar('status', { length: 20 }).notNull().default('pending').$type<CommerceLedgerEntryStatus>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => ({
  paymentIdx: index('commerce_ledger_entries_payment_idx').on(table.paymentId),
  readerStatusIdx: index('commerce_ledger_entries_reader_status_idx').on(table.readerUserId, table.status),
}));

export const commerceRenewalReminders = pgTable('commerce_renewal_reminders', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  entitlementId: varchar('entitlement_id').notNull().references(() => commerceEntitlements.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  daysBeforeEnd: integer('days_before_end').notNull(),
  sentAt: timestamp('sent_at').notNull().default(sql`now()`),
}, (table) => ({
  entitlementDayIdx: uniqueIndex('commerce_renewal_reminders_entitlement_day_idx').on(table.entitlementId, table.daysBeforeEnd),
  userIdx: index('commerce_renewal_reminders_user_idx').on(table.userId, table.sentAt),
}));

export type PaymentProviderConfig = typeof paymentProviders.$inferSelect;
export type InsertPaymentProviderConfig = typeof paymentProviders.$inferInsert;
export type CommerceProduct = typeof commerceProducts.$inferSelect;
export type InsertCommerceProduct = typeof commerceProducts.$inferInsert;
export type CommercePrice = typeof commercePrices.$inferSelect;
export type InsertCommercePrice = typeof commercePrices.$inferInsert;
export type CommerceFeatureRegistryItem = typeof commerceFeatureRegistry.$inferSelect;
export type InsertCommerceFeatureRegistryItem = typeof commerceFeatureRegistry.$inferInsert;
export type CommerceProductFeature = typeof commerceProductFeatures.$inferSelect;
export type InsertCommerceProductFeature = typeof commerceProductFeatures.$inferInsert;
export type CommerceOrder = typeof commerceOrders.$inferSelect;
export type InsertCommerceOrder = typeof commerceOrders.$inferInsert;
export type CommercePayment = typeof commercePayments.$inferSelect;
export type InsertCommercePayment = typeof commercePayments.$inferInsert;
export type CommercePaymentEvent = typeof commercePaymentEvents.$inferSelect;
export type InsertCommercePaymentEvent = typeof commercePaymentEvents.$inferInsert;
export type CommerceSubscription = typeof commerceSubscriptions.$inferSelect;
export type InsertCommerceSubscription = typeof commerceSubscriptions.$inferInsert;
export type CommerceEntitlement = typeof commerceEntitlements.$inferSelect;
export type InsertCommerceEntitlement = typeof commerceEntitlements.$inferInsert;
export type CommerceEntitlementAction = typeof commerceEntitlementActions.$inferSelect;
export type InsertCommerceEntitlementAction = typeof commerceEntitlementActions.$inferInsert;
export type ReaderClubTariffTemplate = typeof readerClubTariffTemplates.$inferSelect;
export type InsertReaderClubTariffTemplate = typeof readerClubTariffTemplates.$inferInsert;
export type ReaderClubTariffRequest = typeof readerClubTariffRequests.$inferSelect;
export type InsertReaderClubTariffRequest = typeof readerClubTariffRequests.$inferInsert;
export type ReaderClubTariffAssignment = typeof readerClubTariffAssignments.$inferSelect;
export type InsertReaderClubTariffAssignment = typeof readerClubTariffAssignments.$inferInsert;
export type CommerceLedgerEntry = typeof commerceLedgerEntries.$inferSelect;
export type InsertCommerceLedgerEntry = typeof commerceLedgerEntries.$inferInsert;
export type CommerceRenewalReminder = typeof commerceRenewalReminders.$inferSelect;
export type InsertCommerceRenewalReminder = typeof commerceRenewalReminders.$inferInsert;
