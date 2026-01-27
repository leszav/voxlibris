import { config } from "dotenv";
import { cpus } from "os";

config();

import {
  type User,
  type InsertUser,
  type UserRole,
  type UserStatus,
  type ClubType,
  type ClubMemberRole,
  type Book,
  type InsertBook,
  type BookContent,
  type InsertBookContent,
  type Club,
  type ClubWithDetails,
  type ClubMember,
  type InsertClub,
  type ReadingSession,
  type ReadingSessionWithDetails,
  type InsertReadingSession,
  type ReadingProgress,
  type InsertReadingProgress,
  type ReadingHistory,
  type ReaderRating,
  type InsertReaderRating,
  type UserProfile,
  type InsertUserProfile,
  type SessionListener,
  type RefreshToken,
  type AdminAction,
  type ModerationReport,
  type InsertModerationReport,
  type ModerationReportType,
  type ModerationReportReason,
  type ModerationReportPriority,
  type SystemSetting,
  type PersonalBook,
  type InsertPersonalBook,
  type BookFormat,
  type ClubBook,
  type InsertClubBook,
  type BookAccessLog,
  type InsertBookAccessLog,
  type ClubInvitation,
  type InsertClubInvitation,
  type Setting,
  type InsertSetting,
  users,
  books,
  bookContent,
  clubs,
  clubMembers,
  clubTags,
  clubInvitations,
  settings,
  readingSessions,
  readingProgress,
  readingHistory,
  sessionListeners,
  readerRatings,
  userProfiles,
  refreshTokens,
  adminActions,
  moderationReports,
  systemSettings,
  personalBooks,
  clubBooks,
  bookAccessLogs
} from "../shared/schema.js";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, desc, asc, count, and, sql, isNull, inArray, exists, or, ne } from "drizzle-orm";
import postgres from "postgres";

