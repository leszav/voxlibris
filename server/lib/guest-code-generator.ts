import { db } from "../db.js";
import { guestAccounts } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

// Алфавит без похожих символов (O, 0, I, 1, L)
// 32 символа: 32^6 = 1,073,741,824 возможных комбинаций
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_RETRIES = 5;

// "Плохие" слова для фильтрации (можно расширить)
const BAD_WORDS = new Set([
  "FUCK", "SHIT", "DAMN", "ASS", "CUNT", "COOK", "COON",
  "FAGG", "FAG", "GAY", "JEW", "KIK", "KKK", "NAZI",
  "PISS", "POOP", "PUKE", "RAPE", "SUCK", "TITS", "WANK",
  "XXX", "ACAB", "HATE", "KYS", "MOLF", "NIGG", "SLOB",
]);

/**
 * Генерирует случайный код заданной длины
 */
function generateRandomCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Проверяет, содержит ли код "плохое" слово
 */
function containsBadWord(code: string): boolean {
  // Проверяем все подстроки длиной 4+
  for (let len = 4; len <= code.length; len++) {
    for (let i = 0; i <= code.length - len; i++) {
      const substring = code.substring(i, i + len);
      if (BAD_WORDS.has(substring)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Проверяет, существует ли код в базе данных
 */
async function codeExistsInDB(code: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: guestAccounts.id })
    .from(guestAccounts)
    .where(eq(guestAccounts.accessCode, code))
    .limit(1);

  return !!existing;
}

/**
 * Генерирует уникальный гостевой код
 * С гарантией уникальности в БД и без "плохих" слов
 */
export async function generateGuestCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateRandomCode(CODE_LENGTH);

    // Проверка на "плохие" слова
    if (containsBadWord(code)) {
      continue;
    }

    // Проверка уникальности в БД
    const exists = await codeExistsInDB(code);
    if (!exists) {
      return code;
    }

    logger.warn({ code, attempt }, "Code collision, retrying");
  }

  throw new Error("Failed to generate unique guest code after maximum retries");
}

/**
 * Валидирует гостевой код
 * Проверяет формат и наличие "плохих" слов
 */
export function validateGuestCodeFormat(code: string): { valid: boolean; error?: string } {
  if (!code) {
    return { valid: false, error: "Code is required" };
  }

  if (code.length !== CODE_LENGTH) {
    return { valid: false, error: `Code must be exactly ${CODE_LENGTH} characters` };
  }

  // Проверяем, что все символы из алфавита
  for (const char of code) {
    if (!ALPHABET.includes(char)) {
      return { valid: false, error: "Code contains invalid characters" };
    }
  }

  if (containsBadWord(code)) {
    return { valid: false, error: "Code contains inappropriate words" };
  }

  return { valid: true };
}

// Простой logger (без внешней зависимости)
const logger = {
  warn: (obj: Record<string, unknown>, msg: string) => {
    console.warn(`[guest-code-generator] ${msg}`, obj);
  },
};
