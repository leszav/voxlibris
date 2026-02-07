import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Ленивая инициализация Master Key
let _masterKey: Buffer | undefined;
let _verified = false;

function getMasterKey(): Buffer {
  if (!_masterKey) {
    const key = process.env.MASTER_KEY;
    if (!key) {
      throw new Error('CRITICAL: MASTER_KEY environment variable is required for production. Generate with: openssl rand -hex 32');
    }
    if (key.length !== 64) {
      throw new Error('CRITICAL: MASTER_KEY must be exactly 64 hex characters (32 bytes)');
    }
    _masterKey = Buffer.from(key, 'hex');
    
    if (_masterKey.length !== 32) {
      throw new Error('CRITICAL: Invalid MASTER_KEY length. Must be 32 bytes.');
    }
    
    // Верификация ключа при первом использовании
    if (!_verified) {
      const test = 'encryption-test';
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, _masterKey, iv);
      const encrypted = Buffer.concat([cipher.update(test, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedBase64 = Buffer.concat([iv, authTag, encrypted]).toString('base64');
      
      const buffer = Buffer.from(encryptedBase64, 'base64');
      const decIv = buffer.subarray(0, IV_LENGTH);
      const decAuthTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const decEncrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
      const decipher = crypto.createDecipheriv(ALGORITHM, _masterKey, decIv);
      decipher.setAuthTag(decAuthTag);
      const decrypted = Buffer.concat([decipher.update(decEncrypted), decipher.final()]).toString('utf8');
      
      if (decrypted !== test) {
        throw new Error('CRITICAL: MASTER_KEY verification failed');
      }
      _verified = true;
    }
  }
  return _masterKey;
}

export class CryptoService {
    /**
     * Generates a random 256-bit key
     */
    static generateKey(): Buffer {
        return crypto.randomBytes(32); // 256 bits
    }

    /**
     * Encrypts a file buffer using AES-256-GCM
     * Returns format: IV (12) + AuthTag (16) + EncryptedData
     */
    static encryptFile(buffer: Buffer, key: Buffer): Buffer {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Return format: IV + AuthTag + EncryptedData
        return Buffer.concat([iv, authTag, encrypted]);
    }

    /**
     * Decrypts a file buffer using AES-256-GCM
     * Expects format: IV (12) + AuthTag (16) + EncryptedData
     */
    static decryptFile(buffer: Buffer, key: Buffer): Buffer {
        const iv = buffer.subarray(0, IV_LENGTH);
        const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    /**
     * Encrypts the Content Encryption Key (CEK) with the Master Key
     * Returns Base64 string of: IV (12) + AuthTag (16) + EncryptedKey
     */
    static encryptKey(keyToEncrypt: Buffer): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);

        const encrypted = Buffer.concat([cipher.update(keyToEncrypt), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    }

    /**
     * Decrypts the Content Encryption Key (CEK) using the Master Key
     */
    static decryptKey(encryptedKeyBase64: string): Buffer {
        const buffer = Buffer.from(encryptedKeyBase64, 'base64');
        const iv = buffer.subarray(0, IV_LENGTH);
        const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}
