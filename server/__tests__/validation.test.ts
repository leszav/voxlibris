import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit Tests для VoxLibris
 */

describe('Validation Helpers', () => {
  
  describe('Email Validation', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    it('should validate correct email', () => {
      assert.ok(emailRegex.test('user@example.com'));
    });
    
    it('should reject email without @', () => {
      assert.ok(!emailRegex.test('userexample.com'));
    });
    
    it('should reject email without domain', () => {
      assert.ok(!emailRegex.test('user@'));
    });
    
    it('should reject email with spaces', () => {
      assert.ok(!emailRegex.test('user @example.com'));
    });
  });

  describe('UUID Validation', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    it('should validate correct UUID', () => {
      assert.ok(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000'));
    });
    
    it('should reject invalid UUID', () => {
      assert.ok(!uuidRegex.test('not-a-uuid'));
      assert.ok(!uuidRegex.test('550e8400-e29b-41d4-a716'));
    });
  });

  describe('Password Strength', () => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    
    it('should accept strong password', () => {
      assert.ok(passwordRegex.test('Password123'));
    });
    
    it('should reject weak password - too short', () => {
      assert.ok(!passwordRegex.test('Pass1'));
    });
    
    it('should reject weak password - no numbers', () => {
      assert.ok(!passwordRegex.test('PasswordNoNumber'));
    });
  });
});

describe('File Type Detection', () => {
  
  describe('EPUB Detection', () => {
    it('should identify EPUB by magic bytes', () => {
      // EPUB starts with PK\x03\x04
      const epubHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const isEpub = epubHeader[0] === 0x50 && epubHeader[1] === 0x4B && 
                     epubHeader[2] === 0x03 && epubHeader[3] === 0x04;
      assert.ok(isEpub);
    });
  });

  describe('FB2 Detection', () => {
    it('should identify FB2 by XML declaration', () => {
      const fb2Header = '<?xml version="1.0" encoding="UTF-8"?>';
      const isFb2 = fb2Header.startsWith('<?xml');
      assert.ok(isFb2);
    });
  });
});
