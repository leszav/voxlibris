# Тестирование

## Обзор

В проекте VoxLibris используется встроенная система тестирования Node.js для серверных тестов и Jest (или React Testing Library) для клиентских тестов. В этом разделе описаны скрипты и подходы к тестированию.

## package.json скрипты

Скрипты тестирования определены в файле `package.json`:

```json
{
  "scripts": {
    "test": "npm run test:server && npm run test:client",
    "test:server": "node --test ./server/**/*.test.ts",
    "test:client": "cd client && npm run test",
    "test:watch": "node --test --watch ./server/**/*.test.ts",
    "test:coverage": "node --test --experimental-test-coverage ./server/**/*.test.ts"
  }
}
```

## Структура тестов

### Серверные тесты

Серверные тесты находятся в той же директории, что и тестируемые файлы, с суффиксом `.test.ts`:

```
server/
├── services/
│   ├── user-service.ts
│   └── user-service.test.ts
├── repositories/
│   ├── user-repository.ts
│   └── user-repository.test.ts
├── middleware/
│   ├── auth-middleware.ts
│   └── auth-middleware.test.ts
└── routes/
    ├── user-routes.ts
    └── user-routes.test.ts
```

### Клиентские тесты

Клиентские тесты находятся в директории `client/` и следуют той же структуре, что и серверные тесты.

## Типы тестов

### Unit-тесты

Unit-тесты проверяют отдельные функции и компоненты:

```typescript
// server/services/user-service.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'assert';
import { UserService } from './user-service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  it('should create a new user', async () => {
    const userData = { name: 'John Doe', email: 'john@example.com' };
    const user = await userService.createUser(userData);

    assert.strictEqual(user.name, 'John Doe');
    assert.strictEqual(user.email, 'john@example.com');
  });
});
```

### Интеграционные тесты

Интеграционные тесты проверяют взаимодействие между несколькими компонентами:

```typescript
// server/integration/auth-flow.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'assert';
import { AuthService } from '../services/auth-service';
import { UserRepository } from '../repositories/user-repository';

describe('Auth Flow Integration', () => {
  let authService: AuthService;
  let userRepository: UserRepository;

  beforeEach(() => {
    userRepository = new UserRepository();
    authService = new AuthService(userRepository);
  });

  it('should register and authenticate user', async () => {
    const userData = { email: 'test@example.com', password: 'password123' };
    
    // Register user
    const newUser = await authService.register(userData);
    assert.ok(newUser.id);
    
    // Authenticate user
    const token = await authService.login(userData.email, userData.password);
    assert.ok(token);
  });
});
```

### E2E тесты

E2E тесты проверяют полный пользовательский сценарий, включая API-вызовы:

```typescript
// server/e2e/reading-session.test.ts
import { describe, it } from 'node:test';
import assert from 'assert';
import { createTestServer } from '../utils/test-server';

describe('Reading Session E2E', () => {
  const testServer = createTestServer();

  it('should allow user to join and participate in reading session', async () => {
    // Create a club
    const clubResponse = await testServer.post('/clubs').send({
      name: 'Test Club',
      description: 'A test club'
    });
    
    // Create a book
    const bookResponse = await testServer.post('/books').attach('file', 'test-book.epub');
    
    // Start a reading session
    const sessionResponse = await testServer.post(`/clubs/${clubResponse.body.id}/sessions`).send({
      bookId: bookResponse.body.id,
      startTime: new Date()
    });
    
    assert.strictEqual(sessionResponse.status, 200);
    assert.ok(sessionResponse.body.id);
  });
});
```

## Запуск тестов

### Все тесты

```bash
pnpm run test
```

Запускает все тесты (серверные и клиентские).

### Только серверные тесты

```bash
pnpm run test:server
```

Запускает только серверные тесты с использованием встроенного тестового раннера Node.js.

### Только клиентские тесты

```bash
pnpm run test:client
```

Запускает только клиентские тесты.

### Наблюдение за изменениями

```bash
pnpm run test:watch
```

Запускает серверные тесты в режиме наблюдения, автоматически перезапуская тесты при изменении файлов.

### Покрытие кода

```bash
pnpm run test:coverage
```

Запускает тесты с генерацией отчета о покрытии кода (требуется экспериментальный флаг Node.js).

## Настройка тестовой среды

Для тестов используются отдельные конфигурации и базы данных:

```typescript
// server/utils/test-config.ts
export const testConfig = {
  database: {
    url: process.env.TEST_DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/voxlibris_test'
  },
  s3: {
    endpoint: 'http://localhost:9001', // отдельный MinIO для тестов
    bucket: 'test-bucket'
  }
};
```

## Mock-объекты и фикстуры

Для тестирования используются mock-объекты и фикстуры:

```typescript
// server/mocks/user-mock.ts
export const mockUser = {
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date()
};

// server/fixtures/book-fixture.ts
export const createTestBook = () => ({
  id: 'book-1',
  title: 'Test Book',
  author: 'Test Author',
  content: 'Test content...',
  chapters: [
    { id: 'ch-1', title: 'Chapter 1', content: 'Chapter 1 content...' },
    { id: 'ch-2', title: 'Chapter 2', content: 'Chapter 2 content...' }
  ]
});
```

## Рекомендации по тестированию

1. Покрывайте unit-тестами бизнес-логику и сложные функции
2. Используйте интеграционные тесты для проверки взаимодействия между компонентами
3. Пишите E2E тесты для ключевых пользовательских сценариев
4. Используйте фикстуры для подготовки тестовых данных
5. Изолируйте тесты от внешних зависимостей с помощью mock-объектов
6. Регулярно запускайте тесты перед коммитом
7. Поддерживайте высокий процент покрытия тестами критических компонентов
8. Используйте CI для автоматического запуска тестов при каждом PR