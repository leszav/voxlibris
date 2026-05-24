# Тестирование

В этом разделе описаны подходы к тестированию, инструменты и лучшие практики в проекте VoxLibris.

## Обзор

Проект использует комплексный подход к тестированию, включающий unit тесты, интеграционные тесты и end-to-end тестирование.

### Стратегия тестирования

1. **Unit тесты** - тестирование отдельных функций и компонентов
2. **Интеграционные тесты** - тестирование взаимодействия между модулями
3. **API тесты** - тестирование REST эндпоинтов
4. **E2E тесты** - тестирование пользовательских сценариев
5. **Нагрузочное тестирование** - проверка производительности

## Инструменты

### Основной стек
- **Vitest** - основной тестовый framework
- **React Testing Library** - тестирование React компонентов
- **Supertest** - тестирование API эндпоинтов
- **Playwright** - E2E тестирование
- **MSW** - мокирование API запросов

### Дополнительные инструменты
- **@testing-library/jest-dom** - дополнительные матчера для DOM
- **vi** - встроенный мокинг библиотека Vitest
- **testcontainers-node** - тестирование с реальными базами данных

## Структура тестов

```
├── client/src/
│   ├── components/
│   │   └── __tests__/          # Тесты компонентов
│   ├── pages/
│   │   └── __tests__/          # Тесты страниц
│   └── lib/
│       └── __tests__/          # Тесты утилит
├── server/
│   ├── __tests__/              # Тесты сервера
│   ├── routes/
│   │   └── __tests__/          # Тесты роутов
│   ├── services/
│   │   └── __tests__/          # Тесты сервисов
│   └── repositories/
│       └── __tests__/          # Тесты репозиториев
└── e2e/                        # E2E тесты
```

## Запуск тестов

### Основные команды

```bash
# Запуск всех тестов
pnpm test

# Запуск с покрытием
pnpm test:coverage

# Запуск в watch режиме
pnpm test:watch

# Запуск только unit тестов
pnpm test:unit

# Запуск только интеграционных тестов
pnpm test:integration

# Запуск E2E тестов
pnpm test:e2e

# Запуск тестов для конкретной директории
pnpm test server
pnpm test client
```

### Фильтрация тестов

```bash
# Запуск тестов по имени
pnpm test -- --grep "authentication"

# Запуск тестов по файлу
pnpm test -- user.test.ts

# Запуск тестов для конкретного компонента
pnpm test -- Button
```

## Unit тесты

### Пример теста утилиты

```typescript
// client/src/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatReadingTime } from './utils';

describe('formatReadingTime', () => {
  it('should format minutes correctly', () => {
    expect(formatReadingTime(30)).toBe('30 мин');
    expect(formatReadingTime(60)).toBe('1 час');
    expect(formatReadingTime(90)).toBe('1 час 30 мин');
  });

  it('should handle edge cases', () => {
    expect(formatReadingTime(0)).toBe('0 мин');
    expect(formatReadingTime(-1)).toBe('0 мин');
  });
});
```

### Пример теста компонента

```typescript
// client/src/components/Button/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

## Тестирование API

### Настройка тестового окружения

```typescript
// server/__tests__/setup.ts
import { beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../shared/schema';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { migrate as drizzleMigrate } from '../db';

let testDb: postgres.Sql;

beforeAll(async () => {
  // Используем тестовую базу данных
  testDb = postgres(process.env.TEST_DATABASE_URL!);
  const db = drizzle(testDb, { schema });
  
  // Применяем миграции
  await drizzleMigrate(db);
});

afterAll(async () => {
  await testDb.end();
});
```

### Пример теста API эндпоинта

```typescript
// server/routes/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../shared/schema';

describe('Authentication Routes', () => {
  let testDb: postgres.Sql;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    testDb = postgres(process.env.TEST_DATABASE_URL!);
    db = drizzle(testDb, { schema });
  });

  afterAll(async () => {
    await testDb.end();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 400 for duplicate email', async () => {
      const userData = {
        username: 'testuser2',
        email: 'test@example.com', // Дубликат
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);
    });
  });
});
```

## Интеграционные тесты

### Пример теста с базой данных

```typescript
// server/repositories/user-repository.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { UserRepository } from './user-repository';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../shared/schema';

