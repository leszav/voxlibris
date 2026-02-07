import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const MASTER_KEY = (() => {
  const key = process.env.CONTENT_ENCRYPTION_KEY || process.env.MASTER_KEY;
  if (!key) {
    throw new Error('CRITICAL: CONTENT_ENCRYPTION_KEY (or MASTER_KEY) environment variable is required. Generate with: openssl rand -hex 32');
  }
  if (key.length !== 64) {
    throw new Error('CRITICAL: CONTENT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return key;
})();

// Генерация ключа контента для книги
export function generateContentKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Шифрование контента книги
export function encryptContent(content: string, contentKey: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(contentKey, "hex"),
    iv
  );

  let encrypted = cipher.update(content, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

// Расшифровка контента книги
export function decryptContent(
  encrypted: string,
  contentKey: string,
  iv: string,
  authTag: string
): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(contentKey, "hex"),
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Шифрование ключа контента master-ключом для хранения в БД
export function encryptContentKey(contentKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(MASTER_KEY, "hex"),
    iv
  );

  let encrypted = cipher.update(contentKey, "hex", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Формат: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

// Расшифровка ключа контента
export function decryptContentKey(encryptedKey: string): string {
  const parts = encryptedKey.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format");
  }

  const [ivHex, authTagHex, encrypted] = parts;

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(MASTER_KEY, "hex"),
    Buffer.from(ivHex, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "hex");
  decrypted += decipher.final("hex");

  return decrypted;
}

// Генерация краткоживущего токена доступа к контенту (JWT-based)
import jwt from "jsonwebtoken";

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('CRITICAL: JWT_SECRET environment variable is required for production');
  }
  return secret;
})();

export interface ContentAccessToken {
  userId: string;
  bookId: string;
  chapterId?: string;
  exp: number; // Expiration timestamp
}

export function generateShortLivedToken(
  userId: string,
  bookId: string,
  chapterId?: string,
  expiresInMinutes: number = 15
): string {
  const payload: ContentAccessToken = {
    userId,
    bookId,
    chapterId,
    exp: Math.floor(Date.now() / 1000) + expiresInMinutes * 60,
  };

  return jwt.sign(payload, JWT_SECRET);
}

export function verifyContentToken(token: string): ContentAccessToken {
  return jwt.verify(token, JWT_SECRET) as ContentAccessToken;
}
