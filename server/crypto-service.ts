import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Master key from environment variable (REQUIRED for production)
const MASTER_KEY_HEX = (() => {
  const key = process.env.MASTER_KEY;
  if (!key) {
    throw new Error('CRITICAL: MASTER_KEY environment variable is required for production. Generate with: openssl rand -hex 32');
  }
  if (key.length !== 64) {
    throw new Error('CRITICAL: MASTER_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return key;
})();

const MASTER_KEY = Buffer.from(MASTER_KEY_HEX, 'hex');

// Добавить валидацию при старте
if (MASTER_KEY.length !== 32) {
    throw new Error('CRITICAL: Invalid MASTER_KEY length. Must be 32 bytes.');
}

// Добавить верификацию ключа
function verifyMasterKey(): boolean {
  const test = 'encryption-test';
  const encrypted = encryptWithMasterKey(test);
  const decrypted = decryptWithMasterKey(encrypted);
  return decrypted === test;
}

function encryptWithMasterKey(data: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptWithMasterKey(encryptedBase64: string): string {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

if (!verifyMasterKey()) {
    throw new Error('CRITICAL: MASTER_KEY verification failed');
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
        const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

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

        const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}
