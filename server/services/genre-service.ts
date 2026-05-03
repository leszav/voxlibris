import { storage } from '../repositories/index.js';
import type { BookType, Genre, GenreSource } from '../../shared/schema.js';

export interface GenreSummary {
  id: string;
  code: string;
  label: string;
  groupKey: string | null;
  isPrimary: boolean;
}

export interface BookGenresPayload {
  primaryGenre: GenreSummary | null;
  genres: GenreSummary[];
}

export interface UploadGenrePresentation {
  genre: string;
  genres: string[];
}

const ALIAS_SEPARATOR_REGEX = /[;,|]/g;

function normalizeGenreToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ');
}

function parseAliases(aliasesJson: string | null): string[] {
  if (!aliasesJson) return [];

  try {
    const parsed = JSON.parse(aliasesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildGenreLookup(genres: Genre[]): Map<string, Genre> {
  const lookup = new Map<string, Genre>();

  for (const genre of genres) {
    lookup.set(normalizeGenreToken(genre.code), genre);
    lookup.set(normalizeGenreToken(genre.labelRu), genre);

    if (genre.labelEn) {
      lookup.set(normalizeGenreToken(genre.labelEn), genre);
    }

    for (const alias of parseAliases(genre.aliasesJson ?? null)) {
      lookup.set(normalizeGenreToken(alias), genre);
    }
  }

  return lookup;
}

function uniqueById(genres: Genre[]): Genre[] {
  const seen = new Set<string>();
  const result: Genre[] = [];

  for (const genre of genres) {
    if (seen.has(genre.id)) continue;
    seen.add(genre.id);
    result.push(genre);
  }

  return result;
}

class GenreService {
  async getActiveGenres(search?: string): Promise<GenreSummary[]> {
    const rows = await storage.getActiveGenres(search);
    return rows.map((genre) => ({
      id: genre.id,
      code: genre.code,
      label: genre.labelRu,
      groupKey: genre.groupKey ?? null,
      isPrimary: false,
    }));
  }

  async resolveGenresFromInput(input: string[]): Promise<Genre[]> {
    const tokens = input
      .flatMap((value) => value.split(ALIAS_SEPARATOR_REGEX))
      .map((value) => value.trim())
      .filter(Boolean);

    if (tokens.length === 0) return [];

    const allGenres = await storage.getActiveGenres();
    const lookup = buildGenreLookup(allGenres);
    const matched: Genre[] = [];

    for (const token of tokens) {
      const candidate = lookup.get(normalizeGenreToken(token));
      if (candidate) {
        matched.push(candidate);
      }
    }

    return uniqueById(matched);
  }

  async buildUploadGenrePresentation(input: string[]): Promise<UploadGenrePresentation | null> {
    const resolved = await this.resolveGenresFromInput(input);

    if (resolved.length === 0) {
      return null;
    }

    return {
      genre: resolved[0].labelRu,
      genres: resolved.map((item) => item.code),
    };
  }

  async persistBookGenres(
    bookType: BookType,
    bookId: string,
    genreCodesOrLabels: string[],
    source: GenreSource,
  ): Promise<{ primaryGenreId: string | null; legacyGenre: string | null }> {
    const resolved = await this.resolveGenresFromInput(genreCodesOrLabels);

    if (resolved.length === 0) {
      await storage.replaceBookGenres(bookType, bookId, []);
      return { primaryGenreId: null, legacyGenre: null };
    }

    const primary = resolved[0];

    await storage.replaceBookGenres(
      bookType,
      bookId,
      resolved.map((genre, index) => ({
        genreId: genre.id,
        source,
        isPrimary: index === 0,
        confidence: source === 'metadata' ? 90 : null,
      })),
    );

    return {
      primaryGenreId: primary.id,
      legacyGenre: primary.labelRu,
    };
  }

  async getBookGenresPayload(bookType: BookType, bookId: string): Promise<BookGenresPayload> {
    const rows = await storage.getBookGenres(bookType, bookId);

    const genres = rows.map((row) => ({
      id: row.id,
      code: row.code,
      label: row.labelRu,
      groupKey: row.groupKey ?? null,
      isPrimary: row.isPrimary,
    }));

    const primaryGenre = genres.find((genre) => genre.isPrimary) ?? genres[0] ?? null;

    return {
      primaryGenre,
      genres,
    };
  }
}

export const genreService = new GenreService();