// Type aliases for union types
type BookStatusType = 'draft' | 'published' | 'archived';

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserRole(username: string, role: UserRole): Promise<User | undefined>;
  updateUserStatus(username: string, status: UserStatus): Promise<User | undefined>;
  updateUserLastActivity(userId: string): Promise<User | undefined>;
  deleteUser(userId: string): Promise<boolean>;
  restoreUser(userId: string): Promise<User | undefined>;
  permanentDeleteUser(userId: string): Promise<{ success: boolean; error?: string; clubsWithMembers?: Array<{ id: string; title: string; memberCount: number }> }>;
  getAllUsers(includeDeleted?: boolean): Promise<User[]>;
  getDeletedUsers(): Promise<User[]>;
  getPendingUsers(): Promise<User[]>;
  
  // Email confirmation methods
  getUserByConfirmationToken(token: string): Promise<User | undefined>;
  updateUserEmailConfirmation(userId: string, confirmed: boolean): Promise<User | undefined>;
  updateUserConfirmationToken(userId: string, token: string): Promise<User | undefined>;

  // Club methods
  getClubs(): Promise<ClubWithDetails[]>;
  getAllClubs(): Promise<ClubWithDetails[]>;
  getClub(id: string): Promise<ClubWithDetails | undefined>;
  getClubsByUser(userId: string): Promise<ClubWithDetails[]>;
  getClubsOwnedByUser(userId: string): Promise<Club[]>;
  createClub(club: InsertClub & { ownerId: string }): Promise<Club>;
  updateClub(id: string, updates: Partial<InsertClub>): Promise<Club | undefined>;
  deleteClub(id: string): Promise<boolean>;

  // Club membership methods
  joinClub(clubId: string, userId: string, role?: ClubMemberRole): Promise<ClubMember>;
  leaveClub(clubId: string, userId: string): Promise<boolean>;
  getClubMembers(clubId: string): Promise<User[]>;
  getClubMembersWithRoles(clubId: string): Promise<Array<User & { role: ClubMemberRole; joinedAt: Date }>>;
  getUserClubMembership(clubId: string, userId: string): Promise<ClubMember | undefined>;
  getActiveClubMembersCount(clubId: string, excludeUserId?: string): Promise<number>;
  updateMemberRole(clubId: string, userId: string, role: ClubMemberRole): Promise<ClubMember | undefined>;
  removeMember(clubId: string, userId: string): Promise<boolean>;

  // Book methods
  getBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | undefined>;
  getBookByContentHash(contentHash: string): Promise<Book | undefined>;
  getBooksByUser(userId: string): Promise<Book[]>;
  searchBooks(query: string): Promise<Book[]>;
  createBook(book: InsertBook): Promise<Book>;
  updateBook(id: string, updates: Partial<InsertBook>): Promise<Book>;
  deleteBook(id: string): Promise<void>;

  // Book Content methods
  getBookContent(bookId: string, chapterNumber?: number): Promise<BookContent[]>;
  getBookChapter(bookId: string, chapterNumber: number): Promise<BookContent | undefined>;
  createBookContent(content: InsertBookContent): Promise<BookContent>;
  updateBookContent(id: string, updates: Partial<InsertBookContent>): Promise<BookContent>;
  deleteBookContent(id: string): Promise<void>;

  // Reading Session methods
  createReadingSession(session: InsertReadingSession & { readerId: string }): Promise<ReadingSession>;
  getReadingSession(id: string): Promise<ReadingSessionWithDetails | undefined>;
  getActiveSessionsInClub(clubId: string): Promise<ReadingSessionWithDetails[]>;
  getSessionsByReader(readerId: string): Promise<ReadingSessionWithDetails[]>;
  updateSessionPosition(sessionId: string, currentChapter: number, currentPosition: string): Promise<boolean>;
  startSession(sessionId: string): Promise<boolean>;
  endSession(sessionId: string): Promise<boolean>;

  // Session Listeners methods
  joinSession(sessionId: string, listenerId: string): Promise<SessionListener>;
  leaveSession(sessionId: string, listenerId: string): Promise<boolean>;
  getSessionListeners(sessionId: string): Promise<User[]>;
  getActiveListenersCount(sessionId: string): Promise<number>;

  // Reading Progress methods
  updateReadingProgress(progress: InsertReadingProgress & { userId: string }): Promise<ReadingProgress>;
  getUserReadingProgress(userId: string, bookId: string): Promise<ReadingProgress | undefined>;
  getClubReadingProgress(clubId: string): Promise<ReadingProgress[]>;
  addCompletedToHistory(userId: string, bookId: string, bookTitle: string, bookAuthor: string, bookCoverUrl?: string): Promise<void>;
  getReadingHistory(userId: string): Promise<ReadingHistory[]>;
  clearReadingHistory(userId: string): Promise<void>;

  // Reader Ratings methods
  rateReader(rating: InsertReaderRating & { raterId: string }): Promise<ReaderRating>;
  getReaderRatings(readerId: string): Promise<ReaderRating[]>;
  getReaderAverageRating(readerId: string): Promise<number>;

  // User Profile methods
  createOrUpdateUserProfile(userId: string, profile: InsertUserProfile): Promise<UserProfile>;
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  deleteUserProfile(userId: string): Promise<boolean>;
  getTopReaders(limit?: number): Promise<UserProfile[]>;

  // Refresh Token methods
  createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken>;
  getRefreshToken(token: string): Promise<RefreshToken | undefined>;
  revokeRefreshToken(token: string): Promise<boolean>;
  revokeAllUserRefreshTokens(userId: string): Promise<boolean>;
  cleanExpiredRefreshTokens(): Promise<void>;

  // Admin Actions methods
  logAdminAction(action: {
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
  }): Promise<AdminAction>;
  getAdminActions(adminId?: string, limit?: number): Promise<AdminAction[]>;

  // Book Status Management
  updateBookStatus(bookId: string, status: BookStatusType, adminId: string): Promise<boolean>;

  // Moderation Reports methods
  getModerationReports(filters?: { status?: string; type?: string; assignedTo?: string }): Promise<ModerationReport[]>;
  updateModerationReport(reportId: string, updates: Partial<ModerationReport>): Promise<boolean>;
  createModerationReport(report: InsertModerationReport): Promise<string>;

  // System Settings methods
  getSystemSettings(category?: string): Promise<SystemSetting[]>;
  updateSystemSetting(key: string, value: any, updatedBy: string): Promise<boolean>;
  getSystemSetting(key: string): Promise<SystemSetting | null>;

  // Personal Books methods
  createPersonalBook(book: InsertPersonalBook & { userId: string }): Promise<PersonalBook>;
  getPersonalBook(id: string): Promise<PersonalBook | undefined>;
  getPersonalBooksByUser(userId: string): Promise<PersonalBook[]>;
  deletePersonalBook(id: string): Promise<boolean>;
  restorePersonalBook(id: string): Promise<boolean>;
  permanentDeletePersonalBook(id: string): Promise<boolean>;
  updatePersonalBook(id: string, updates: Partial<InsertPersonalBook>): Promise<PersonalBook | undefined>;

  // Club Books methods
  createClubBook(book: InsertClubBook & { uploadedByUserId: string }): Promise<ClubBook>;
  getClubBook(id: string): Promise<ClubBook | undefined>;
  getClubBooksByClub(clubId: string): Promise<ClubBook[]>;
  getAllClubBooks(): Promise<ClubBook[]>;
  deleteClubBook(id: string): Promise<boolean>;
  restoreClubBook(id: string): Promise<boolean>;
  permanentDeleteClubBook(id: string): Promise<boolean>;
  updateClubBook(id: string, updates: Partial<InsertClubBook>): Promise<ClubBook | undefined>;

  // Book Access Logs methods
  logBookAccess(log: InsertBookAccessLog & { userId: string }): Promise<BookAccessLog>;
  getBookAccessLogs(bookId: string): Promise<BookAccessLog[]>;
  getUserAccessLogs(userId: string): Promise<BookAccessLog[]>;

  // Club Invitations methods
  createClubInvitation(invitation: InsertClubInvitation): Promise<ClubInvitation>;
  getClubInvitation(inviteToken: string): Promise<ClubInvitation | undefined>;
  getClubInvitations(clubId: string): Promise<ClubInvitation[]>;
  updateInvitationStatus(inviteToken: string, status: string, acceptedAt?: Date): Promise<boolean>;
  deleteClubInvitation(id: string): Promise<boolean>;
  deleteClubInvitationsByEmail(clubId: string, email: string): Promise<number>;

  // Settings methods (для SMTP и других настроек)
  getSetting(key: string): Promise<Setting | undefined>;
  getSettingsByCategory(category: string): Promise<Setting[]>;
  setSetting(setting: InsertSetting & { updatedBy: string }): Promise<Setting>;
  deleteSetting(key: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private readonly users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async updatePersonalBook(id: string, updates: Partial<InsertPersonalBook>): Promise<PersonalBook | undefined> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  async getBooksByUser(userId: string): Promise<Book[]> {
    throw new Error("MemStorage does not support user books - use PostgreSQL");
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      role: "user",
      status: insertUser.status || "pending",
      emailConfirmed: false,
      confirmationToken: null,
      lastActivityAt: null,
      suspensionReason: null,
      suspendedUntil: null,
      failedLoginAttempts: 0,
      invitedBy: insertUser.invitedBy || null,
      invitedToClub: insertUser.invitedToClub || null,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserRole(username: string, role: UserRole): Promise<User | undefined> {
    const user = Array.from(this.users.values()).find(u => u.username === username);
    if (!user) return undefined;

    user.role = role;
    this.users.set(user.id, user);
    return user;
  }

  async updateUserStatus(username: string, status: UserStatus): Promise<User | undefined> {
    const user = Array.from(this.users.values()).find(u => u.username === username);
    if (!user) return undefined;

    user.status = status;
    this.users.set(user.id, user);
    return user;
  }

  async deleteUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    // Мягкое удаление - меняем статус на 'deleted'
    user.status = 'deleted' as UserStatus;
    this.users.set(userId, user);
    return true;
  }

  async restoreUser(userId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user?.status || user.status !== 'deleted') return undefined;

    user.status = 'active' as UserStatus;
    this.users.set(userId, user);
    return user;
  }

  async permanentDeleteUser(userId: string): Promise<{ success: boolean; error?: string; clubsWithMembers?: Array<{ id: string; title: string; memberCount: number }> }> {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    this.users.delete(userId);
    return { success: true };
  }

  async getAllUsers(includeDeleted: boolean = false): Promise<User[]> {
    const allUsers = Array.from(this.users.values());
    if (includeDeleted) {
      return allUsers;
    }
    return allUsers.filter(u => u.status !== 'deleted');
  }

  async getDeletedUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => u.status === 'deleted');
  }

  async getPendingUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => u.status === 'pending');
  }

  // Email confirmation methods
  async getUserByConfirmationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.confirmationToken === token);
  }

  async updateUserEmailConfirmation(userId: string, confirmed: boolean): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      emailConfirmed: confirmed,
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserConfirmationToken(userId: string, token: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      confirmationToken: token,
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserLastActivity(userId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      lastActivityAt: new Date(),
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  // MemStorage stub implementations (for testing fallback only)
  async getClubs(): Promise<ClubWithDetails[]> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getAllClubs(): Promise<ClubWithDetails[]> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getClub(id: string): Promise<ClubWithDetails | undefined> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getClubsByUser(userId: string): Promise<ClubWithDetails[]> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getClubsOwnedByUser(userId: string): Promise<Club[]> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async createClub(club: InsertClub & { ownerId: string }): Promise<Club> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async updateClub(id: string, updates: Partial<InsertClub>): Promise<Club | undefined> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async deleteClub(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async joinClub(clubId: string, userId: string, role: ClubMemberRole = 'member'): Promise<ClubMember> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async leaveClub(clubId: string, userId: string): Promise<boolean> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getClubMembers(clubId: string): Promise<User[]> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getClubMembersWithRoles(clubId: string): Promise<Array<User & { role: ClubMemberRole; joinedAt: Date }>> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getUserClubMembership(clubId: string, userId: string): Promise<ClubMember | undefined> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getActiveClubMembersCount(clubId: string, excludeUserId?: string): Promise<number> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async updateMemberRole(clubId: string, userId: string, role: ClubMemberRole): Promise<ClubMember | undefined> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async removeMember(clubId: string, userId: string): Promise<boolean> {
    throw new Error("MemStorage does not support clubs - use PostgreSQL");
  }

  async getBooks(): Promise<Book[]> {
    throw new Error("MemStorage does not support books - use PostgreSQL");
  }

  async getBook(id: string): Promise<Book | undefined> {
    throw new Error("MemStorage does not support books - use PostgreSQL");
  }

  async searchBooks(query: string): Promise<Book[]> {
    throw new Error("MemStorage does not support books - use PostgreSQL");
  }

  async createBook(book: InsertBook): Promise<Book> {
    throw new Error("MemStorage does not support books - use PostgreSQL");
  }

  async updateBook(id: string, updates: Partial<InsertBook>): Promise<Book> {
    throw new Error("MemStorage does not support books - use PostgreSQL");
  }

  async deleteBook(id: string): Promise<void> {
    throw new Error("MemStorage does not support books - use PostgreSQL");
  }

  async getBookContent(bookId: string, chapterNumber?: number): Promise<BookContent[]> {
    throw new Error("MemStorage does not support book content - use PostgreSQL");
  }

  async getBookChapter(bookId: string, chapterNumber: number): Promise<BookContent | undefined> {
    throw new Error("MemStorage does not support book content - use PostgreSQL");
  }

  async createBookContent(content: InsertBookContent): Promise<BookContent> {
    throw new Error("MemStorage does not support book content - use PostgreSQL");
  }

  async updateBookContent(id: string, updates: Partial<InsertBookContent>): Promise<BookContent> {
    throw new Error("MemStorage does not support book content - use PostgreSQL");
  }

  async deleteBookContent(id: string): Promise<void> {
    throw new Error("MemStorage does not support book content - use PostgreSQL");
  }

  async createReadingSession(session: InsertReadingSession & { readerId: string }): Promise<ReadingSession> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async getReadingSession(id: string): Promise<ReadingSessionWithDetails | undefined> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async getActiveSessionsInClub(clubId: string): Promise<ReadingSessionWithDetails[]> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async getSessionsByReader(readerId: string): Promise<ReadingSessionWithDetails[]> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async updateSessionPosition(sessionId: string, currentChapter: number, currentPosition: string): Promise<boolean> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async startSession(sessionId: string): Promise<boolean> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async endSession(sessionId: string): Promise<boolean> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async joinSession(sessionId: string, listenerId: string): Promise<SessionListener> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async leaveSession(sessionId: string, listenerId: string): Promise<boolean> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async getSessionListeners(sessionId: string): Promise<User[]> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async getActiveListenersCount(sessionId: string): Promise<number> {
    throw new Error("MemStorage does not support reading sessions - use PostgreSQL");
  }

  async updateReadingProgress(progress: InsertReadingProgress & { userId: string }): Promise<ReadingProgress> {
    throw new Error("MemStorage does not support reading progress - use PostgreSQL");
  }

  async getUserReadingProgress(userId: string, bookId: string): Promise<ReadingProgress | undefined> {
    throw new Error("MemStorage does not support reading progress - use PostgreSQL");
  }

  async getClubReadingProgress(clubId: string): Promise<ReadingProgress[]> {
    throw new Error("MemStorage does not support reading progress - use PostgreSQL");
  }

  async getReadingHistory(userId: string): Promise<ReadingHistory[]> {
    throw new Error("MemStorage does not support reading history - use PostgreSQL");
  }

  async addCompletedToHistory(userId: string, bookId: string, bookTitle: string, bookAuthor: string, bookCoverUrl?: string): Promise<void> {
    throw new Error("MemStorage does not support reading history - use PostgreSQL");
  }

  async clearReadingHistory(userId: string): Promise<void> {
    throw new Error("MemStorage does not support reading history - use PostgreSQL");
  }

  async rateReader(rating: InsertReaderRating & { raterId: string }): Promise<ReaderRating> {
    throw new Error("MemStorage does not support reader ratings - use PostgreSQL");
  }

  async getReaderRatings(readerId: string): Promise<ReaderRating[]> {
    throw new Error("MemStorage does not support reader ratings - use PostgreSQL");
  }

  async getReaderAverageRating(readerId: string): Promise<number> {
    throw new Error("MemStorage does not support reader ratings - use PostgreSQL");
  }

  async createOrUpdateUserProfile(userId: string, profile: InsertUserProfile): Promise<UserProfile> {
    throw new Error("MemStorage does not support user profiles - use PostgreSQL");
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    throw new Error("MemStorage does not support user profiles - use PostgreSQL");
  }

  async deleteUserProfile(userId: string): Promise<boolean> {
    throw new Error("MemStorage does not support user profiles - use PostgreSQL");
  }

  async getTopReaders(limit?: number): Promise<UserProfile[]> {
    throw new Error("MemStorage does not support user profiles - use PostgreSQL");
  }


  // Refresh Token methods (stubs for MemStorage)
  async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    throw new Error("MemStorage does not support refresh tokens - use PostgreSQL");
  }

  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    throw new Error("MemStorage does not support refresh tokens - use PostgreSQL");
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    throw new Error("MemStorage does not support refresh tokens - use PostgreSQL");
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<boolean> {
    throw new Error("MemStorage does not support refresh tokens - use PostgreSQL");
  }

  async cleanExpiredRefreshTokens(): Promise<void> {
    throw new Error("MemStorage does not support refresh tokens - use PostgreSQL");
  }

  // Admin Actions methods (MemStorage stubs)
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
    throw new Error("MemStorage does not support admin actions - use PostgreSQL");
  }

  async getAdminActions(adminId?: string, limit?: number): Promise<AdminAction[]> {
    throw new Error("MemStorage does not support admin actions - use PostgreSQL");
  }

  // Book Status Management (MemStorage stubs)
  async updateBookStatus(bookId: string, status: 'draft' | 'published' | 'archived', adminId: string): Promise<boolean> {
    throw new Error("MemStorage does not support book status management - use PostgreSQL");
  }

  // Moderation Reports methods (MemStorage stubs)
  async getModerationReports(filters?: { status?: string; type?: string; assignedTo?: string }): Promise<ModerationReport[]> {
    throw new Error("MemStorage does not support moderation reports - use PostgreSQL");
  }

  async updateModerationReport(reportId: string, updates: Partial<ModerationReport>): Promise<boolean> {
    throw new Error("MemStorage does not support moderation reports - use PostgreSQL");
  }

  async createModerationReport(report: InsertModerationReport): Promise<string> {
    throw new Error("MemStorage does not support moderation reports - use PostgreSQL");
  }

  // System Settings methods (MemStorage stubs)
  async getSystemSettings(category?: string): Promise<SystemSetting[]> {
    throw new Error("MemStorage does not support system settings - use PostgreSQL");
  }

  async updateSystemSetting(key: string, value: any, updatedBy: string): Promise<boolean> {
    throw new Error("MemStorage does not support system settings - use PostgreSQL");
  }

  async getSystemSetting(key: string): Promise<SystemSetting | null> {
    throw new Error("MemStorage does not support system settings - use PostgreSQL");
  }

  // VoxLibris Upload Context methods (MemStorage stubs)
  // Personal Books methods (MemStorage stubs)
  async createPersonalBook(book: InsertPersonalBook & { userId: string }): Promise<PersonalBook> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  async getPersonalBook(id: string): Promise<PersonalBook | undefined> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  async getPersonalBooksByUser(userId: string): Promise<PersonalBook[]> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  async deletePersonalBook(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  async restorePersonalBook(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  async permanentDeletePersonalBook(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support personal books - use PostgreSQL");
  }

  // Club Books methods (MemStorage stubs)
  async createClubBook(book: InsertClubBook & { uploadedByUserId: string }): Promise<ClubBook> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async getClubBook(id: string): Promise<ClubBook | undefined> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async getClubBooksByClub(clubId: string): Promise<ClubBook[]> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async getAllClubBooks(): Promise<ClubBook[]> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async deleteClubBook(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async restoreClubBook(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async permanentDeleteClubBook(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  async updateClubBook(id: string, updates: Partial<InsertClubBook>): Promise<ClubBook | undefined> {
    throw new Error("MemStorage does not support club books - use PostgreSQL");
  }

  // Book Access Logs methods (MemStorage stubs)
  async logBookAccess(log: InsertBookAccessLog & { userId: string }): Promise<BookAccessLog> {
    throw new Error("MemStorage does not support book access logs - use PostgreSQL");
  }

  async getBookAccessLogs(bookId: string): Promise<BookAccessLog[]> {
    throw new Error("MemStorage does not support book access logs - use PostgreSQL");
  }

  async getUserAccessLogs(userId: string): Promise<BookAccessLog[]> {
    throw new Error("MemStorage does not support book access logs - use PostgreSQL");
  }

  // Enhanced book methods for VoxLibris Upload (MemStorage stubs)
  async getBookByContentHash(contentHash: string): Promise<Book | undefined> {
    throw new Error("MemStorage does not support content hash lookup - use PostgreSQL");
  }

  // Club Invitations methods (MemStorage stubs)
  async createClubInvitation(invitation: InsertClubInvitation): Promise<ClubInvitation> {
    throw new Error("MemStorage does not support club invitations - use PostgreSQL");
  }

  async getClubInvitation(inviteToken: string): Promise<ClubInvitation | undefined> {
    throw new Error("MemStorage does not support club invitations - use PostgreSQL");
  }

  async getClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    throw new Error("MemStorage does not support club invitations - use PostgreSQL");
  }

  async updateInvitationStatus(inviteToken: string, status: string, acceptedAt?: Date): Promise<boolean> {
    throw new Error("MemStorage does not support club invitations - use PostgreSQL");
  }

  async deleteClubInvitation(id: string): Promise<boolean> {
    throw new Error("MemStorage does not support club invitations - use PostgreSQL");
  }

  async deleteClubInvitationsByEmail(clubId: string, email: string): Promise<number> {
    throw new Error("MemStorage does not support club invitations - use PostgreSQL");
  }

  // Settings methods (MemStorage stubs)
  async getSetting(key: string): Promise<Setting | undefined> {
    throw new Error("MemStorage does not support settings - use PostgreSQL");
  }

  async getSettingsByCategory(category: string): Promise<Setting[]> {
    throw new Error("MemStorage does not support settings - use PostgreSQL");
  }

  async setSetting(setting: InsertSetting & { updatedBy: string }): Promise<Setting> {
    throw new Error("MemStorage does not support settings - use PostgreSQL");
  }

  async deleteSetting(key: string): Promise<boolean> {
    throw new Error("MemStorage does not support settings - use PostgreSQL");
  }
}

export class PostgreSQLStorage implements IStorage {
  private readonly db: ReturnType<typeof drizzle>;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    const client = postgres(process.env.DATABASE_URL, {
      max: Math.max(20, cpus().length * 4), // Scale with CPU cores
      idle_timeout: 60, // Increase idle timeout
      connect_timeout: 10,
      max_lifetime: 300, // 5 minutes max lifetime
    });

    this.db = drizzle(client);
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db
      .insert(users)
      .values(insertUser)
      .returning();

    return result[0];
  }

  async updateUserRole(username: string, role: UserRole): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ role })
      .where(eq(users.username, username))
      .returning();

    return result[0];
  }

  async updateUserStatus(username: string, status: UserStatus): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ status })
      .where(eq(users.username, username))
      .returning();

    return result[0];
  }

  async updateUserLastActivity(userId: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ lastActivityAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async deleteUser(userId: string): Promise<boolean> {
    // Мягкое удаление - меняем статус на 'deleted'
    const result = await this.db
      .update(users)
      .set({ status: 'deleted' as UserStatus })
      .where(eq(users.id, userId))
      .returning();

    return result.length > 0;
  }

  async restoreUser(userId: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ status: 'active' as UserStatus })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async permanentDeleteUser(userId: string): Promise<{ success: boolean; error?: string; clubsWithMembers?: Array<{ id: string; title: string; memberCount: number }> }> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));

        const ownedClubs = await tx
          .select()
          .from(clubs)
          .where(and(eq(clubs.ownerId, userId), eq(clubs.isActive, true)));

        const clubsWithMembers: Array<{ id: string; title: string; memberCount: number }> = [];

        for (const club of ownedClubs) {
          const memberCountResult = await tx
            .select({ count: count(clubMembers.id) })
            .from(clubMembers)
            .where(and(
              eq(clubMembers.clubId, club.id),
              eq(clubMembers.isActive, true),
              ne(clubMembers.userId, userId)
            ));

          const memberCount = Number(memberCountResult[0]?.count || 0);

          if (memberCount > 0) {
            clubsWithMembers.push({
              id: club.id,
              title: club.title,
              memberCount
            });
          } else {
            await tx.delete(clubs).where(eq(clubs.id, club.id));
          }
        }

        if (clubsWithMembers.length > 0) {
          throw new Error('CLUBS_WITH_MEMBERS');
        }

        const result = await tx
          .delete(users)
          .where(eq(users.id, userId))
          .returning();

        if (result.length === 0) {
          throw new Error('USER_NOT_FOUND');
        }
      });

      return { success: true };
    } catch (error: any) {
      if (error.message === 'CLUBS_WITH_MEMBERS') {
        const ownedClubs = await this.db
          .select({
            id: clubs.id,
            title: clubs.title
          })
          .from(clubs)
          .where(and(eq(clubs.ownerId, userId), eq(clubs.isActive, true)));

        // Optimized: Single query for all club member counts
        if (ownedClubs.length === 0) {
          return { success: false, error: 'Cannot delete user: owns clubs with active members', clubsWithMembers: [] };
        }

        const clubIds = ownedClubs.map(club => club.id);
        const memberCounts = await this.db
          .select({
            clubId: clubMembers.clubId,
            count: count(clubMembers.id)
          })
          .from(clubMembers)
          .where(and(
            inArray(clubMembers.clubId, clubIds),
            eq(clubMembers.isActive, true),
            ne(clubMembers.userId, userId)
          ))
          .groupBy(clubMembers.clubId);

        const clubsWithMembers = ownedClubs.map(club => {
          const memberCount = memberCounts.find(mc => mc.clubId === club.id)?.count || 0;
          return {
            id: club.id,
            title: club.title,
            memberCount: Number(memberCount)
          };
        });

        return { 
          success: false, 
          error: 'Cannot delete user: owns clubs with active members',
          clubsWithMembers: clubsWithMembers.filter(c => c.memberCount > 0)
        };
      }
      
      console.error('Error in permanentDeleteUser:', error);
      return { success: false, error: error.message };
    }
  }

  async getAllUsers(includeDeleted: boolean = false): Promise<User[]> {
    const query = this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        invitedBy: users.invitedBy,
        invitedToClub: users.invitedToClub,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .from(users);

    if (!includeDeleted) {
      const result = await query
        .where(sql`${users.status} != 'deleted'`)
        .orderBy(desc(users.createdAt));
      return result;
    }

    const result = await query.orderBy(desc(users.createdAt));
    return result;
  }

  async getDeletedUsers(): Promise<User[]> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.status, 'deleted'))
      .orderBy(desc(users.createdAt));

    return result;
  }

  async getPendingUsers(): Promise<User[]> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.status, 'pending'))
      .orderBy(desc(users.createdAt));

    return result;
  }

  // Email confirmation methods
  async getUserByConfirmationToken(token: string): Promise<User | undefined> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        invitedBy: users.invitedBy,
        invitedToClub: users.invitedToClub,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.confirmationToken, token))
      .limit(1)
      .execute();
    
    return result[0];
  }

  async updateUserEmailConfirmation(userId: string, confirmed: boolean): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ emailConfirmed: confirmed })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        invitedBy: users.invitedBy,
        invitedToClub: users.invitedToClub,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .execute();
    
    return result[0];
  }

  async updateUserConfirmationToken(userId: string, token: string): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ confirmationToken: token })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        invitedBy: users.invitedBy,
        invitedToClub: users.invitedToClub,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .execute();
    
    return result[0];
  }

  // Club methods - оптимизированный для устранения N+1 query проблем
  async getClubs(options?: {
    limit?: number;
    offset?: number;
    includeMemberCount?: boolean;
    includeTags?: boolean;
    userId?: string;
  }): Promise<ClubWithDetails[]> {
    const { limit = 50, offset = 0, includeMemberCount = true, includeTags = true, userId } = options || {};

    let baseQuery = this.db
      .select({
        id: clubs.id,
        title: clubs.title,
        description: clubs.description,
        ownerId: clubs.ownerId,
        bookId: clubs.bookId,
        type: clubs.type,
        coverImage: clubs.coverImage,
        isPrivate: clubs.isPrivate,
        maxMembers: clubs.maxMembers,
        status: clubs.status,
        isActive: clubs.isActive,
        isLive: clubs.isLive,
        isFeatured: clubs.isFeatured,
        schedule: clubs.schedule,
        settings: clubs.settings,
        archivedAt: clubs.archivedAt,
        archiveReason: clubs.archiveReason,
        createdAt: clubs.createdAt,
        updatedAt: clubs.updatedAt,
        owner: {
          id: users.id,
          username: users.username
        }
      })
      .from(clubs)
      .leftJoin(users, eq(clubs.ownerId, users.id))
      .where(eq(clubs.isActive, true))
      .orderBy(desc(clubs.createdAt))
      .limit(limit)
      .offset(offset);

    // Добавить условие фильтрации по пользователю
    if (userId) {
      baseQuery = baseQuery as any;
      baseQuery = (baseQuery as any).where(
        or(
          eq(clubs.isPrivate, false),
          exists(
            this.db
              .select({ id: clubMembers.id })
              .from(clubMembers)
              .where(
                and(
                  eq(clubMembers.clubId, clubs.id),
                  eq(clubMembers.userId, userId),
                  eq(clubMembers.isActive, true)
                )
              )
          )
        )
      );
    }

    const clubsData = await baseQuery;

    // Получить все ID для batch запросов
    const clubIds = clubsData.map(club => club.id);

    // Batch запрос для member counts
    let memberCounts: Record<string, number> = {};
    if (includeMemberCount && clubIds.length > 0) {
      const counts = await this.db
        .select({
          clubId: clubMembers.clubId,
          count: count(clubMembers.id)
        })
        .from(clubMembers)
        .where(
          and(
            inArray(clubMembers.clubId, clubIds),
            eq(clubMembers.isActive, true)
          )
        )
        .groupBy(clubMembers.clubId);

      memberCounts = Object.fromEntries(counts.map(c => [c.clubId, Number(c.count)]));
    }

    // Batch запрос для tags
    let tagsByClub: Record<string, string[]> = {};
    if (includeTags && clubIds.length > 0) {
      const tags = await this.db
        .select({
          clubId: clubTags.clubId,
          tag: clubTags.tag
        })
        .from(clubTags)
        .where(inArray(clubTags.clubId, clubIds));

      tagsByClub = tags.reduce((acc: Record<string, string[]>, tag) => {
        if (!acc[tag.clubId]) acc[tag.clubId] = [];
        acc[tag.clubId].push(tag.tag);
        return acc;
      }, {});
    }

    // Собрать результат
    return clubsData.map(club => ({
      ...club,
      owner: club.owner || { id: '', username: '', displayName: null, avatarUrl: null },
      book: {} as ClubBook, // Временно пустой объект, будет заполнен при необходимости
      memberCount: memberCounts[club.id] || 0,
      tags: tagsByClub[club.id] || [],
    })) as ClubWithDetails[];
  }

  async getClub(id: string): Promise<ClubWithDetails | undefined> {
    const result = await this.db
      .select({
        club: clubs,
        book: clubBooks,
        owner: {
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
        },
        memberCount: count(clubMembers.id),
      })
      .from(clubs)
      .leftJoin(clubBooks, eq(clubs.bookId, clubBooks.id))
      .leftJoin(users, eq(clubs.ownerId, users.id))
      .leftJoin(clubMembers, and(eq(clubMembers.clubId, clubs.id), eq(clubMembers.isActive, true)))
      .where(and(eq(clubs.id, id), eq(clubs.isActive, true)))
      .groupBy(clubs.id, clubBooks.id, users.id)
      .limit(1);

    if (result.length === 0) return undefined;

    const row = result[0];
    const tags = await this.db
      .select({ tag: clubTags.tag })
      .from(clubTags)
      .where(eq(clubTags.clubId, id));

    return {
      ...row.club,
      book: row.book!,
      owner: row.owner!,
      tags: tags.map(t => t.tag),
      memberCount: Number(row.memberCount),
    } as ClubWithDetails;
  }

  // Получить ВСЕ клубы для каталога (публичные и приватные), отсортированные по популярности
  async getAllClubs(): Promise<ClubWithDetails[]> {
    try {
      console.log('[Storage] getAllClubs() called');
      
      // Подзапрос для подсчета количества участников
      const memberCountSubquery = this.db
        .select({
          clubId: clubMembers.clubId,
          memberCount: sql<number>`${count(clubMembers.id)}`.mapWith(Number).as('memberCount')
        })
        .from(clubMembers)
        .where(eq(clubMembers.isActive, true))
        .groupBy(clubMembers.clubId)
        .as('member_counts');

      // Основной запрос с JOIN для сортировки по популярности
      const clubsData = await this.db
        .select({
          id: clubs.id,
          title: clubs.title,
          description: clubs.description,
          ownerId: clubs.ownerId,
          bookId: clubs.bookId,
          type: clubs.type,
          coverImage: clubs.coverImage,
          isPrivate: clubs.isPrivate,
          maxMembers: clubs.maxMembers,
          status: clubs.status,
          isActive: clubs.isActive,
          isLive: clubs.isLive,
          isFeatured: clubs.isFeatured,
          schedule: clubs.schedule,
          settings: clubs.settings,
          archivedAt: clubs.archivedAt,
          archiveReason: clubs.archiveReason,
          createdAt: clubs.createdAt,
          updatedAt: clubs.updatedAt,
          memberCount: sql<number>`COALESCE(${memberCountSubquery.memberCount}, 0)`
        })
        .from(clubs)
        .leftJoin(memberCountSubquery, eq(clubs.id, memberCountSubquery.clubId))
        .where(eq(clubs.isActive, true))
        .orderBy(desc(sql`${memberCountSubquery.memberCount}`), desc(clubs.createdAt)) // Сортировка по популярности, затем по дате
        .limit(50);

      // Получить все ID для batch запросов
      const clubIds = clubsData.map(club => club.id);

      // Batch запрос для owners
      const ownerIds = clubsData.map(club => club.ownerId);
      const ownersData = await this.db
        .select()
        .from(users)
        .where(inArray(users.id, ownerIds));
      
      const ownersMap = new Map(ownersData.map(owner => [owner.id, owner]));

      // memberCount уже включен в clubsData из основного запроса

      // Batch запрос для books
      const booksData = await this.db
        .select()
        .from(clubBooks)
        .where(inArray(clubBooks.clubId, clubIds));

      const booksMap = new Map(booksData.map(book => [book.clubId, book]));

      // Batch запрос для tags
      const tagsData = await this.db
        .select()
        .from(clubTags)
        .where(inArray(clubTags.clubId, clubIds));

      const tagsByClub: Record<string, string[]> = {};
      for (const tag of tagsData) {
        if (!tagsByClub[tag.clubId]) {
          tagsByClub[tag.clubId] = [];
        }
        tagsByClub[tag.clubId].push(tag.tag);
      }

      // Формируем результат
      const result = clubsData.map(club => ({
        ...club,
        owner: ownersMap.get(club.ownerId) || { id: '', username: '', displayName: null, avatarUrl: null },
        book: booksMap.get(club.id) || {} as ClubBook,
        memberCount: club.memberCount || 0, // memberCount уже из основного запроса
        tags: tagsByClub[club.id] || [],
      })) as ClubWithDetails[];

      console.log(`[Storage] getAllClubs() returned ${result.length} clubs`);
      return result;
    } catch (error) {
      console.error('[Storage] Error in getAllClubs():', error);
      throw error;
    }
  }

  async getClubsByUser(userId: string): Promise<ClubWithDetails[]> {
    const result = await this.db
      .select({
        club: clubs,
        book: clubBooks,
        owner: {
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
        },
      })
      .from(clubMembers)
      .innerJoin(clubs, eq(clubMembers.clubId, clubs.id))
      .leftJoin(clubBooks, eq(clubs.bookId, clubBooks.id))
      .leftJoin(users, eq(clubs.ownerId, users.id))
      .where(and(eq(clubMembers.userId, userId), eq(clubMembers.isActive, true), eq(clubs.isActive, true)))
      .orderBy(desc(clubs.createdAt));

    // Get member count and tags for each club
    const clubsWithDetails = await Promise.all(
      result.map(async (row) => {
        // Get member count
        const memberCountResult = await this.db
          .select({ count: count(clubMembers.id) })
          .from(clubMembers)
          .where(and(eq(clubMembers.clubId, row.club.id), eq(clubMembers.isActive, true)));

        // Get tags
        const tags = await this.db
          .select({ tag: clubTags.tag })
          .from(clubTags)
          .where(eq(clubTags.clubId, row.club.id));

        return {
          ...row.club,
          book: row.book!,
          owner: row.owner!,
          tags: tags.map(t => t.tag),
          memberCount: Number(memberCountResult[0]?.count || 0),
        } as ClubWithDetails;
      })
    );

    return clubsWithDetails;
  }

  async getClubsOwnedByUser(userId: string): Promise<Club[]> {
    const result = await this.db
      .select()
      .from(clubs)
      .where(and(eq(clubs.ownerId, userId), eq(clubs.isActive, true)))
      .orderBy(desc(clubs.createdAt));

    return result;
  }

  async createClub(clubData: InsertClub & { ownerId: string }): Promise<Club> {
    const result = await this.db
      .insert(clubs)
      .values({
        title: clubData.title,
        description: clubData.description,
        coverImage: clubData.coverImage,
        bookId: clubData.bookId, // может быть undefined - книга загружается после создания клуба
        ownerId: clubData.ownerId,
        type: clubData.type as ClubType,
        maxMembers: clubData.maxMembers,
        isPrivate: clubData.isPrivate,
        schedule: clubData.schedule,
        settings: clubData.settings
      })
      .returning();

    return result[0];
  }

  async updateClub(id: string, updates: Partial<InsertClub>): Promise<Club | undefined> {
    const updateData: any = { updatedAt: new Date() };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.coverImage !== undefined) updateData.coverImage = updates.coverImage;
    if (updates.bookId !== undefined) updateData.bookId = updates.bookId;
    if (updates.type !== undefined) updateData.type = updates.type as ClubType;
    if (updates.isPrivate !== undefined) updateData.isPrivate = updates.isPrivate;
    if (updates.maxMembers !== undefined) updateData.maxMembers = updates.maxMembers;
    if (updates.schedule !== undefined) updateData.schedule = updates.schedule;
    if (updates.settings !== undefined) updateData.settings = updates.settings;

    const result = await this.db
      .update(clubs)
      .set(updateData)
      .where(eq(clubs.id, id))
      .returning();

    return result[0];
  }

  async deleteClub(id: string): Promise<boolean> {
    const result = await this.db
      .delete(clubs)
      .where(eq(clubs.id, id))
      .returning();

    return result.length > 0;
  }

  // Club membership methods
  async joinClub(clubId: string, userId: string, role: ClubMemberRole = 'member'): Promise<ClubMember> {
    const result = await this.db
      .insert(clubMembers)
      .values({ clubId, userId, role })
      .returning();

    return result[0];
  }

  async leaveClub(clubId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(clubMembers)
      .set({ isActive: false })
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .returning();

    return result.length > 0;
  }

  async getClubMembers(clubId: string): Promise<User[]> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        role: users.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        createdAt: users.createdAt,
      })
      .from(clubMembers)
      .innerJoin(users, eq(clubMembers.userId, users.id))
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.isActive, true)))
      .orderBy(asc(clubMembers.joinedAt));

    return result;
  }

  async getUserClubMembership(clubId: string, userId: string): Promise<ClubMember | undefined> {
    const result = await this.db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId), eq(clubMembers.isActive, true)))
      .limit(1);

    return result[0];
  }

  async getClubMembersWithRoles(clubId: string): Promise<Array<User & { role: ClubMemberRole; joinedAt: Date }>> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        role: clubMembers.role,
        status: users.status,
        emailConfirmed: users.emailConfirmed,
        confirmationToken: users.confirmationToken,
        lastActivityAt: users.lastActivityAt,
        suspensionReason: users.suspensionReason,
        suspendedUntil: users.suspendedUntil,
        failedLoginAttempts: users.failedLoginAttempts,
        joinedAt: clubMembers.joinedAt,
        createdAt: users.createdAt,
      })
      .from(clubMembers)
      .innerJoin(users, eq(clubMembers.userId, users.id))
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.isActive, true)))
      .orderBy(asc(clubMembers.joinedAt));

    return result as any;
  }

  async updateMemberRole(clubId: string, userId: string, role: ClubMemberRole): Promise<ClubMember | undefined> {
    const result = await this.db
      .update(clubMembers)
      .set({ role })
      .where(and(
        eq(clubMembers.clubId, clubId),
        eq(clubMembers.userId, userId),
        eq(clubMembers.isActive, true)
      ))
      .returning();

    return result[0];
  }

  async getActiveClubMembersCount(clubId: string, excludeUserId?: string): Promise<number> {
    let conditions = [eq(clubMembers.clubId, clubId), eq(clubMembers.isActive, true)];
    
    if (excludeUserId) {
      conditions.push(ne(clubMembers.userId, excludeUserId));
    }
    
    const result = await this.db
      .select({ count: count(clubMembers.id) })
      .from(clubMembers)
      .where(and(...conditions));

    return Number(result[0]?.count || 0);
  }

  async removeMember(clubId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(clubMembers)
      .where(and(
        eq(clubMembers.clubId, clubId),
        eq(clubMembers.userId, userId)
      ))
      .returning();

    return result.length > 0;
  }

  // Book methods
  async getBooks(): Promise<Book[]> {
    const result = await this.db
      .select()
      .from(books)
      .orderBy(asc(books.title));

    return result;
  }

  async getBooksByUser(userId: string): Promise<Book[]> {
    const result = await this.db
      .select()
      .from(books)
      .where(eq(books.uploadedBy, userId))
      .orderBy(asc(books.title));

    return result;
  }

  async getBook(id: string): Promise<Book | undefined> {
    const result = await this.db
      .select()
      .from(books)
      .where(eq(books.id, id))
      .limit(1);

    return result[0];
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  async searchBooks(query: string): Promise<Book[]> {
    const result = await this.db
      .select()
      .from(books)
      .orderBy(asc(books.title));

    // For now return all books - proper search implementation would need sql operator
    return result;
  }

  async createBook(bookData: InsertBook): Promise<Book> {
    const result = await this.db
      .insert(books)
      .values(bookData)
      .returning();

    return result[0];
  }

  async updateBook(id: string, updates: Partial<InsertBook>): Promise<Book> {
    const result = await this.db
      .update(books)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning();

    return result[0];
  }

  async deleteBook(id: string): Promise<void> {
    // Используем транзакцию для атомарного удаления всех связанных данных
    await this.db.transaction(async (tx) => {
      console.log(`[DEBUG] Starting cascade delete for book: ${id}`);

      try {
        // 1. Найти все связанные клубы
        const relatedClubs = await tx
          .select({ id: clubs.id })
          .from(clubs)
          .where(eq(clubs.bookId, id));

        const clubIds = relatedClubs.map(club => club.id);
        console.log(`[DEBUG] Found ${clubIds.length} related clubs:`, clubIds);

        // 2. Удалить club_tags для всех связанных клубов
        if (clubIds.length > 0) {
          const deletedTags = await tx
            .delete(clubTags)
            .where(inArray(clubTags.clubId, clubIds))
            .returning();
          console.log(`[DEBUG] Deleted ${deletedTags.length} club_tags`);

          // 3. Удалить club_members для всех связанных клубов
          const deletedMembers = await tx
            .delete(clubMembers)
            .where(inArray(clubMembers.clubId, clubIds))
            .returning();
          console.log(`[DEBUG] Deleted ${deletedMembers.length} club_members`);

          // 4. Удалить reading_progress связанные с клубами
          const deletedClubProgress = await tx
            .delete(readingProgress)
            .where(inArray(readingProgress.clubId, clubIds))
            .returning();
          console.log(`[DEBUG] Deleted ${deletedClubProgress.length} reading_progress (club-related)`);

          // 5. Удалить reading_sessions связанные с клубами
          const deletedClubSessions = await tx
            .delete(readingSessions)
            .where(inArray(readingSessions.clubId, clubIds))
            .returning();
          console.log(`[DEBUG] Deleted ${deletedClubSessions.length} reading_sessions (club-related)`);
        }

        // 6. Удалить reading_progress напрямую связанные с книгой
        const deletedBookProgress = await tx
          .delete(readingProgress)
          .where(eq(readingProgress.bookId, id))
          .returning();
        console.log(`[DEBUG] Deleted ${deletedBookProgress.length} reading_progress (book-related)`);

        // 7. Удалить reading_sessions напрямую связанные с книгой
        const deletedBookSessions = await tx
          .delete(readingSessions)
          .where(eq(readingSessions.bookId, id))
          .returning();
        console.log(`[DEBUG] Deleted ${deletedBookSessions.length} reading_sessions (book-related)`);

        // 8. Удалить клубы
        if (clubIds.length > 0) {
          const deletedClubs = await tx
            .delete(clubs)
            .where(inArray(clubs.id, clubIds))
            .returning();
          console.log(`[DEBUG] Deleted ${deletedClubs.length} clubs`);
        }

        // 9. Наконец удалить книгу
        const deletedBooks = await tx
          .delete(books)
          .where(eq(books.id, id))
          .returning();
        console.log(`[DEBUG] Deleted book: ${id}`, deletedBooks[0]?.title);

        if (deletedBooks.length === 0) {
          throw new Error(`Book with id ${id} not found`);
        }

      } catch (error) {
        console.error(`[ERROR] Cascade delete failed for book ${id}:`, error);
        throw error;
      }
    });
  }

  // Book Content methods
  async getBookContent(bookId: string, chapterNumber?: number): Promise<BookContent[]> {
    if (chapterNumber !== undefined) {
      return await this.db
        .select()
        .from(bookContent)
        .where(and(
          eq(bookContent.bookId, bookId),
          eq(bookContent.chapterNumber, chapterNumber)
        ))
        .orderBy(asc(bookContent.chapterNumber));
    }

    return await this.db
      .select()
      .from(bookContent)
      .where(eq(bookContent.bookId, bookId))
      .orderBy(asc(bookContent.chapterNumber));
  }

  async getBookChapter(bookId: string, chapterNumber: number): Promise<BookContent | undefined> {
    const result = await this.db
      .select()
      .from(bookContent)
      .where(and(
        eq(bookContent.bookId, bookId),
        eq(bookContent.chapterNumber, chapterNumber)
      ))
      .limit(1);

    return result[0];
  }

  async createBookContent(contentData: InsertBookContent): Promise<BookContent> {
    const result = await this.db
      .insert(bookContent)
      .values(contentData)
      .returning();

    return result[0];
  }

  async updateBookContent(id: string, updates: Partial<InsertBookContent>): Promise<BookContent> {
    const result = await this.db
      .update(bookContent)
      .set(updates)
      .where(eq(bookContent.id, id))
      .returning();

    return result[0];
  }

  async deleteBookContent(id: string): Promise<void> {
    await this.db
      .delete(bookContent)
      .where(eq(bookContent.id, id));
  }

  // Reading Session methods
  async createReadingSession(sessionData: InsertReadingSession & { readerId: string }): Promise<ReadingSession> {
    const result = await this.db
      .insert(readingSessions)
      .values({
        clubId: sessionData.clubId,
        readerId: sessionData.readerId,
        bookId: sessionData.bookId,
        title: sessionData.title,
        currentChapter: sessionData.currentChapter,
        currentPosition: sessionData.currentPosition,
      })
      .returning();

    return result[0];
  }

  async getReadingSession(id: string): Promise<ReadingSessionWithDetails | undefined> {
    const result = await this.db
      .select({
        session: readingSessions,
        reader: {
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
        },
        book: books,
        club: clubs,
        listenerCount: count(sessionListeners.id),
      })
      .from(readingSessions)
      .leftJoin(users, eq(readingSessions.readerId, users.id))
      .leftJoin(books, eq(readingSessions.bookId, books.id))
      .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
      .leftJoin(sessionListeners, and(
        eq(sessionListeners.sessionId, readingSessions.id),
        eq(sessionListeners.isActive, true)
      ))
      .where(eq(readingSessions.id, id))
      .groupBy(readingSessions.id, users.id, books.id, clubs.id)
      .limit(1);

    if (result.length === 0) return undefined;

    const row = result[0];
    return {
      ...row.session,
      reader: row.reader!,
      book: row.book!,
      club: row.club!,
      listenerCount: Number(row.listenerCount),
    } as ReadingSessionWithDetails;
  }

  async getActiveSessionsInClub(clubId: string): Promise<ReadingSessionWithDetails[]> {
    const result = await this.db
      .select({
        session: readingSessions,
        reader: {
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
        },
        book: books,
        club: clubs,
        listenerCount: count(sessionListeners.id),
      })
      .from(readingSessions)
      .leftJoin(users, eq(readingSessions.readerId, users.id))
      .leftJoin(books, eq(readingSessions.bookId, books.id))
      .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
      .leftJoin(sessionListeners, and(
        eq(sessionListeners.sessionId, readingSessions.id),
        eq(sessionListeners.isActive, true)
      ))
      .where(and(
        eq(readingSessions.clubId, clubId),
        eq(readingSessions.isActive, true),
        eq(readingSessions.isLive, true)
      ))
      .groupBy(readingSessions.id, users.id, books.id, clubs.id)
      .orderBy(desc(readingSessions.startedAt));

    return result.map(row => ({
      ...row.session,
      reader: row.reader!,
      book: row.book!,
      club: row.club!,
      listenerCount: Number(row.listenerCount),
    })) as ReadingSessionWithDetails[];
  }

  async getSessionsByReader(readerId: string): Promise<ReadingSessionWithDetails[]> {
    const result = await this.db
      .select({
        session: readingSessions,
        reader: {
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
        },
        book: books,
        club: clubs,
        listenerCount: count(sessionListeners.id),
      })
      .from(readingSessions)
      .leftJoin(users, eq(readingSessions.readerId, users.id))
      .leftJoin(books, eq(readingSessions.bookId, books.id))
      .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
      .leftJoin(sessionListeners, and(
        eq(sessionListeners.sessionId, readingSessions.id),
        eq(sessionListeners.isActive, true)
      ))
      .where(eq(readingSessions.readerId, readerId))
      .groupBy(readingSessions.id, users.id, books.id, clubs.id)
      .orderBy(desc(readingSessions.startedAt));

    return result.map(row => ({
      ...row.session,
      reader: row.reader!,
      book: row.book!,
      club: row.club!,
      listenerCount: Number(row.listenerCount),
    })) as ReadingSessionWithDetails[];
  }

  async updateSessionPosition(sessionId: string, currentChapter: number, currentPosition: string): Promise<boolean> {
    const result = await this.db
      .update(readingSessions)
      .set({
        currentChapter,
        currentPosition
      })
      .where(eq(readingSessions.id, sessionId))
      .returning();

    return result.length > 0;
  }

  async startSession(sessionId: string): Promise<boolean> {
    const result = await this.db
      .update(readingSessions)
      .set({
        isLive: true,
        startedAt: new Date()
      })
      .where(eq(readingSessions.id, sessionId))
      .returning();

    return result.length > 0;
  }

  async endSession(sessionId: string): Promise<boolean> {
    const result = await this.db
      .update(readingSessions)
      .set({
        isLive: false,
        endedAt: new Date()
      })
      .where(eq(readingSessions.id, sessionId))
      .returning();

    return result.length > 0;
  }

  // Session Listeners methods
  async joinSession(sessionId: string, listenerId: string): Promise<SessionListener> {
    // First, set any existing session for this listener to inactive
    await this.db
      .update(sessionListeners)
      .set({
        isActive: false,
        leftAt: new Date()
      })
      .where(and(
        eq(sessionListeners.listenerId, listenerId),
        eq(sessionListeners.isActive, true)
      ));

    // Then create new session listener record
    const result = await this.db
      .insert(sessionListeners)
      .values({
        sessionId,
        listenerId,
      })
      .returning();

    return result[0];
  }

  async leaveSession(sessionId: string, listenerId: string): Promise<boolean> {
    const result = await this.db
      .update(sessionListeners)
      .set({
        isActive: false,
        leftAt: new Date()
      })
      .where(and(
        eq(sessionListeners.sessionId, sessionId),
        eq(sessionListeners.listenerId, listenerId),
        eq(sessionListeners.isActive, true)
      ))
      .returning();

    return result.length > 0;
  }

  async getSessionListeners(sessionId: string): Promise<User[]> {
    const result = await this.db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(sessionListeners)
      .innerJoin(users, eq(sessionListeners.listenerId, users.id))
      .where(and(
        eq(sessionListeners.sessionId, sessionId),
        eq(sessionListeners.isActive, true)
      ))
      .orderBy(asc(sessionListeners.joinedAt));

    return result as User[];
  }

  async getActiveListenersCount(sessionId: string): Promise<number> {
    const result = await this.db
      .select({ count: count(sessionListeners.id) })
      .from(sessionListeners)
      .where(and(
        eq(sessionListeners.sessionId, sessionId),
        eq(sessionListeners.isActive, true)
      ));

    return Number(result[0]?.count || 0);
  }

  // Reading Progress methods
  async updateReadingProgress(progressData: InsertReadingProgress & { userId: string }): Promise<ReadingProgress> {
    console.log('[Storage] updateReadingProgress вызван с данными:', progressData);
    
    try {
      // Check if progress already exists
      console.log('[Storage] Проверка существующей записи...');
      const existing = await this.db
        .select()
        .from(readingProgress)
        .where(and(
          eq(readingProgress.userId, progressData.userId),
          eq(readingProgress.bookId, progressData.bookId),
          progressData.clubId ? eq(readingProgress.clubId, progressData.clubId) : isNull(readingProgress.clubId)
        ))
        .limit(1);

      console.log('[Storage] Найдено существующих записей:', existing.length);

      if (existing.length > 0) {
        // Update existing progress
        console.log('[Storage] Обновление существующей записи:', existing[0].id);
        const result = await this.db
          .update(readingProgress)
          .set({
            currentChapter: progressData.currentChapter,
            currentPosition: progressData.currentPosition,
            progress: progressData.progress,
            lastReadAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(readingProgress.id, existing[0].id))
          .returning();

        console.log('[Storage] Запись обновлена успешно');
        return result[0];
      } else {
        // Create new progress
        console.log('[Storage] Создание новой записи');
        const result = await this.db
          .insert(readingProgress)
          .values({
            userId: progressData.userId,
            bookId: progressData.bookId,
            clubId: progressData.clubId,
            currentChapter: progressData.currentChapter,
            currentPosition: progressData.currentPosition,
            progress: progressData.progress,
          })
          .returning();

        console.log('[Storage] Запись создана успешно');
        return result[0];
      }
    } catch (error) {
      console.error('[Storage] ОШИБКА в updateReadingProgress:', error);
      console.error('[Storage] Stack trace:', error instanceof Error ? error.stack : 'Нет stack trace');
      throw error;
    }
  }

  async getUserReadingProgress(userId: string, bookId: string): Promise<ReadingProgress | undefined> {
    const result = await this.db
      .select()
      .from(readingProgress)
      .where(and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.bookId, bookId)
      ))
      .orderBy(desc(readingProgress.updatedAt))
      .limit(1);

    return result[0];
  }

  async getClubReadingProgress(clubId: string): Promise<ReadingProgress[]> {
    const result = await this.db
      .select()
      .from(readingProgress)
      .where(eq(readingProgress.clubId, clubId))
      .orderBy(desc(readingProgress.updatedAt));

    return result;
  }



  // Reading History methods
  async addCompletedToHistory(userId: string, bookId: string, bookTitle: string, bookAuthor: string, bookCoverUrl?: string): Promise<void> {
    // Проверяем, что книга еще не в истории (избегаем дубликатов)
    const existing = await this.db
      .select()
      .from(readingHistory)
      .where(and(
        eq(readingHistory.userId, userId),
        eq(readingHistory.bookId, bookId)
      ))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Storage] Книга ${bookId} уже в истории пользователя ${userId}`);
      return;
    }

    // Добавляем в историю
    await this.db.insert(readingHistory).values({
      userId,
      bookId,
      bookTitle,
      bookAuthor,
      bookCoverUrl
    });

    console.log(`[Storage] Книга ${bookTitle} добавлена в историю пользователя ${userId}`);
  }

  async getReadingHistory(userId: string): Promise<ReadingHistory[]> {
    return await this.db
      .select()
      .from(readingHistory)
      .where(eq(readingHistory.userId, userId))
      .orderBy(desc(readingHistory.completedAt))
      .limit(100); // Ограничим количество
  }

  async clearReadingHistory(userId: string): Promise<void> {
    await this.db
      .delete(readingHistory)
      .where(eq(readingHistory.userId, userId));
    
    console.log(`[Storage] История чтения пользователя ${userId} очищена`);
  }

  // Reader Ratings methods
  async rateReader(ratingData: InsertReaderRating & { raterId: string }): Promise<ReaderRating> {
    // Check if rating already exists from this user for this session
    const existing = await this.db
      .select()
      .from(readerRatings)
      .where(and(
        eq(readerRatings.sessionId, ratingData.sessionId),
        eq(readerRatings.raterId, ratingData.raterId)
      ))
      .limit(1);

    if (existing.length > 0) {
      // Update existing rating
      const result = await this.db
        .update(readerRatings)
        .set({
          rating: ratingData.rating,
          feedback: ratingData.feedback,
          createdAt: new Date()
        })
        .where(eq(readerRatings.id, existing[0].id))
        .returning();

      return result[0];
    } else {
      // Create new rating
      const result = await this.db
        .insert(readerRatings)
        .values({
          sessionId: ratingData.sessionId,
          readerId: ratingData.readerId,
          raterId: ratingData.raterId,
          rating: ratingData.rating,
          feedback: ratingData.feedback,
        })
        .returning();

      return result[0];
    }
  }

  async getReaderRatings(readerId: string): Promise<ReaderRating[]> {
    const result = await this.db
      .select()
      .from(readerRatings)
      .where(eq(readerRatings.readerId, readerId))
      .orderBy(desc(readerRatings.createdAt));

    return result;
  }

  async getReaderAverageRating(readerId: string): Promise<number> {
    const result = await this.db
      .select({
        avg: sql<number>`AVG(${readerRatings.rating})::numeric(3,2)`
      })
      .from(readerRatings)
      .where(eq(readerRatings.readerId, readerId));

    return Number(result[0]?.avg || 0);
  }

  // User Profile methods
  async createOrUpdateUserProfile(userId: string, profileData: InsertUserProfile): Promise<UserProfile> {
    // Check if profile already exists
    const existing = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing profile
      const result = await this.db
        .update(userProfiles)
        .set({
          displayName: profileData.displayName,
          avatar: profileData.avatar,
          coverImage: profileData.coverImage,
          bio: profileData.bio,
          favoriteGenres: profileData.favoriteGenres,
          isReader: profileData.isReader ?? false,
          updatedAt: new Date()
        })
        .where(eq(userProfiles.id, existing[0].id))
        .returning();

      if (!result || result.length === 0) {
        throw new Error("Failed to update profile");
      }
      return result[0];
    } else {
      // Create new profile
      const result = await this.db
        .insert(userProfiles)
        .values({
          userId,
          displayName: profileData.displayName,
          avatar: profileData.avatar,
          coverImage: profileData.coverImage,
          bio: profileData.bio,
          favoriteGenres: profileData.favoriteGenres,
          isReader: profileData.isReader ?? false,
        })
        .returning();

      if (!result || result.length === 0) {
        throw new Error("Failed to create profile");
      }
      return result[0];
    }
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const result = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    return result[0];
  }

  async deleteUserProfile(userId: string): Promise<boolean> {
    const result = await this.db
      .delete(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .returning();

    return result.length > 0;
  }

  async getTopReaders(limit: number = 10): Promise<UserProfile[]> {
    const result = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.isReader, true))
      .orderBy(desc(userProfiles.readerRating), desc(userProfiles.totalListeners))
      .limit(limit);

    return result;
  }

  // Refresh Token methods
  async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    const result = await this.db
      .insert(refreshTokens)
      .values({
        token,
        userId,
        expiresAt,
      })
      .returning();

    return result[0];
  }

  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.token, token),
        eq(refreshTokens.isRevoked, false)
      ))
      .limit(1);

    return result[0];
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    const result = await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.token, token))
      .returning();

    return result.length > 0;
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<boolean> {
    const result = await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId))
      .returning();

    return result.length > 0;
  }

  async cleanExpiredRefreshTokens(): Promise<void> {
    await this.db
      .delete(refreshTokens)
      .where(sql`${refreshTokens.expiresAt} < NOW()`);
  }

  // Admin Actions methods
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
          metadata: action.metadata ? JSON.stringify(action.metadata) : null,
          ipAddress: action.ipAddress,
          userAgent: action.userAgent,
        })
        .returning();

      console.log(`Admin action logged: ${action.actionType} on ${action.targetType}:${action.targetId} by ${action.adminId}`);
      return result[0];
    } catch (error) {
      console.error('Failed to log admin action:', error);
      throw new Error('Failed to log admin action');
    }
  }

  async getAdminActions(adminId?: string, limit: number = 50): Promise<AdminAction[]> {
    try {
      let query = this.db
        .select()
        .from(adminActions)
        .orderBy(desc(adminActions.createdAt));

      if (adminId) {
        // @ts-ignore - Drizzle dynamic query typing is tricky
        query = query.where(eq(adminActions.adminId, adminId));
      }

      return await query.limit(limit);
    } catch (error) {
      console.error('Failed to get admin actions:', error);
      throw new Error('Failed to get admin actions');
    }
  }

  // Book Status Management
  async updateBookStatus(bookId: string, status: 'draft' | 'published' | 'archived', adminId: string): Promise<boolean> {
    try {
      // Get current book status for logging
      const currentBook = await this.getBook(bookId);
      if (!currentBook) {
        throw new Error('Book not found');
      }

      const result = await this.db
        .update(books)
        .set({
          status: status as any,
          updatedAt: new Date()
        })
        .where(eq(books.id, bookId))
        .returning();

      // Log the admin action
      await this.logAdminAction({
        adminId,
        actionType: status === 'archived' ? 'archive_book' : 'update_book_status',
        targetType: 'book',
        targetId: bookId,
        previousValue: currentBook.status,
        newValue: status,
        metadata: { bookTitle: currentBook.title }
      });

      return result.length > 0;
    } catch (error) {
      console.error('Failed to update book status:', error);
      throw new Error('Failed to update book status');
    }
  }

  // Moderation Reports methods
  async getModerationReports(filters?: { status?: string; type?: string; assignedTo?: string }): Promise<ModerationReport[]> {
    try {
      let query = this.db
        .select()
        .from(moderationReports)
        .orderBy(desc(moderationReports.createdAt));

      const conditions = [];

      if (filters?.status) {
        conditions.push(eq(moderationReports.status, filters.status as any));
      }

      if (filters?.type) {
        conditions.push(eq(moderationReports.type, filters.type as any));
      }

      if (filters?.assignedTo) {
        conditions.push(eq(moderationReports.assignedTo, filters.assignedTo));
      }

      if (conditions.length > 0) {
        // @ts-ignore
        // Объяснение: Drizzle ORM иногда не может корректно вывести тип для
        // выражения and(...conditions), когда массив условий формируется динамически.
        // Здесь мы явно указываем, что условия валидны, а результирующий тип запроса
        // соответствует ожидаемому. В дальнейшем стоит заменить на явные типы
        // или использовать предопределённые предикаты для Drizzle.
        query = query.where(and(...conditions));
      }

      return await query;
    } catch (error) {
      console.error('Failed to get moderation reports:', error);
      throw new Error('Failed to get moderation reports');
    }
  }

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
      console.error('Failed to update moderation report:', error);
      throw new Error('Failed to update moderation report');
    }
  }

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
      console.error('Failed to create moderation report:', error);
      throw new Error('Failed to create moderation report');
    }
  }

  // System Settings methods
  async getSystemSettings(category?: string): Promise<SystemSetting[]> {
    try {
      if (category) {
        return this.db.select().from(systemSettings).where(eq(systemSettings.category, category));
      }
      return this.db.select().from(systemSettings);
    } catch (error) {
      console.error('Failed to get system settings:', error);
      throw new Error('Failed to get system settings');
    }
  }

  async updateSystemSetting(key: string, value: any, updatedBy: string): Promise<boolean> {
    try {
      // Get current setting to determine type
      const currentSetting = await this.getSystemSetting(key);
      if (!currentSetting) {
        throw new Error('System setting not found');
      }

      let serializedValue: string;
      switch (currentSetting.type) {
        case 'boolean':
          serializedValue = Boolean(value).toString();
          break;
        case 'number':
          serializedValue = Number(value).toString();
          break;
        case 'json':
          serializedValue = JSON.stringify(value);
          break;
        default:
          serializedValue = String(value);
      }

      const result = await this.db
        .update(systemSettings)
        .set({
          value: serializedValue,
          updatedBy,
          updatedAt: new Date()
        })
        .where(eq(systemSettings.key, key))
        .returning();

      // Log the admin action
      await this.logAdminAction({
        adminId: updatedBy,
        actionType: 'update_settings',
        targetType: 'system',
        targetId: key,
        previousValue: currentSetting.value,
        newValue: serializedValue,
        metadata: { settingKey: key, category: currentSetting.category }
      });

      return result.length > 0;
    } catch (error) {
      console.error('Failed to update system setting:', error);
      throw new Error('Failed to update system setting');
    }
  }

  async getSystemSetting(key: string): Promise<SystemSetting | null> {
    try {
      const result = await this.db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Failed to get system setting:', error);
      throw new Error('Failed to get system setting');
    }
  }

  // Personal Books methods
  async createPersonalBook(book: InsertPersonalBook & { userId: string }): Promise<PersonalBook> {
    try {
      const result = await this.db
        .insert(personalBooks)
        .values({
          userId: book.userId,
          title: book.title,
          author: book.author,
          description: book.description,
          publicationYear: book.publicationYear,
          genre: book.genre,
          language: book.language,
          format: book.format as BookFormat,
          fileHash: book.fileHash,
          fileSizeBytes: book.fileSizeBytes,
          storagePath: book.storagePath,
          encryptedContentKey: book.encryptedContentKey,
          coverUrl: book.coverUrl,
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error('Failed to create personal book:', error);
      throw new Error('Failed to create personal book');
    }
  }

  async updatePersonalBook(id: string, updates: Partial<InsertPersonalBook>): Promise<PersonalBook | undefined> {
    try {
      const result = await this.db
        .update(personalBooks)
        .set({
          ...(updates as any),
          updatedAt: new Date(),
        })
        .where(eq(personalBooks.id, id))
        .returning();

      return result[0];
    } catch (error) {
      console.error('Failed to update personal book:', error);
      throw new Error('Failed to update personal book');
    }
  }

  async getPersonalBook(id: string): Promise<PersonalBook | undefined> {
    try {
      const result = await this.db
        .select()
        .from(personalBooks)
        .where(eq(personalBooks.id, id))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error('Failed to get personal book:', error);
      throw new Error('Failed to get personal book');
    }
  }

  async getPersonalBooksByUser(userId: string): Promise<PersonalBook[]> {
    try {
      const result = await this.db
        .select()
        .from(personalBooks)
        .where(and(
          eq(personalBooks.userId, userId),
          eq(personalBooks.isDeleted, false)
        ))
        .orderBy(desc(personalBooks.createdAt));

      return result;
    } catch (error) {
      console.error('Failed to get personal books by user:', error);
      throw new Error('Failed to get personal books by user');
    }
  }

  async deletePersonalBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(personalBooks)
        .set({
          isDeleted: true,
          softDeletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(personalBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete personal book:', error);
      throw new Error('Failed to delete personal book');
    }
  }

  async restorePersonalBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(personalBooks)
        .set({
          isDeleted: false,
          softDeletedAt: null,
          updatedAt: new Date()
        })
        .where(eq(personalBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Failed to restore personal book:', error);
      throw new Error('Failed to restore personal book');
    }
  }

  async permanentDeletePersonalBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(personalBooks)
        .where(eq(personalBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Failed to permanently delete personal book:', error);
      throw new Error('Failed to permanently delete personal book');
    }
  }

  // Club Books methods
  async createClubBook(book: InsertClubBook & { uploadedByUserId: string }): Promise<ClubBook> {
    try {
      const result = await this.db
        .insert(clubBooks)
        .values({
          ...book,
          format: book.format as any,
          uploadedByUserId: book.uploadedByUserId,
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error('Failed to create club book:', error);
      throw new Error('Failed to create club book');
    }
  }

  async getClubBook(id: string): Promise<ClubBook | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubBooks)
        .where(eq(clubBooks.id, id))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error('Failed to get club book:', error);
      throw new Error('Failed to get club book');
    }
  }

  async getClubBooksByClub(clubId: string): Promise<ClubBook[]> {
    try {
      const result = await this.db
        .select()
        .from(clubBooks)
        .where(and(
          eq(clubBooks.clubId, clubId),
          eq(clubBooks.isDeleted, false)
        ))
        .orderBy(asc(clubBooks.recommendedReadingOrder), desc(clubBooks.createdAt));

      return result;
    } catch (error) {
      console.error('Failed to get club books by club:', error);
      throw new Error('Failed to get club books by club');
    }
  }

  async getAllClubBooks(): Promise<ClubBook[]> {
    try {
      const result = await this.db
        .select()
        .from(clubBooks)
        .orderBy(desc(clubBooks.createdAt));

      return result;
    } catch (error) {
      console.error('Failed to get all club books:', error);
      throw new Error('Failed to get all club books');
    }
  }

  async deleteClubBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubBooks)
        .set({
          isDeleted: true,
          softDeletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(clubBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete club book:', error);
      throw new Error('Failed to delete club book');
    }
  }

  async restoreClubBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubBooks)
        .set({
          isDeleted: false,
          softDeletedAt: null,
          updatedAt: new Date()
        })
        .where(eq(clubBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Failed to restore club book:', error);
      throw new Error('Failed to restore club book');
    }
  }

  async permanentDeleteClubBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(clubBooks)
        .where(eq(clubBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Failed to permanently delete club book:', error);
      throw new Error('Failed to permanently delete club book');
    }
  }

  async updateClubBook(id: string, updates: Partial<InsertClubBook>): Promise<ClubBook | undefined> {
    try {
      const result = await this.db
        .update(clubBooks)
        .set({
          ...updates,
          format: updates.format as "FB2" | "EPUB" | undefined,
          updatedAt: new Date()
        })
        .where(eq(clubBooks.id, id))
        .returning();

      return result[0];
    } catch (error) {
      console.error('Failed to update club book:', error);
      throw new Error('Failed to update club book');
    }
  }

  // Book Access Logs methods
  async logBookAccess(log: InsertBookAccessLog & { userId: string }): Promise<BookAccessLog> {
    try {
      const result = await this.db
        .insert(bookAccessLogs)
        .values({
          ...log,
          userId: log.userId,
          bookType: log.bookType as any,
          action: log.action as any,
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error('Failed to log book access:', error);
      throw new Error('Failed to log book access');
    }
  }

  async getBookAccessLogs(bookId: string): Promise<BookAccessLog[]> {
    try {
      const result = await this.db
        .select()
        .from(bookAccessLogs)
        .where(eq(bookAccessLogs.bookId, bookId))
        .orderBy(desc(bookAccessLogs.timestamp));

      return result;
    } catch (error) {
      console.error('Failed to get book access logs:', error);
      throw new Error('Failed to get book access logs');
    }
  }

  async getUserAccessLogs(userId: string): Promise<BookAccessLog[]> {
    try {
      const result = await this.db
        .select()
        .from(bookAccessLogs)
        .where(eq(bookAccessLogs.userId, userId))
        .orderBy(desc(bookAccessLogs.timestamp));

      return result;
    } catch (error) {
      console.error('Failed to get user access logs:', error);
      throw new Error('Failed to get user access logs');
    }
  }

  // Enhanced book methods for VoxLibris Upload
  async getBookByContentHash(contentHash: string): Promise<Book | undefined> {
    try {
      if (!contentHash) return undefined;

      const result = await this.db
        .select()
        .from(books)
        .where(eq(books.contentHash, contentHash))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error('Failed to get book by content hash:', error);
      throw new Error('Failed to get book by content hash');
    }
  }

  // Club Invitations methods
  async createClubInvitation(invitation: InsertClubInvitation): Promise<ClubInvitation> {
    try {
      const result = await this.db
        .insert(clubInvitations)
        .values(invitation)
        .returning();
      
      return result[0];
    } catch (error) {
      console.error('Failed to create club invitation:', error);
      throw new Error('Failed to create club invitation');
    }
  }

  async getClubInvitation(inviteToken: string): Promise<ClubInvitation | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubInvitations)
        .where(eq(clubInvitations.inviteToken, inviteToken))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('Failed to get club invitation:', error);
      throw new Error('Failed to get club invitation');
    }
  }

  async getClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    try {
      const result = await this.db
        .select()
        .from(clubInvitations)
        .where(eq(clubInvitations.clubId, clubId))
        .orderBy(desc(clubInvitations.createdAt));
      
      return result;
    } catch (error) {
      console.error('Failed to get club invitations:', error);
      throw new Error('Failed to get club invitations');
    }
  }

  async updateInvitationStatus(inviteToken: string, status: string, acceptedAt?: Date): Promise<boolean> {
    try {
      const updateData: any = { status };
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
      console.error('Failed to update invitation status:', error);
      throw new Error('Failed to update invitation status');
    }
  }

  async deleteClubInvitation(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(clubInvitations)
        .where(eq(clubInvitations.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete club invitation:', error);
      throw new Error('Failed to delete club invitation');
    }
  }

  async deleteClubInvitationsByEmail(clubId: string, email: string): Promise<number> {
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
      console.error('Failed to delete club invitations by email:', error);
      throw new Error('Failed to delete club invitations');
    }
  }

  // Settings methods (для SMTP и других настроек)
  async getSetting(key: string): Promise<Setting | undefined> {
    try {
      const result = await this.db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('Failed to get setting:', error);
      throw new Error('Failed to get setting');
    }
  }

  async getSettingsByCategory(category: string): Promise<Setting[]> {
    try {
      const result = await this.db
        .select()
        .from(settings)
        .where(eq(settings.category, category))
        .orderBy(asc(settings.key));
      
      return result;
    } catch (error) {
      console.error('Failed to get settings by category:', error);
      throw new Error('Failed to get settings by category');
    }
  }

  async setSetting(setting: InsertSetting & { updatedBy: string }): Promise<Setting> {
    try {
      // Проверяем существует ли настройка
      const existing = await this.getSetting(setting.key);
      
      if (existing) {
        // Обновляем существующую
        const result = await this.db
          .update(settings)
          .set({
            value: setting.value,
            description: setting.description,
            isEncrypted: setting.isEncrypted,
            updatedBy: setting.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(settings.key, setting.key))
          .returning();
        
        return result[0];
      } else {
        // Создаем новую
        const result = await this.db
          .insert(settings)
          .values({
            key: setting.key,
            value: setting.value,
            category: setting.category,
            description: setting.description,
            isEncrypted: setting.isEncrypted || false,
            updatedBy: setting.updatedBy,
          })
          .returning();
        
        return result[0];
      }
    } catch (error) {
      console.error('Failed to set setting:', error);
      throw new Error('Failed to set setting');
    }
  }

  async deleteSetting(key: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(settings)
        .where(eq(settings.key, key))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Failed to delete setting:', error);
      throw new Error('Failed to delete setting');
    }
  }
}

// Use PostgreSQL in production, MemStorage for fallback/testing
export const storage = process.env.NODE_ENV === 'test'
  ? new MemStorage()
  : new PostgreSQLStorage();
