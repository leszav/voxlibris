import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["user", "admin", "moderator"] as const;
export type UserRole = typeof userRoles[number];

export const userStatuses = ["pending", "active", "suspended", "deleted"] as const;
export type UserStatus = typeof userStatuses[number];

export const clubTypes = ["standard", "premium", "reader-led", "reading_club"] as const;
export type ClubType = typeof clubTypes[number];

export const clubStatuses = ["recruiting", "active", "completed", "archived"] as const;
export type ClubStatus = typeof clubStatuses[number];

export const clubMemberRoles = ["owner", "moderator", "member"] as const;
export type ClubMemberRole = typeof clubMemberRoles[number];

export const bookStatuses = ["active", "blocked", "deleted"] as const;
export type BookStatus = typeof bookStatuses[number];

export const users: any = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user").$type<UserRole>(),
  status: text("status").notNull().default("pending").$type<UserStatus>(),
  emailConfirmed: boolean("email_confirmed").notNull().default(false),
  confirmationToken: varchar("confirmation_token", { length: 64 }),
  invitedBy: varchar("invited_by").references((): any => users.id, { onDelete: "set null" }), // Кто пригласил пользователя
  invitedToClub: varchar("invited_to_club"), // В какой клуб приглашен
  lastActivityAt: timestamp("last_activity_at"),
  suspensionReason: text("suspension_reason"),
  suspendedUntil: timestamp("suspended_until"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});


// Refresh tokens for JWT authentication
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  isRevoked: boolean("is_revoked").notNull().default(false),
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
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPosition: text("current_position"), // JSON with detailed position info
  isActive: boolean("is_active").notNull().default(true),
  isLive: boolean("is_live").notNull().default(false),
  startedAt: timestamp("started_at").notNull().default(sql`now()`),
  endedAt: timestamp("ended_at"),
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
  favoriteGenres: text("favorite_genres"), // JSON array
  isReader: boolean("is_reader").notNull().default(false),
  readerRating: integer("reader_rating").notNull().default(0), // 0-500 (5.0 * 100)
  totalReadingSessions: integer("total_reading_sessions").notNull().default(0),
  totalListeners: integer("total_listeners").notNull().default(0),
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

export const bookTypes = ["PERSONAL", "CLUB"] as const;
export type BookType = typeof bookTypes[number];

export const accessActions = ["READ_OPENED", "READ_SESSION_END", "READ_DELETED"] as const;
export type AccessAction = typeof accessActions[number];

// Таблица личных книг пользователя (ТЗ 7.1)
export const personalBooks = pgTable("personal_books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  publicationYear: integer("publication_year"),
  genre: text("genre"),
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

// VoxLibris Upload types
export type InsertPersonalBook = z.infer<typeof insertPersonalBookSchema>;
export type PersonalBook = typeof personalBooks.$inferSelect;

export type InsertClubBook = z.infer<typeof insertClubBookSchema>;
export type ClubBook = typeof clubBooks.$inferSelect;

export type InsertBookAccessLog = z.infer<typeof insertBookAccessLogSchema>;
export type BookAccessLog = typeof bookAccessLogs.$inferSelect;

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
  "block_user", "unblock_user", "change_user_role", "delete_user",
  "archive_club", "delete_club", "block_club", "unblock_club",
  "delete_book", "block_book", "unblock_book",
  "delete_message", "block_message",
  "resolve_report", "dismiss_report", "assign_report",
  "update_settings", "backup_data", "restore_data"
] as const;
export type AdminActionType = typeof adminActionTypes[number];

export const adminActionTargetTypes = ["user", "club", "book", "message", "report", "system"] as const;
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

// Extended types for frontend
export interface ClubWithDetails extends Club {
  book: ClubBook;
  owner: User;
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
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
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
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
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
  payload: any;
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
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
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

export interface ChatMessageWithUser extends ChatMessage {
  user: User;
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
