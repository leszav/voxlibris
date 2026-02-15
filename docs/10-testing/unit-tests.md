# Unit-тесты

## Обзор

Unit-тесты предназначены для проверки отдельных функций, классов и компонентов приложения VoxLibris. Они обеспечивают проверку корректности работы отдельных частей системы в изоляции от других компонентов.

## Структура файлов

Unit-тесты находятся рядом с тестируемым кодом и имеют суффикс `.test.ts`:

```
server/
├── services/
│   ├── user-service.ts
│   ├── user-service.test.ts
│   ├── club-service.ts
│   └── club-service.test.ts
├── utils/
│   ├── date-utils.ts
│   ├── date-utils.test.ts
│   ├── crypto-utils.ts
│   └── crypto-utils.test.ts
└── validators/
    ├── user-validator.ts
    └── user-validator.test.ts

client/
├── hooks/
│   ├── use-auth.ts
│   ├── use-auth.test.ts
│   ├── use-clubs.ts
│   └── use-clubs.test.ts
├── utils/
│   ├── formatters.ts
│   └── formatters.test.ts
└── lib/
    ├── api.ts
    └── api.test.ts
```

## Инструменты

### Node.js Built-in Test Runner

Для серверной части приложения используются встроенные средства тестирования Node.js:

```javascript
// server/utils/crypto-utils.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword } from './crypto-utils';

describe('Crypto Utils', () => {
  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'testPassword123';
      const hashed = await hashPassword(password);
      
      assert.strictEqual(typeof hashed, 'string');
      assert.notStrictEqual(hashed, password);
      assert.ok(hashed.length > 0);
    });

    it('should produce different hashes for same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hashed = await hashPassword(password);
      const isValid = await verifyPassword(password, hashed);
      
      assert.strictEqual(isValid, true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword';
      const hashed = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hashed);
      
      assert.strictEqual(isValid, false);
    });
  });
});
```

### Jest для клиентской части

Для клиентской части приложения используется Jest с React Testing Library:

```typescript
// client/src/hooks/use-auth.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './use-auth';
import { AuthProvider } from '../context/AuthContext';

// Mock для сервиса аутентификации
jest.mock('../../services/auth-service', () => ({
  authService: {
    login: jest.fn(),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

const { authService } = require('../../services/auth-service');

describe('useAuth', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should call authService.login with correct credentials', async () => {
      const credentials = { email: 'test@example.com', password: 'password123' };
      (authService.login as jest.MockedFunction<any>).mockResolvedValue({
        user: { id: 1, email: 'test@example.com', name: 'Test User' },
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh-token',
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      
      result.current.login(credentials);
      
      await waitFor(() => {
        expect(authService.login).toHaveBeenCalledWith(credentials);
      });
    });

    it('should update user state after successful login', async () => {
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test User' };
      (authService.login as jest.MockedFunction<any>).mockResolvedValue({
        user: mockUser,
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh-token',
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      
      result.current.login({ email: 'test@example.com', password: 'password123' });
      
      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });
    });
  });
});
```

## Принципы написания unit-тестов

### 1. Тестирование изолированных функций

Unit-тесты должны проверять только одну логическую единицу за раз:

```typescript
// server/utils/date-utils.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatDate, isPastDate } from './date-utils';

describe('Date Utils', () => {
  describe('formatDate', () => {
    it('should format date to DD/MM/YYYY', () => {
      const date = new Date('2023-05-15');
      const formatted = formatDate(date);
      
      assert.strictEqual(formatted, '15/05/2023');
    });

    it('should format date with leading zeros', () => {
      const date = new Date('2023-01-05');
      const formatted = formatDate(date);
      
      assert.strictEqual(formatted, '05/01/2023');
    });
  });

  describe('isPastDate', () => {
    it('should return true for past date', () => {
      const pastDate = new Date(Date.now() - 86400000); // yesterday
      const result = isPastDate(pastDate);
      
      assert.strictEqual(result, true);
    });

    it('should return false for future date', () => {
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      const result = isPastDate(futureDate);
      
      assert.strictEqual(result, false);
    });
  });
});
```

### 2. Тестирование граничных условий

Важно проверять граничные условия и крайние случаи:

