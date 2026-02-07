import { UserRepository } from './UserRepository.js';
import { BookRepository } from './BookRepository.js';
import { ClubRepository } from './ClubRepository.js';
import { PersonalBooksRepository } from './PersonalBooksRepository.js';
import { ClubBooksRepository } from './ClubBooksRepository.js';
import { ReadingRepository } from './ReadingRepository.js';
import { ModerationRepository } from './ModerationRepository.js';
import { AnalyticsRepository } from './AnalyticsRepository.js';
import { SystemRepository } from './SystemRepository.js';

/**
 * Интерфейс для обратной совместимости со старым IStorage
 * Используется только для типизации StorageAdapter
 */
export interface IStorage {
  [key: string]: any;
}

/**
 * Главный композитный репозиторий - архитектурная замена монолитного storage.ts
 * 
 * АРХИТЕКТУРНОЕ РЕШЕНИЕ:
 * - Принцип единственной ответственности (SRP): каждый репозиторий отвечает за свой домен
 * - Композиция вместо наследования: объединяем функциональность через делегирование
 * - Инверсия зависимостей: высокоуровневые модули не зависят от низкоуровневых
 * - Интерфейс сегрегации: разделение больших интерфейсов на специализированные
 * 
 * ПРЕИМУЩЕСТВА:
 * - Устранение нарушения SRP (2760 строк -> модульная архитектура)
 * - Упрощение тестирования (изолированные домены)
 * - Повышение maintainability (изменения в одном домене не влияют на другие)
 * - Соблюдение SOLID принципов
 */
export class RepositoryContainer {
  private _users?: UserRepository;
  private _books?: BookRepository;
  private _clubs?: ClubRepository;
  private _personalBooks?: PersonalBooksRepository;
  private _clubBooks?: ClubBooksRepository;
  private _reading?: ReadingRepository;
  private _moderation?: ModerationRepository;
  private _analytics?: AnalyticsRepository;
  private _system?: SystemRepository;

  // Ленивая инициализация репозиториев
  get users(): UserRepository {
    this._users ??= new UserRepository();
    return this._users;
  }

  get books(): BookRepository {
    this._books ??= new BookRepository();
    return this._books;
  }

  get clubs(): ClubRepository {
    this._clubs ??= new ClubRepository();
    return this._clubs;
  }

  get personalBooks(): PersonalBooksRepository {
    this._personalBooks ??= new PersonalBooksRepository();
    return this._personalBooks;
  }

  get clubBooks(): ClubBooksRepository {
    this._clubBooks ??= new ClubBooksRepository();
    return this._clubBooks;
  }

  get reading(): ReadingRepository {
    this._reading ??= new ReadingRepository();
    return this._reading;
  }

  get moderation(): ModerationRepository {
    this._moderation ??= new ModerationRepository();
    return this._moderation;
  }

  get analytics(): AnalyticsRepository {
    this._analytics ??= new AnalyticsRepository();
    return this._analytics;
  }

  get system(): SystemRepository {
    this._system ??= new SystemRepository();
    return this._system;
  }
}

/**
 * Адаптер для обратной совместимости с существующим IStorage интерфейсом
 * Обеспечивает плавный переход от монолитной архитектуры к модульной
 */
class StorageAdapter implements Partial<IStorage> {
  private readonly repos: RepositoryContainer;

  constructor() {
    this.repos = new RepositoryContainer();
  }

  // =================================================================
  // User Domain Delegation - делегирование пользовательского домена
  // =================================================================
  
  async getUser(id: string) {
    return this.repos.users.getUser(id);
  }

  async getUserByUsername(username: string) {
    return this.repos.users.getUserByUsername(username);
  }

  async getUserByEmail(email: string) {
    return this.repos.users.getUserByEmail(email);
  }

  async createUser(user: any) {
    return this.repos.users.createUser(user);
  }

  async updateUserRole(username: string, role: any) {
    return this.repos.users.updateUserRole(username, role);
  }

  async updateUserStatus(username: string, status: any) {
    return this.repos.users.updateUserStatus(username, status);
  }

  async updateUserPassword(userId: string, passwordHash: string) {
    return this.repos.users.updateUserPassword(userId, passwordHash);
  }

  async updateUserLastActivity(userId: string) {
    return this.repos.users.updateUserLastActivity(userId);
  }

  async getUserByConfirmationToken(token: string) {
    return this.repos.users.getUserByConfirmationToken(token);
  }

  async updateUserEmailConfirmation(userId: string, confirmed: boolean) {
    return this.repos.users.updateUserEmailConfirmation(userId, confirmed);
  }

  async updateUserConfirmationToken(userId: string, token: string) {
    return this.repos.users.updateUserConfirmationToken(userId, token);
  }

