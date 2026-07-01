/**
 * Утилиты для валидации пароля
 * Используются в формах регистрации, сброса и смены пароля
 */

// Допустимые символы: A-Za-z0-9 и ASCII спецсимволы
export const PASSWORD_ALLOWED_CHARS_REGEX = /^[A-Za-z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]*$/;

export interface PasswordRequirements {
  length: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
  validChars: boolean;
  match?: boolean;
}

export type PasswordStrength = 'weak' | 'medium' | 'strong';

/**
 * Проверяет, содержит ли строка только допустимые символы для пароля
 */
export function isPasswordCharsValid(password: string): boolean {
  return PASSWORD_ALLOWED_CHARS_REGEX.test(password);
}

/**
 * Вычисляет требования к паролю
 */
export function calculatePasswordRequirements(
  password: string,
  confirmPassword?: string
): PasswordRequirements {
  return {
    length: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasDigit: /\d/.test(password),
    validChars: isPasswordCharsValid(password),
    match: confirmPassword !== undefined 
      ? password === confirmPassword && password.length > 0 
      : undefined,
  };
}

/**
 * Проверяет, является ли пароль валидным (все обязательные требования выполнены)
 */
export function isPasswordValid(requirements: PasswordRequirements): boolean {
  return (
    requirements.length &&
    requirements.hasLetter &&
    requirements.hasDigit &&
    requirements.validChars
  );
}

/**
 * Оценивает сложность пароля
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++; // mixed case
  if (/\d/.test(password)) score++; // digit
  if (/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(password)) score++; // special char
  
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}

/**
 * Возвращает локализованное название сложности пароля
 */
export function getPasswordStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case 'strong':
      return 'Надёжный';
    case 'medium':
      return 'Средний';
    case 'weak':
      return 'Слабый';
  }
}

/**
 * Возвращает CSS-класс цвета для индикации сложности
 */
export function getPasswordStrengthColorClass(strength: PasswordStrength): string {
  switch (strength) {
    case 'strong':
      return 'text-green-600';
    case 'medium':
      return 'text-yellow-600';
    case 'weak':
      return 'text-red-600';
  }
}