```typescript
// server/validators/user-validator.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateEmail, validatePassword } from './user-validator';

describe('User Validator', () => {
  describe('validateEmail', () => {
    it('should return true for valid email', () => {
      const result = validateEmail('user@example.com');
      assert.strictEqual(result, true);
    });

    it('should return false for invalid email', () => {
      const result = validateEmail('invalid-email');
      assert.strictEqual(result, false);
    });

    it('should return false for empty string', () => {
      const result = validateEmail('');
      assert.strictEqual(result, false);
    });

    it('should return false for email without domain', () => {
      const result = validateEmail('user@');
      assert.strictEqual(result, false);
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid password', () => {
      const result = validatePassword('ValidPass123!');
      assert.strictEqual(result, true);
    });

    it('should return false for short password', () => {
      const result = validatePassword('short');
      assert.strictEqual(result, false);
    });

    it('should return false for password without uppercase', () => {
      const result = validatePassword('alllowercase123!');
      assert.strictEqual(result, false);
    });

    it('should return false for password without number', () => {
      const result = validatePassword('NoNumbers!');
      assert.strictEqual(result, false);
    });
  });
});
```

### 3. Использование моков и заглушек

При тестировании функций, которые зависят от внешних сервисов, используйте моки:

```typescript
// server/services/user-service.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { UserService } from './user-service';
import { UserRepository } from '../repositories/user-repository';

// Создаем mock для UserRepository
const mockUserRepository = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService(mockUserRepository as unknown as UserRepository);
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test User' };
      (mockUserRepository.findById as jest.MockedFunction<any>).mockResolvedValue(mockUser);

      const user = await userService.getUserById(1);

      expect(user).toEqual(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should return null when user not found', async () => {
      (mockUserRepository.findById as jest.MockedFunction<any>).mockResolvedValue(null);

      const user = await userService.getUserById(999);

      expect(user).toBeNull();
    });
  });
});
```

## Запуск unit-тестов

### Для серверной части

```bash
# Запуск всех unit-тестов
pnpm run test:server

# Запуск с покрытием кода
pnpm run test:server:coverage

# Запуск конкретного теста
node --test server/utils/date-utils.test.ts
```

### Для клиентской части

```bash
# Запуск всех unit-тестов
pnpm run test:client

# Запуск в watch-режиме
pnpm run test:client:watch
```

## Практики написания хороших unit-тестов

### 1. Используйте AAA-паттерн

AAA (Arrange, Act, Assert) - это паттерн для структурирования тестов:

```typescript
it('should calculate reading progress correctly', () => {
  // Arrange
  const totalTime = 100;
  const currentTime = 75;
  const expectedProgress = 0.75;

  // Act
  const actualProgress = calculateProgress(totalTime, currentTime);

  // Assert
  assert.strictEqual(actualProgress, expectedProgress);
});
```

### 2. Используйте понятные названия тестов

Названия тестов должны четко описывать, что именно тестируется и при каких условиях:

```typescript
// Хорошо
it('should return true when password contains at least 8 characters', () => { ... });

// Плохо
it('test password', () => { ... });
```

### 3. Тестируйте поведение, а не реализацию

Тесты должны проверять, что функция делает, а не как она это делает:

```typescript
// Хорошо - тестируем поведение
it('should hash password', async () => {
  const password = 'password123';
  const hashed = await hashPassword(password);
  
  assert.notStrictEqual(hashed, password);
  assert.ok(await verifyPassword(password, hashed));
});

// Плохо - тестируем реализацию
it('should use bcrypt to hash password', async () => {
  // Тестирование конкретной библиотеки, а не поведения
});
```

## Рекомендации

1. Покрывайте unit-тестами бизнес-логику и утилиты
2. Используйте моки для изоляции тестируемых компонентов
3. Следите за покрытием кода тестами (цель 80%+)
4. Используйте понятные имена тестов
5. Тестируйте граничные условия и ошибочные сценарии
6. Регулярно запускайте тесты перед коммитом
7. Обновляйте тесты при изменении логики
8. Используйте встроенные средства Node.js для серверных тестов
9. Используйте React Testing Library для тестирования компонентов
10. Поддерживайте тесты в актуальном состоянии