  async createPasswordResetToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedByAdminId?: string;
    requestedFromIp?: string;
  }) {
    return this.repos.users.createPasswordResetToken(params);
  }

  async getPasswordResetTokenByHash(tokenHash: string) {
    return this.repos.users.getPasswordResetTokenByHash(tokenHash);
  }

  async markPasswordResetTokenUsed(tokenId: string) {
    return this.repos.users.markPasswordResetTokenUsed(tokenId);
  }

  async invalidatePasswordResetTokensForUser(userId: string) {
    return this.repos.users.invalidatePasswordResetTokensForUser(userId);
  }

  async cleanExpiredPasswordResetTokens() {
    return this.repos.users.cleanExpiredPasswordResetTokens();
  }

  async createRefreshToken(userId: string, token: string, expiresAt: Date) {
    return this.repos.users.createRefreshToken(userId, token, expiresAt);
  }

  async getRefreshToken(token: string) {
    return this.repos.users.getRefreshToken(token);
  }

  async revokeRefreshToken(token: string) {
    return this.repos.users.revokeRefreshToken(token);
  }

  async revokeAllUserRefreshTokens(userId: string) {
    return this.repos.users.revokeAllUserRefreshTokens(userId);
  }

  async cleanExpiredRefreshTokens() {
    return this.repos.users.cleanExpiredRefreshTokens();
  }

  // =================================================================
  // Book Domain Delegation - делегирование книжного домена
  // =================================================================

  async getBooks() {
    return this.repos.books.getBooks();
  }

  async getBook(id: string) {
    return this.repos.books.getBook(id);
  }

  async getBookByContentHash(contentHash: string) {
    return this.repos.books.getBookByContentHash(contentHash);
  }

  async getBooksByUser(userId: string) {
    return this.repos.books.getBooksByUser(userId);
  }

  async searchBooks(query: string) {
    return this.repos.books.searchBooks(query);
  }

  async createBook(book: any) {
    return this.repos.books.createBook(book);
  }

  async updateBook(id: string, updates: any) {
    const result = await this.repos.books.updateBook(id, updates);
    if (!result) {
      throw new Error(`Book with id ${id} not found`);
    }
    return result;
  }

  async deleteBook(id: string) {
    return this.repos.books.deleteBook(id);
  }

  async getBookContent(bookId: string, chapterNumber?: number) {
    return this.repos.books.getBookContent(bookId, chapterNumber);
  }

  async getBookChapter(bookId: string, chapterNumber: number) {
    return this.repos.books.getBookChapter(bookId, chapterNumber);
  }

  async createBookContent(content: any) {
    return this.repos.books.createBookContent(content);
  }

  async updateBookContent(id: string, updates: any) {
    const result = await this.repos.books.updateBookContent(id, updates);
    if (!result) {
      throw new Error(`BookContent with id ${id} not found`);
    }
    return result;
  }

  async deleteBookContent(id: string) {
    return this.repos.books.deleteBookContent(id);
  }

  // =================================================================
  // Club Domain Delegation - делегирование клубного домена
  // =================================================================

  async getClubs() {
    return this.repos.clubs.getClubs();
  }

  async getAllClubs() {
    return this.repos.clubs.getClubs(); // Alias для совместимости
  }

  async getClub(id: string) {
    return this.repos.clubs.getClub(id);
  }

  async getClubsByUser(userId: string) {
    return this.repos.clubs.getClubsByUser(userId);
  }

  async getClubsOwnedByUser(userId: string) {
    return this.repos.clubs.getClubsOwnedByUser(userId);
  }

  async createClub(club: any) {
    return this.repos.clubs.createClub(club);
  }

  async updateClub(id: string, updates: any) {
    return this.repos.clubs.updateClub(id, updates);
  }

  async deleteClub(id: string) {
    return this.repos.clubs.deleteClub(id);
  }

  async joinClub(clubId: string, userId: string, role?: any) {
    return this.repos.clubs.joinClub(clubId, userId, role);
  }

  async leaveClub(clubId: string, userId: string) {
    return this.repos.clubs.leaveClub(clubId, userId);
  }

  async getClubMembers(clubId: string) {
    return this.repos.clubs.getClubMembers(clubId);
  }

  async getClubMembersWithRoles(clubId: string) {
    return this.repos.clubs.getClubMembersWithRoles(clubId);
  }

  async getUserClubMembership(clubId: string, userId: string) {
    return this.repos.clubs.getUserClubMembership(clubId, userId);
  }

  async getActiveClubMembersCount(clubId: string, excludeUserId?: string) {
    return this.repos.clubs.getActiveClubMembersCount(clubId, excludeUserId);
  }

  async updateMemberRole(clubId: string, userId: string, role: any) {
    return this.repos.clubs.updateMemberRole(clubId, userId, role);
  }

  async removeMember(clubId: string, userId: string) {
    return this.repos.clubs.removeMember(clubId, userId);
  }

  async createClubInvitation(invitation: any) {
    return this.repos.clubs.createClubInvitation(invitation);
  }

  async getClubInvitation(inviteToken: string) {
    return this.repos.clubs.getClubInvitation(inviteToken);
  }

  async getClubInvitations(clubId: string) {
    return this.repos.clubs.getClubInvitations(clubId);
  }

  async updateInvitationStatus(inviteToken: string, status: string, acceptedAt?: Date) {
    return this.repos.clubs.updateInvitationStatus(inviteToken, status, acceptedAt);
  }

  async deleteClubInvitation(id: string) {
    return this.repos.clubs.deleteClubInvitation(id);
  }

  async deleteClubInvitationsByEmail(clubId: string, email: string) {
    return this.repos.clubs.deleteClubInvitationsByEmail(clubId, email);
  }

  // =================================================================
  // User Extended Methods - расширенное управление пользователями
  // =================================================================

  async deleteUser(userId: string) {
    return this.repos.users.deleteUser(userId);
  }

  async restoreUser(userId: string) {
    return this.repos.users.restoreUser(userId);
  }

  async permanentDeleteUser(userId: string) {
    return this.repos.users.permanentDeleteUser(userId);
  }

  async getAllUsers(includeDeleted?: boolean) {
    return this.repos.users.getAllUsers(includeDeleted);
  }

  async getDeletedUsers() {
    return this.repos.users.getDeletedUsers();
  }

  async getPendingUsers() {
    return this.repos.users.getPendingUsers();
  }

  // =================================================================
  // Personal Books Domain - личные книги пользователей
  // =================================================================

  async createPersonalBook(book: any) {
    return this.repos.personalBooks.createPersonalBook(book);
  }

  async getPersonalBook(id: string) {
    return this.repos.personalBooks.getPersonalBook(id);
  }

  async getPersonalBooksByUser(userId: string) {
    return this.repos.personalBooks.getPersonalBooksByUser(userId);
  }

  async updatePersonalBook(id: string, updates: any) {
    return this.repos.personalBooks.updatePersonalBook(id, updates);
  }

  async deletePersonalBook(id: string) {
    return this.repos.personalBooks.deletePersonalBook(id);
  }

  async restorePersonalBook(id: string) {
    return this.repos.personalBooks.restorePersonalBook(id);
  }

  async permanentDeletePersonalBook(id: string) {
    return this.repos.personalBooks.permanentDeletePersonalBook(id);
  }

  // =================================================================
  // Club Books Domain - книги клубов
  // =================================================================

  async createClubBook(book: any) {
    return this.repos.clubBooks.createClubBook(book);
  }

  async getClubBook(id: string) {
    return this.repos.clubBooks.getClubBook(id);
  }

  async getClubBooksByClub(clubId: string) {
    return this.repos.clubBooks.getClubBooksByClub(clubId);
  }

  async getAllClubBooks() {
    return this.repos.clubBooks.getAllClubBooks();
  }

  async updateClubBook(id: string, updates: any) {
    return this.repos.clubBooks.updateClubBook(id, updates);
  }

  async deleteClubBook(id: string) {
    return this.repos.clubBooks.deleteClubBook(id);
  }

  async restoreClubBook(id: string) {
    return this.repos.clubBooks.restoreClubBook(id);
  }

  async permanentDeleteClubBook(id: string) {
    return this.repos.clubBooks.permanentDeleteClubBook(id);
  }

  // =================================================================
  // Reading Domain - чтение и прогресс
  // =================================================================

  // Reading Sessions
  async createReadingSession(session: any) {
    return this.repos.reading.createReadingSession(session);
  }

  async getReadingSession(id: string) {
    return this.repos.reading.getReadingSession(id);
  }

  async getActiveSessionsInClub(clubId: string) {
    return this.repos.reading.getActiveSessionsInClub(clubId);
  }

  async getSessionsByReader(readerId: string) {
    return this.repos.reading.getSessionsByReader(readerId);
  }

  async updateSessionPosition(sessionId: string, currentChapter: number, currentPosition: string) {
    return this.repos.reading.updateSessionPosition(sessionId, currentChapter, currentPosition);
  }

  async startSession(sessionId: string) {
    return this.repos.reading.startSession(sessionId);
  }

  async endSession(sessionId: string) {
    return this.repos.reading.endSession(sessionId);
  }

  // Session Listeners
  async joinSession(sessionId: string, listenerId: string) {
    return this.repos.reading.joinSession(sessionId, listenerId);
  }

  async leaveSession(sessionId: string, listenerId: string) {
    return this.repos.reading.leaveSession(sessionId, listenerId);
  }

  async getSessionListeners(sessionId: string) {
    return this.repos.reading.getSessionListeners(sessionId);
  }

  async getActiveListenersCount(sessionId: string) {
    return this.repos.reading.getActiveListenersCount(sessionId);
  }

  // Reading Progress
  async updateReadingProgress(progress: any) {
    return this.repos.reading.updateReadingProgress(progress);
  }

  async getUserReadingProgress(userId: string, bookId: string) {
    return this.repos.reading.getUserReadingProgress(userId, bookId);
  }

  async getClubReadingProgress(clubId: string) {
    return this.repos.reading.getClubReadingProgress(clubId);
  }

  // Reading History
  async addCompletedToHistory(userId: string, bookId: string, bookTitle: string, bookAuthor: string, bookCoverUrl?: string) {
    return this.repos.reading.addCompletedToHistory(userId, bookId, bookTitle, bookAuthor, bookCoverUrl);
  }

  async getReadingHistory(userId: string) {
    return this.repos.reading.getReadingHistory(userId);
  }

  async clearReadingHistory(userId: string) {
    return this.repos.reading.clearReadingHistory(userId);
  }

  // Reader Ratings
  async rateReader(rating: any) {
    return this.repos.reading.rateReader(rating);
  }

  async getReaderRatings(readerId: string) {
    return this.repos.reading.getReaderRatings(readerId);
  }

  async getReaderAverageRating(readerId: string) {
    return this.repos.reading.getReaderAverageRating(readerId);
  }

  // User Profiles
  async createOrUpdateUserProfile(userId: string, profile: any) {
    return this.repos.reading.createOrUpdateUserProfile(userId, profile);
  }

  async getUserProfile(userId: string) {
    return this.repos.reading.getUserProfile(userId);
  }

  async deleteUserProfile(userId: string) {
    return this.repos.reading.deleteUserProfile(userId);
  }

  async getTopReaders(limit?: number) {
    return this.repos.reading.getTopReaders(limit);
  }

  // =================================================================
  // Moderation Domain - модерация
  // =================================================================

  async logAdminAction(action: any) {
    return this.repos.moderation.logAdminAction(action);
  }

  async getAdminActions(adminId?: string, limit?: number) {
    return this.repos.moderation.getAdminActions(adminId, limit);
  }

  async updateBookStatus(bookId: string, status: any, adminId: string) {
    return this.repos.moderation.updateBookStatus(bookId, status, adminId);
  }

  async getModerationReports(filters?: any) {
    return this.repos.moderation.getModerationReports(filters);
  }

  async updateModerationReport(reportId: string, updates: any) {
    return this.repos.moderation.updateModerationReport(reportId, updates);
  }

  async createModerationReport(report: any) {
    return this.repos.moderation.createModerationReport(report);
  }

  // =================================================================
  // Analytics Domain - аналитика
  // =================================================================

  async logBookAccess(log: any) {
    return this.repos.analytics.logBookAccess(log);
  }

  async getBookAccessLogs(bookId: string) {
    return this.repos.analytics.getBookAccessLogs(bookId);
  }

  async getUserAccessLogs(userId: string) {
    return this.repos.analytics.getUserAccessLogs(userId);
  }

  // =================================================================
  // System Settings Domain - системные настройки
  // =================================================================

  async getSystemSettings(category?: string) {
    return this.repos.system.getSystemSettings(category);
  }

  async getSystemSetting(key: string) {
    return this.repos.system.getSystemSetting(key);
  }

  async updateSystemSetting(key: string, value: any, updatedBy: string) {
    return this.repos.system.updateSystemSetting(key, value, updatedBy);
  }

  async getSetting(key: string) {
    return this.repos.system.getSetting(key);
  }

  async getSettingsByCategory(category: string) {
    return this.repos.system.getSettingsByCategory(category);
  }

  async setSetting(setting: any) {
    return this.repos.system.setSetting(setting);
  }

  async deleteSetting(key: string) {
    return this.repos.system.deleteSetting(key);
  }
}

// Создаем singleton instance для обратной совместимости
const storageAdapter = new StorageAdapter();

// Экспортируем адаптер как замену для старого storage
export const storage = storageAdapter;

// Экспортируем контейнер репозиториев для прямого доступа к доменам
export const repositories = new RepositoryContainer();

// Экспортируем отдельные репозитории для удобства
export { UserRepository } from './UserRepository.js';
export { BookRepository } from './BookRepository.js';
export { ClubRepository } from './ClubRepository.js';
export { PersonalBooksRepository } from './PersonalBooksRepository.js';
export { ClubBooksRepository } from './ClubBooksRepository.js';
export { ReadingRepository } from './ReadingRepository.js';
export { ModerationRepository } from './ModerationRepository.js';
export { AnalyticsRepository } from './AnalyticsRepository.js';
export { SystemRepository } from './SystemRepository.js';
