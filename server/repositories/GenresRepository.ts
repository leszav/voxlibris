import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository.js';
import {
  bookGenres,
  genres,
  type BookType,
  type Genre,
  type GenreSource,
  type InsertGenre,
} from '../../shared/schema.js';

export interface GenreWithFlags extends Genre {
  isPrimary: boolean;
}

export class GenresRepository extends BaseRepository {
  async getGenresAdmin(search?: string): Promise<Genre[]> {
    const normalizedSearch = search?.trim();

    const whereClause = normalizedSearch
      ? sql`(
          ${genres.code} ILIKE ${`%${normalizedSearch}%`}
          OR ${genres.labelRu} ILIKE ${`%${normalizedSearch}%`}
          OR COALESCE(${genres.labelEn}, '') ILIKE ${`%${normalizedSearch}%`}
        )`
      : undefined;

    const query = this.db
      .select()
      .from(genres)
      .orderBy(asc(genres.sortOrder), asc(genres.labelRu));

    return whereClause ? query.where(whereClause) : query;
  }

  async getActiveGenres(search?: string): Promise<Genre[]> {
    const normalizedSearch = search?.trim();

    const whereClause = normalizedSearch
      ? and(eq(genres.isActive, true), ilike(genres.labelRu, `%${normalizedSearch}%`))
      : eq(genres.isActive, true);

    return this.db
      .select()
      .from(genres)
      .where(whereClause)
      .orderBy(asc(genres.sortOrder), asc(genres.labelRu));
  }

  async getGenreByCode(code: string): Promise<Genre | undefined> {
    const result = await this.db
      .select()
      .from(genres)
      .where(eq(genres.code, code))
      .limit(1);

    return result[0];
  }

  async getGenresByCodes(codes: string[]): Promise<Genre[]> {
    const normalizedCodes = Array.from(new Set(codes.map((value) => value.trim()).filter(Boolean)));
    if (normalizedCodes.length === 0) return [];

    return this.db
      .select()
      .from(genres)
      .where(inArray(genres.code, normalizedCodes));
  }

  async createGenre(payload: InsertGenre): Promise<Genre> {
    const result = await this.db
      .insert(genres)
      .values(payload)
      .onConflictDoUpdate({
        target: genres.code,
        set: {
          labelRu: payload.labelRu,
          labelEn: payload.labelEn ?? null,
          groupKey: payload.groupKey ?? null,
          description: payload.description ?? null,
          aliasesJson: payload.aliasesJson ?? null,
          sortOrder: payload.sortOrder ?? 0,
          isActive: payload.isActive ?? true,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return result[0];
  }

  async updateGenre(code: string, payload: Partial<InsertGenre>): Promise<Genre | undefined> {
    const result = await this.db
      .update(genres)
      .set({
        ...(payload.labelRu !== undefined ? { labelRu: payload.labelRu } : {}),
        ...(payload.labelEn !== undefined ? { labelEn: payload.labelEn ?? null } : {}),
        ...(payload.groupKey !== undefined ? { groupKey: payload.groupKey ?? null } : {}),
        ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
        ...(payload.aliasesJson !== undefined ? { aliasesJson: payload.aliasesJson ?? null } : {}),
        ...(payload.sortOrder !== undefined ? { sortOrder: payload.sortOrder } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(genres.code, code))
      .returning();

    return result[0];
  }

  async getBookGenres(bookType: BookType, bookId: string): Promise<GenreWithFlags[]> {
    const rows = await this.db
      .select({
        genre: genres,
        isPrimary: bookGenres.isPrimary,
      })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(and(eq(bookGenres.bookType, bookType), eq(bookGenres.bookId, bookId)))
      .orderBy(asc(bookGenres.isPrimary), asc(genres.sortOrder), asc(genres.labelRu));

    return rows
      .map((row) => ({ ...row.genre, isPrimary: row.isPrimary }))
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
  }

  async replaceBookGenres(
    bookType: BookType,
    bookId: string,
    items: Array<{ genreId: string; source: GenreSource; isPrimary: boolean; confidence?: number | null }>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(bookGenres)
        .where(and(eq(bookGenres.bookType, bookType), eq(bookGenres.bookId, bookId)));

      if (items.length === 0) return;

      for (const item of items) {
        await tx.insert(bookGenres).values({
          bookType,
          bookId,
          genreId: item.genreId,
          source: item.source,
          isPrimary: item.isPrimary,
          confidence: item.confidence ?? null,
        });
      }
    });
  }
}
