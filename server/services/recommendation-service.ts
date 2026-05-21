import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../db.js';
import { getRedisClient } from '../lib/redis.js';
import {
  clubBooks,
  clubs,
  clubMembers,
  directMessages,
  personalBooks,
  recommendationDismissals,
  recommendationPreferences,
  readingHistory,
  readingSessions,
  userFollows,
  userProfiles,
  users,
} from '../../shared/schema.js';

export interface RecommendedBookItem {
  id: string;
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  completedAt: string;
  source: 'activity' | 'community';
}

export interface RecommendedClubItem {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  isLive: boolean;
  status: string;
}

export interface RecommendedReaderItem {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  followersCount: number;
  readerRating: number;
}

export interface RecommendedLiveItem {
  sessionId: string;
  clubId: string;
  clubTitle: string;
  sessionTitle: string;
  readerId: string;
  readerName: string | null;
  readerAvatar: string | null;
  startedAt: string;
}

export interface RecommendationsOverview {
  booksSource: 'activity' | 'community' | 'mixed';
  books: RecommendedBookItem[];
  clubs: RecommendedClubItem[];
  readers: RecommendedReaderItem[];
  live: RecommendedLiveItem[];
}

export type RecommendationEntityType = 'book' | 'club' | 'reader' | 'live';
export type RecommendationBookSourcePreference = 'all' | 'activity' | 'community';

export interface RecommendationPreferences {
  excludedTypes: RecommendationEntityType[];
  booksSourcePreference: RecommendationBookSourcePreference;
}

interface RecommendationDismissInput {
  entityType: RecommendationEntityType;
  entityId: string;
  source?: 'activity' | 'community' | 'mixed' | null;
  reason?: string | null;
}

interface RecommendationState {
  preferences: RecommendationPreferences;
  dismissed: Record<RecommendationEntityType, Set<string>>;
}

interface UserRecommendationContext {
  favoriteGenres: string[];
  joinedClubIds: Set<string>;
  followersCount: number;
}

type ParsedBookRecommendation = {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
};

type RecommendationFrequency = {
  count: number;
  lastAt: Date;
  title: string;
  author: string;
  coverUrl: string | null;
};

type ResolvedBookMeta = {
  title: string;
  author: string;
  coverUrl: string | null;
  genre: string | null;
};

const RECOMMEND_PREFIX = '[RECOMMEND]';
const BOOK_SHARE_PREFIX = '[BOOK_SHARE]';

const TTL_5_MIN = 60 * 5;
const TTL_6_HOURS = 60 * 60 * 6;
const TTL_24_HOURS = 60 * 60 * 24;

const RECO_BOOKS_KEY = (userId: string) => `recommendations:${userId}:books:v2`;
const RECO_CLUBS_KEY = (userId: string) => `recommendations:${userId}:clubs:v1`;
const RECO_READERS_KEY = (userId: string) => `recommendations:${userId}:readers:v1`;
const RECO_LIVE_KEY = (userId: string) => `recommendations:${userId}:live:v1`;

function parseStringArrayJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

function normalizeExcludedTypes(values: string[]): RecommendationEntityType[] {
  const allowed = new Set<RecommendationEntityType>(['book', 'club', 'reader', 'live']);
  const normalized: RecommendationEntityType[] = [];

  for (const value of values) {
    if (allowed.has(value as RecommendationEntityType) && !normalized.includes(value as RecommendationEntityType)) {
      normalized.push(value as RecommendationEntityType);
    }
  }

  return normalized;
}

function normalizeBooksSourcePreference(value: unknown): RecommendationBookSourcePreference {
  if (value === 'activity' || value === 'community') {
    return value;
  }
  return 'all';
}

function isRecommendationEntityType(value: unknown): value is RecommendationEntityType {
  return value === 'book' || value === 'club' || value === 'reader' || value === 'live';
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е');
}

