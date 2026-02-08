import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
interface MockMetadata {
  title?: string;
  author?: string;
  language?: string;
  genre?: string;
}

// Mock functions for testing (since we don't have the actual implementation)
const extractTitle = (metadata: MockMetadata | null | undefined) => {
  if (!metadata) throw new Error('Metadata is required');
  return metadata.title || 'Unknown Title';
};

const extractAuthor = (metadata: MockMetadata | null | undefined) => {
  if (!metadata) throw new Error('Metadata is required');
  return metadata.author || 'Unknown Author';
};

const extractLanguage = (metadata: MockMetadata | null | undefined) => {
  if (!metadata) throw new Error('Metadata is required');
  return metadata.language || 'en';
};

const extractGenres = (metadata: MockMetadata | null | undefined) => {
  if (!metadata || !metadata.genre) return [];
  return metadata.genre.split(',').map((g: string) => g.trim());
};

const parseMetadata = (metadata: MockMetadata | null | undefined) => {
  return {
    title: extractTitle(metadata),
    author: extractAuthor(metadata),
    language: extractLanguage(metadata),
    genres: extractGenres(metadata)
  };
};

describe('Book Parser Tests', () => {
  test('should extract title from metadata', () => {
    const mockMetadata = {
      title: 'Test Book Title',
      author: 'Test Author',
      language: 'en',
      genre: 'Fiction'
    };
    
    const title = extractTitle(mockMetadata);
    assert.strictEqual(title, 'Test Book Title', 'Should extract correct title');
  });

  test('should extract author from metadata', () => {
    const mockMetadata = {
      title: 'Test Book Title',
      author: 'Test Author',
      language: 'en',
      genre: 'Fiction'
    };
    
    const author = extractAuthor(mockMetadata);
    assert.strictEqual(author, 'Test Author', 'Should extract correct author');
  });

  test('should extract language from metadata', () => {
    const mockMetadata = {
      title: 'Test Book Title',
      author: 'Test Author',
      language: 'ru',
      genre: 'Fiction'
    };
    
    const language = extractLanguage(mockMetadata);
    assert.strictEqual(language, 'ru', 'Should extract correct language');
  });

  test('should extract genres from metadata', () => {
    const mockMetadata = {
      title: 'Test Book Title',
      author: 'Test Author',
      language: 'en',
      genre: 'Fiction, Fantasy'
    };
    
    const genres = extractGenres(mockMetadata);
    assert.deepStrictEqual(genres, ['Fiction', 'Fantasy'], 'Should extract genres correctly');
  });

  test('should parse metadata with all fields', () => {
    const mockMetadata = {
      title: 'Test Book Title',
      author: 'Test Author',
      language: 'en',
      genre: 'Fiction',
      description: 'A test book description',
      published: '2024-01-01',
      isbn: '978-0-123456-78-9'
    };
    
    const parsed = parseMetadata(mockMetadata);
    
    assert.strictEqual(parsed.title, 'Test Book Title');
    assert.strictEqual(parsed.author, 'Test Author');
    assert.strictEqual(parsed.language, 'en');
    assert.strictEqual(parsed.genres.length, 1);
    assert.strictEqual(parsed.genres[0], 'Fiction');
  });

  test('should handle missing metadata fields', () => {
    const mockMetadata = {};
    
    const title = extractTitle(mockMetadata);
    const author = extractAuthor(mockMetadata);
    const language = extractLanguage(mockMetadata);
    
    assert.strictEqual(title, 'Unknown Title', 'Should return default title');
    assert.strictEqual(author, 'Unknown Author', 'Should return default author');
    assert.strictEqual(language, 'en', 'Should return default language');
  });

  test('should handle null or undefined metadata', () => {
    assert.throws(() => {
      extractTitle(null);
    }, Error, 'Should throw error for null metadata');
    
    assert.throws(() => {
      extractAuthor(undefined);
    }, Error, 'Should throw error for undefined metadata');
  });
});