describe('UserRepository', () => {
  let testDb: postgres.Sql;
  let db: ReturnType<typeof drizzle>;
  let repository: UserRepository;

  beforeAll(async () => {
    testDb = postgres(process.env.TEST_DATABASE_URL!);
    db = drizzle(testDb, { schema });
    repository = new UserRepository(db);
  });

  afterAll(async () => {
    await testDb.end();
  });

  beforeEach(async () => {
    // Очистка данных перед каждым тестом
    await db.delete(schema.users);
  });

  it('should create and find user', async () => {
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'hashedpassword'
    };

    const created = await repository.create(userData);
    expect(created.id).toBeDefined();
    expect(created.email).toBe(userData.email);

    const found = await repository.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.email).toBe(userData.email);
  });
});
```

## E2E тесты

### Настройка Playwright

```typescript
// e2e/fixtures/auth.fixture.ts
import { test as base, expect } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Логин перед каждым тестом
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Ожидаем редирект на главную
    await expect(page).toHaveURL('/');
    await use(page);
  },
});

export { expect };
```

### Пример E2E теста

```typescript
// e2e/reading-session.spec.ts
import { test, expect } from './fixtures/auth.fixture';

test.describe('Reading Session', () => {
  test('should create and join reading session', async ({ page }) => {
    await page.goto('/clubs/1');
    
    // Создаем новую сессию
    await page.click('[data-testid="create-session-button"]');
    await page.fill('[data-testid="session-title"]', 'Test Reading Session');
    await page.click('[data-testid="save-session"]');
    
    // Проверяем что сессия создана
    await expect(page.locator('[data-testid="session-list"]')).toContainText('Test Reading Session');
    
    // Присоединяемся к сессии
    await page.click('[data-testid="join-session"]');
    
    // Проверяем что мы в сессии
    await expect(page.locator('[data-testid="session-status"]')).toContainText('Активна');
  });

  test('should sync reading progress', async ({ page }) => {
    await page.goto('/reading/session/123');
    
    // Прокручиваем страницу
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
    });
    
    // Ждем синхронизации
    await page.waitForTimeout(1000);
    
    // Проверяем что прогресс сохранился
    const progress = await page.locator('[data-testid="reading-progress"]').textContent();
    expect(parseInt(progress || '0')).toBeGreaterThan(0);
  });
});
```

## Мокирование

### Мокирование внешних API

```typescript
// client/src/lib/api/__tests__/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { apiClient } from '../client';

const server = setupServer(
  rest.get('/api/books', (req, res, ctx) => {
    return res(
      ctx.json([
        { id: 1, title: 'Test Book', author: 'Test Author' }
      ])
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('API Client', () => {
  it('should fetch books', async () => {
    const books = await apiClient.getBooks();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Test Book');
  });
});
```

### Мокирование базы данных

```typescript
// server/services/__tests__/book-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BookService } from '../book-service';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { DrizzleDB } from '../../types';

describe('BookService', () => {
  let mockDb: DeepMockProxy<DrizzleDB>;
  let service: BookService;

  beforeEach(() => {
    mockDb = mockDeep<DrizzleDB>();
    service = new BookService(mockDb);
  });

  it('should get book by id', async () => {
    const mockBook = { id: 1, title: 'Test Book' };
    mockDb.query.books.findFirst.mockResolvedValue(mockBook);

    const book = await service.getBookById(1);
    expect(book).toEqual(mockBook);
    expect(mockDb.query.books.findFirst).toHaveBeenCalledWith({
      where: expect.any(Object)
    });
  });
});
```

## Тестирование производительности

### Нагрузочное тестирование скриптов

```typescript
// scripts/performance/load-test.ts
import { describe, it, expect } from 'vitest';
import { loadTestEndpoint } from '../utils/load-tester';

describe('Load Tests', () => {
  it('should handle 100 concurrent users', async () => {
    const results = await loadTestEndpoint({
      url: '/api/books',
      concurrentUsers: 100,
      duration: 30000, // 30 секунд
    });

    expect(results.averageResponseTime).toBeLessThan(1000); // 1 секунда
    expect(results.errorRate).toBeLessThan(0.01); // < 1% ошибок
  });
});
```

## CI/CD интеграция

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: voxlibris_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/voxlibris_test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Метрики тестирования

### Покрытие кода

```json
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/e2e/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
});
```

## Лучшие практики

### 1. Организация тестов
- Группируйте тесты логически
- Используйте понятные имена
- Документируйте сложные тесты

### 2. Тестовые данные
- Используйте factory паттерн для создания тестовых данных
- Очищайте данные после каждого теста
- Используйте предсказуемые данные

### 3. Ассершены
- Используйте конкретные ассершены
- Тестируйте поведение, а не реализацию
- Проверяйте граничные случаи

### 4. Производительность
- Изолируйте тесты друг от друга
- Используйте parallel выполнение
- Оптимизируйте медленные тесты

## Заключение

Для получения дополнительной информации:

- [Vitest документация](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright документация](https://playwright.dev/)

---

Если у вас есть вопросы по тестированию, обращайтесь к команде или создавайте issues.