function parseRecommendedBookPayload(body: string): ParsedBookRecommendation | null {
  const payload = JSON.parse(body.slice(RECOMMEND_PREFIX.length)) as {
    type?: unknown;
    entityId?: unknown;
    title?: unknown;
    subtitle?: unknown;
    imageUrl?: unknown;
  };

  if (payload.type !== 'book') return null;
  if (typeof payload.entityId !== 'string' || typeof payload.title !== 'string') return null;

  const subtitle = typeof payload.subtitle === 'string' ? payload.subtitle : '';
  const author = subtitle.startsWith('Автор: ') ? subtitle.slice('Автор: '.length).trim() : subtitle.trim();

  return {
    bookId: payload.entityId,
    title: payload.title,
    author,
    coverUrl: typeof payload.imageUrl === 'string' ? payload.imageUrl : null,
  };
}

function parseLegacyBookSharePayload(body: string): ParsedBookRecommendation | null {
  const payload = JSON.parse(body.slice(BOOK_SHARE_PREFIX.length)) as {
    bookId?: unknown;
    title?: unknown;
    author?: unknown;
    coverUrl?: unknown;
  };

  if (typeof payload.bookId !== 'string' || typeof payload.title !== 'string') {
    return null;
  }

  return {
    bookId: payload.bookId,
    title: payload.title,
    author: typeof payload.author === 'string' ? payload.author : '',
    coverUrl: typeof payload.coverUrl === 'string' ? payload.coverUrl : null,
  };
}

function parseBookRecommendationBody(body: string): ParsedBookRecommendation | null {
  try {
    if (body.startsWith(RECOMMEND_PREFIX)) {
      return parseRecommendedBookPayload(body);
    }

    if (body.startsWith(BOOK_SHARE_PREFIX)) {
      return parseLegacyBookSharePayload(body);
    }

    return null;
  } catch {
    return null;
  }
}

function upsertFrequency(
  frequency: Map<string, RecommendationFrequency>,
  recommendation: ParsedBookRecommendation,
  createdAt: Date,
): void {
  const prev = frequency.get(recommendation.bookId);
  if (prev) {
    prev.count += 1;
    if (createdAt > prev.lastAt) {
      prev.lastAt = createdAt;
    }
    return;
  }

  frequency.set(recommendation.bookId, {
    count: 1,
    lastAt: createdAt,
    title: recommendation.title,
    author: recommendation.author,
    coverUrl: recommendation.coverUrl,
  });
}

function getBooksSource(books: RecommendedBookItem[]): 'activity' | 'community' | 'mixed' {
  if (books.length === 0) {
    return 'activity';
  }

  const hasCommunity = books.some((book) => book.source === 'community');
  const hasActivity = books.some((book) => book.source === 'activity');

  if (hasCommunity && hasActivity) {
    return 'mixed';
  }

  return hasCommunity ? 'community' : 'activity';
}

function buildCommunityRecommendedBooks(
  frequency: Map<string, RecommendationFrequency>,
  resolved: Map<string, ResolvedBookMeta>,
  favoriteGenres: string[],
  limit: number,
): RecommendedBookItem[] {
  const favoriteGenreSet = new Set(favoriteGenres.map(normalizeForMatch));

  const ranked = Array.from(frequency.entries())
    .map(([bookId, stats]) => {
      const normalizedGenre = normalizeForMatch(resolved.get(bookId)?.genre ?? '');
      const genreMatch =
        favoriteGenreSet.size === 0
          ? true
          : Array.from(favoriteGenreSet).some((genre) => normalizedGenre.includes(genre));

      const score =
        stats.count * 1000 +
        (genreMatch ? 500 : 0) +
        Math.floor(stats.lastAt.getTime() / 10_000_000);

      return {
        bookId,
        score,
        genreMatch,
        stats,
        resolved: resolved.get(bookId),
      };
    })
    .sort((a, b) => b.score - a.score);

  const items: RecommendedBookItem[] = [];
  for (const row of ranked) {
    if (favoriteGenreSet.size > 0 && !row.genreMatch && items.length < limit) {
      continue;
    }

    const meta = row.resolved;
    items.push({
      id: `community:${row.bookId}`,
      bookId: row.bookId,
      title: meta?.title ?? row.stats.title,
      author: meta?.author || row.stats.author || 'Неизвестный автор',
      coverUrl: meta?.coverUrl ?? row.stats.coverUrl,
      completedAt: row.stats.lastAt.toISOString(),
      source: 'community',
    });

    if (items.length >= limit) break;
  }

  return items;
}

function parseFavoriteGenres(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter((value) => value.length > 0);
    }
  } catch {
    // ignore malformed payload
  }

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

class RecommendationService {
  private async getCached<T>(key: string): Promise<T | null> {
    const redis = await getRedisClient();
    if (!redis) return null;

    const payload = await redis.get(key);
    if (!payload) return null;

    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  }

  private async setCached<T>(key: string, ttlSeconds: number, data: T): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.setEx(key, ttlSeconds, JSON.stringify(data));
  }

  private async getUserContext(userId: string): Promise<UserRecommendationContext> {
    const [profileRows, memberships] = await Promise.all([
      db
        .select({
          favoriteGenres: userProfiles.favoriteGenres,
          followersCount: userProfiles.followersCount,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1),
      db
        .select({ clubId: clubMembers.clubId })
        .from(clubMembers)
        .where(and(eq(clubMembers.userId, userId), eq(clubMembers.isActive, true))),
    ]);

    return {
      favoriteGenres: parseFavoriteGenres(profileRows[0]?.favoriteGenres ?? null),
      joinedClubIds: new Set(memberships.map((item) => item.clubId)),
      followersCount: profileRows[0]?.followersCount ?? 0,
    };
  }

  private async getRecommendationState(userId: string): Promise<RecommendationState> {
    const [preferencesRows, dismissedRows] = await Promise.all([
      db
        .select({
          excludedTypesJson: recommendationPreferences.excludedTypesJson,
          booksSourcePreference: recommendationPreferences.booksSourcePreference,
        })
        .from(recommendationPreferences)
        .where(eq(recommendationPreferences.userId, userId))
        .limit(1),
      db
        .select({
          entityType: recommendationDismissals.entityType,
          entityId: recommendationDismissals.entityId,
        })
        .from(recommendationDismissals)
        .where(eq(recommendationDismissals.userId, userId)),
    ]);

    const preferenceRow = preferencesRows[0];
    const excludedTypes = normalizeExcludedTypes(parseStringArrayJson(preferenceRow?.excludedTypesJson));
    const booksSourcePreference = normalizeBooksSourcePreference(preferenceRow?.booksSourcePreference);

    const dismissed: Record<RecommendationEntityType, Set<string>> = {
      book: new Set<string>(),
      club: new Set<string>(),
      reader: new Set<string>(),
      live: new Set<string>(),
    };

    for (const row of dismissedRows) {
      if (isRecommendationEntityType(row.entityType)) {
        dismissed[row.entityType].add(row.entityId);
      }
    }

    return {
      preferences: {
        excludedTypes,
        booksSourcePreference,
      },
      dismissed,
    };
  }

  private applyBooksVisibility(items: RecommendedBookItem[], state: RecommendationState): RecommendedBookItem[] {
    if (state.preferences.excludedTypes.includes('book')) {
      return [];
    }

    return items.filter((item) => {
      if (state.dismissed.book.has(item.bookId)) {
        return false;
      }

      if (state.preferences.booksSourcePreference === 'all') {
        return true;
      }

      return item.source === state.preferences.booksSourcePreference;
    });
  }

  private applyClubsVisibility(items: RecommendedClubItem[], state: RecommendationState): RecommendedClubItem[] {
    if (state.preferences.excludedTypes.includes('club')) {
      return [];
    }

    return items.filter((item) => !state.dismissed.club.has(item.id));
  }

  private applyReadersVisibility(items: RecommendedReaderItem[], state: RecommendationState): RecommendedReaderItem[] {
    if (state.preferences.excludedTypes.includes('reader')) {
      return [];
    }

    return items.filter((item) => !state.dismissed.reader.has(item.id));
  }

  private applyLiveVisibility(items: RecommendedLiveItem[], state: RecommendationState): RecommendedLiveItem[] {
    if (state.preferences.excludedTypes.includes('live')) {
      return [];
    }

    return items.filter((item) => !state.dismissed.live.has(item.sessionId));
  }

  async getPreferences(userId: string): Promise<RecommendationPreferences> {
    const state = await this.getRecommendationState(userId);
    return state.preferences;
  }

  async updatePreferences(
    userId: string,
    updates: Partial<RecommendationPreferences>,
  ): Promise<RecommendationPreferences> {
    const current = await this.getPreferences(userId);

    const excludedTypes = updates.excludedTypes
      ? normalizeExcludedTypes(updates.excludedTypes)
      : current.excludedTypes;

    const booksSourcePreference = updates.booksSourcePreference
      ? normalizeBooksSourcePreference(updates.booksSourcePreference)
      : current.booksSourcePreference;

    const next: RecommendationPreferences = {
      excludedTypes,
      booksSourcePreference,
    };

    await db
      .insert(recommendationPreferences)
      .values({
        userId,
        excludedTypesJson: JSON.stringify(next.excludedTypes),
        booksSourcePreference: next.booksSourcePreference,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: recommendationPreferences.userId,
        set: {
          excludedTypesJson: JSON.stringify(next.excludedTypes),
          booksSourcePreference: next.booksSourcePreference,
          updatedAt: new Date(),
        },
      });

    return next;
  }

  async dismiss(userId: string, payload: RecommendationDismissInput): Promise<void> {
    await db
      .insert(recommendationDismissals)
      .values({
        userId,
        entityType: payload.entityType,
        entityId: payload.entityId,
        source: payload.source ?? null,
        reason: payload.reason ?? null,
      })
      .onConflictDoNothing();
  }

  private async getCommunityBookRecommendations(
    userId: string,
    favoriteGenres: string[],
    ownBookIds: Set<string>,
    limit: number,
  ): Promise<RecommendedBookItem[]> {
    const messages = await db
      .select({
        body: directMessages.body,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .where(and(eq(directMessages.isDeleted, false), ne(directMessages.senderId, userId)))
      .orderBy(desc(directMessages.createdAt))
      .limit(1500);

    const frequency = new Map<string, RecommendationFrequency>();

    for (const message of messages) {
      const recommendation = parseBookRecommendationBody(message.body);
      if (!recommendation) continue;

      if (ownBookIds.has(recommendation.bookId)) continue;

      upsertFrequency(frequency, recommendation, message.createdAt);
    }

    if (frequency.size === 0) {
      return [];
    }

    const candidateIds = Array.from(frequency.keys()).slice(0, 400);
    const [personalRows, clubRows] = await Promise.all([
      db
        .select({
          id: personalBooks.id,
          title: personalBooks.title,
          author: personalBooks.author,
          coverUrl: personalBooks.coverUrl,
          genre: personalBooks.genre,
        })
        .from(personalBooks)
        .where(and(eq(personalBooks.isDeleted, false), inArray(personalBooks.id, candidateIds))),
      db
        .select({
          id: clubBooks.id,
          title: clubBooks.title,
          author: clubBooks.author,
          coverUrl: clubBooks.coverUrl,
          genre: clubBooks.genre,
        })
        .from(clubBooks)
        .where(and(eq(clubBooks.isDeleted, false), inArray(clubBooks.id, candidateIds))),
    ]);

    const resolved = new Map<string, ResolvedBookMeta>();
    for (const row of personalRows) {
      resolved.set(row.id, {
        title: row.title,
        author: row.author,
        coverUrl: row.coverUrl,
        genre: row.genre,
      });
    }
    for (const row of clubRows) {
      if (!resolved.has(row.id)) {
        resolved.set(row.id, {
          title: row.title,
          author: row.author,
          coverUrl: row.coverUrl,
          genre: row.genre,
        });
      }
    }

    return buildCommunityRecommendedBooks(frequency, resolved, favoriteGenres, limit);
  }

  async getBooks(userId: string, limit = 6): Promise<RecommendedBookItem[]> {
    const cached = await this.getCached<RecommendedBookItem[]>(RECO_BOOKS_KEY(userId));
    if (cached) {
      return cached.slice(0, limit).map((item) => ({ ...item, source: item.source ?? 'activity' }));
    }

    const userContext = await this.getUserContext(userId);

    const ownHistory = await db
      .select({ bookId: readingHistory.bookId })
      .from(readingHistory)
      .where(eq(readingHistory.userId, userId));

    const ownBookIds = new Set(ownHistory.map((row) => row.bookId));

    const isColdStart = ownBookIds.size === 0 && userContext.followersCount === 0;

    const uniqueBooks = new Map<string, RecommendedBookItem>();

    if (isColdStart) {
      const communityItems = await this.getCommunityBookRecommendations(
        userId,
        userContext.favoriteGenres,
        ownBookIds,
        limit,
      );
      for (const item of communityItems) {
        uniqueBooks.set(item.bookId, item);
        if (uniqueBooks.size >= limit) break;
      }
    }

    const recentOthers = await db
      .select({
        id: readingHistory.id,
        bookId: readingHistory.bookId,
        title: readingHistory.bookTitle,
        author: readingHistory.bookAuthor,
        coverUrl: readingHistory.bookCoverUrl,
        completedAt: readingHistory.completedAt,
      })
      .from(readingHistory)
      .where(ne(readingHistory.userId, userId))
      .orderBy(desc(readingHistory.completedAt))
      .limit(300);

    for (const row of recentOthers) {
      if (ownBookIds.has(row.bookId) || uniqueBooks.has(row.bookId)) continue;

      uniqueBooks.set(row.bookId, {
        id: row.id,
        bookId: row.bookId,
        title: row.title,
        author: row.author,
        coverUrl: row.coverUrl,
        completedAt: row.completedAt.toISOString(),
        source: 'activity',
      });

      if (uniqueBooks.size >= limit) break;
    }

    const items = Array.from(uniqueBooks.values());
    await this.setCached(RECO_BOOKS_KEY(userId), TTL_24_HOURS, items);

    return items;
  }

  async getClubs(userId: string, limit = 6): Promise<RecommendedClubItem[]> {
    const cached = await this.getCached<RecommendedClubItem[]>(RECO_CLUBS_KEY(userId));
    if (cached) return cached.slice(0, limit);

    const userContext = await this.getUserContext(userId);

    const rows = await db
      .select({
        id: clubs.id,
        title: clubs.title,
        description: clubs.description,
        coverImage: clubs.coverImage,
        isLive: clubs.isLive,
        status: clubs.status,
      })
      .from(clubs)
      .leftJoin(
        clubMembers,
        and(
          eq(clubMembers.clubId, clubs.id),
          eq(clubMembers.userId, userId),
          eq(clubMembers.isActive, true),
        ),
      )
      .where(
        and(
          eq(clubs.isActive, true),
          inArray(clubs.status, ['recruiting', 'active']),
          isNull(clubMembers.id),
        ),
      )
      .orderBy(desc(clubs.isLive), desc(clubs.popularityScore), desc(clubs.createdAt))
      .limit(80);

    const scored = rows
      .map((club) => {
        const haystack = `${club.title} ${club.description ?? ''}`.toLowerCase();
        const genreMatch = userContext.favoriteGenres.some((genre) => haystack.includes(genre));

        const score =
          (club.isLive ? 100 : 0) +
          (genreMatch ? 25 : 0) +
          (club.status === 'active' ? 10 : 0);

        return { club, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.club);

    await this.setCached(RECO_CLUBS_KEY(userId), TTL_6_HOURS, scored);

    return scored;
  }

  async getReaders(userId: string, limit = 6): Promise<RecommendedReaderItem[]> {
    const cached = await this.getCached<RecommendedReaderItem[]>(RECO_READERS_KEY(userId));
    if (cached) return cached.slice(0, limit);

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
        bio: userProfiles.bio,
        followersCount: userProfiles.followersCount,
        readerRating: userProfiles.readerRating,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(
        userFollows,
        and(
          eq(userFollows.followerId, userId),
          eq(userFollows.followingId, users.id),
        ),
      )
      .where(
        and(
          eq(users.status, 'active'),
          eq(userProfiles.isReader, true),
          ne(users.id, userId),
          isNull(userFollows.followingId),
        ),
      )
      .orderBy(desc(userProfiles.followersCount), desc(userProfiles.readerRating))
      .limit(limit);

    await this.setCached(RECO_READERS_KEY(userId), TTL_6_HOURS, rows);
    return rows;
  }

  async getLive(userId: string, limit = 6): Promise<RecommendedLiveItem[]> {
    const cached = await this.getCached<RecommendedLiveItem[]>(RECO_LIVE_KEY(userId));
    if (cached) return cached.slice(0, limit);

    const userContext = await this.getUserContext(userId);

    const rows = await db
      .select({
        sessionId: readingSessions.id,
        clubId: clubs.id,
        clubTitle: clubs.title,
        sessionTitle: readingSessions.title,
        readerId: users.id,
        readerName: userProfiles.displayName,
        readerAvatar: userProfiles.avatar,
        startedAt: readingSessions.startedAt,
      })
      .from(readingSessions)
      .innerJoin(clubs, eq(clubs.id, readingSessions.clubId))
      .innerJoin(users, eq(users.id, readingSessions.readerId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(
        and(
          eq(readingSessions.isActive, true),
          eq(readingSessions.isLive, true),
          isNull(readingSessions.endedAt),
          eq(clubs.isActive, true),
        ),
      )
      .orderBy(desc(readingSessions.startedAt))
      .limit(40);

    const scored = rows
      .map((live) => {
        const inMemberClub = userContext.joinedClubIds.has(live.clubId);
        const score = inMemberClub ? 100 : 0;
        return {
          ...live,
          startedAt: live.startedAt.toISOString(),
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...live }) => live);

    await this.setCached(RECO_LIVE_KEY(userId), TTL_5_MIN, scored);
    return scored;
  }

  async getOverview(userId: string): Promise<RecommendationsOverview> {
    const state = await this.getRecommendationState(userId);

    const [books, clubsResult, readers, live] = await Promise.all([
      this.getBooks(userId, 6),
      this.getClubs(userId, 6),
      this.getReaders(userId, 6),
      this.getLive(userId, 6),
    ]);

    const visibleBooks = this.applyBooksVisibility(books, state);
    const visibleClubs = this.applyClubsVisibility(clubsResult, state);
    const visibleReaders = this.applyReadersVisibility(readers, state);
    const visibleLive = this.applyLiveVisibility(live, state);

    return {
      booksSource: getBooksSource(visibleBooks),
      books: visibleBooks,
      clubs: visibleClubs,
      readers: visibleReaders,
      live: visibleLive,
    };
  }

  async getBooksForUser(userId: string, limit = 12): Promise<RecommendedBookItem[]> {
    const state = await this.getRecommendationState(userId);
    const books = await this.getBooks(userId, limit);
    return this.applyBooksVisibility(books, state);
  }

  async getClubsForUser(userId: string, limit = 12): Promise<RecommendedClubItem[]> {
    const state = await this.getRecommendationState(userId);
    const clubsResult = await this.getClubs(userId, limit);
    return this.applyClubsVisibility(clubsResult, state);
  }

  async getReadersForUser(userId: string, limit = 12): Promise<RecommendedReaderItem[]> {
    const state = await this.getRecommendationState(userId);
    const readers = await this.getReaders(userId, limit);
    return this.applyReadersVisibility(readers, state);
  }

  async getLiveForUser(userId: string, limit = 12): Promise<RecommendedLiveItem[]> {
    const state = await this.getRecommendationState(userId);
    const live = await this.getLive(userId, limit);
    return this.applyLiveVisibility(live, state);
  }

  async getLivePublic(limit = 12): Promise<RecommendedLiveItem[]> {
    const rows = await db
      .select({
        sessionId: readingSessions.id,
        clubId: clubs.id,
        clubTitle: clubs.title,
        sessionTitle: readingSessions.title,
        readerId: users.id,
        readerName: userProfiles.displayName,
        readerAvatar: userProfiles.avatar,
        startedAt: readingSessions.startedAt,
      })
      .from(readingSessions)
      .innerJoin(clubs, eq(clubs.id, readingSessions.clubId))
      .innerJoin(users, eq(users.id, readingSessions.readerId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(
        and(
          eq(readingSessions.isActive, true),
          eq(readingSessions.isLive, true),
          isNull(readingSessions.endedAt),
          eq(clubs.isActive, true),
        ),
      )
      .orderBy(desc(readingSessions.startedAt))
      .limit(limit);

    return rows.map((item) => ({ ...item, startedAt: item.startedAt.toISOString() }));
  }
}

export const recommendationService = new RecommendationService();
