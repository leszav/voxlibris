# Интеграционные тесты

## Обзор

Интеграционные тесты проверяют взаимодействие между несколькими компонентами системы, включая сервисы, репозитории и иногда базу данных. Эти тесты обеспечивают проверку корректности работы связанных модулей вместе.

## Структура файлов

Интеграционные тесты находятся в той же структуре, что и unit-тесты, но имеют суффикс `.integration.test.ts`:

```
server/
├── integration/
│   ├── auth-flow.integration.test.ts
│   ├── club-management.integration.test.ts
│   ├── book-upload.integration.test.ts
│   ├── reading-session.integration.test.ts
│   └── notification-flow.integration.test.ts
├── services/
│   ├── user-service.integration.test.ts
│   ├── club-service.integration.test.ts
│   └── email-service.integration.test.ts
└── repositories/
    ├── user-repository.integration.test.ts
    ├── club-repository.integration.test.ts
    └── book-repository.integration.test.ts
```

## Инструменты

### Node.js Built-in Test Runner

Для интеграционных тестов также используется встроенный тестовый раннер Node.js:

```typescript
// server/integration/club-management.integration.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Pool } from 'pg';
import { UserService } from '../services/user-service';
import { ClubService } from '../services/club-service';
import { UserRepository } from '../repositories/user-repository';
import { ClubRepository } from '../repositories/club-repository';
import { db } from '../database/client';

describe('Club Management Integration', () => {
  let userService: UserService;
  let clubService: ClubService;
  let testUserId: number;
  let testClubId: number;

  beforeEach(async () => {
    // Подготовка тестовой среды
    userService = new UserService(new UserRepository());
    clubService = new ClubService(new ClubRepository());
    
    // Создание тестового пользователя
    const testUser = await userService.createUser({
      email: 'integration-test@example.com',
      name: 'Integration Test',
      password: 'password123'
    });
    
    testUserId = testUser.id;
  });

  afterEach(async () => {
    // Очистка после теста
    if (testClubId) {
      await db.delete(clubs).where(eq(clubs.id, testClubId));
    }
    
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should allow user to create and join club', async () => {
    // Создание клуба
    const clubData = {
      name: 'Integration Test Club',
      description: 'A club for integration testing',
      isPublic: true
    };
    
    const club = await clubService.createClub(clubData, testUserId);
    testClubId = club.id;
    
    assert.strictEqual(club.name, clubData.name);
    assert.strictEqual(club.ownerId, testUserId);
    
    // Проверка, что пользователь является участником
    const userClubs = await clubService.getUserClubs(testUserId);
    const createdClub = userClubs.find(c => c.id === club.id);
    
    assert.ok(createdClub);
    assert.strictEqual(createdClub.ownerId, testUserId);
  });

  it('should allow inviting and joining members', async () => {
    // Создание клуба
    const club = await clubService.createClub({
      name: 'Test Invite Club',
      description: 'A club for invite testing',
      isPublic: false
    }, testUserId);
    
    testClubId = club.id;
    
    // Создание второго пользователя
    const invitedUser = await userService.createUser({
      email: 'invited@example.com',
      name: 'Invited User',
      password: 'password123'
    });
    
    // Создание приглашения
    const invitationToken = await clubService.inviteMember(club.id, testUserId);
    
    // Присоединение по приглашению
    await clubService.joinClub(club.id, invitedUser.id, invitationToken);
    
    // Проверка, что второй пользователь стал участником
    const clubMembers = await clubService.getClubMembers(club.id);
    const isMember = clubMembers.some(m => m.userId === invitedUser.id);
    
    assert.ok(isMember);
    
    // Очистка
    await db.delete(users).where(eq(users.id, invitedUser.id));
  });
});
```

## Принципы написания интеграционных тестов

### 1. Тестирование сквозных сценариев

Интеграционные тесты должны проверять полноценные сценарии использования:

```typescript
// server/integration/book-upload.integration.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { BookService } from '../services/book-service';
import { BookRepository } from '../repositories/book-repository';
import { UserService } from '../services/user-service';
import { UserRepository } from '../repositories/user-repository';
import { FileStorage } from '../utils/file-storage';

describe('Book Upload Integration', () => {
  let bookService: BookService;
  let userService: UserService;
  let testUserId: number;
  let tempFilePath: string;

  beforeEach(async () => {
    bookService = new BookService(new BookRepository(), new FileStorage());
    userService = new UserService(new UserRepository());
    
    // Создание тестового пользователя
    const user = await userService.createUser({
      email: 'book-tester@example.com',
      name: 'Book Tester',
      password: 'password123'
    });
    
    testUserId = user.id;
    
    // Создание временного файла книги
    tempFilePath = path.join(__dirname, 'temp-test-book.epub');
    fs.writeFileSync(tempFilePath, 'fake epub content');
  });

  afterEach(async () => {
    // Удаление созданной книги из базы
    const books = await bookService.getUserBooks(testUserId);
    for (const book of books) {
      await bookService.deleteBook(book.id, testUserId);
    }
    
    // Удаление тестового пользователя
    await db.delete(users).where(eq(users.id, testUserId));
    
    // Удаление временного файла
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  it('should upload book and store metadata', async () => {
    const uploadResult = await bookService.uploadBook(
      {
        originalname: 'test-book.epub',
        path: tempFilePath,
        mimetype: 'application/epub+zip',
        size: 1024
      } as Express.Multer.File,
      testUserId,
      false
    );

    // Проверка, что книга создана в базе данных
    const storedBook = await bookService.getBookById(uploadResult.id);
    assert.ok(storedBook);
    assert.strictEqual(storedBook.title, 'Test Book Title'); // извлекается из метаданных
    assert.strictEqual(storedBook.author, 'Test Author'); // извлекается из метаданных
    assert.strictEqual(storedBook.uploaderId, testUserId);

    // Проверка, что файл сохранен в хранилище
    assert.ok(fs.existsSync(uploadResult.contentUrl));
  });
});
```

### 2. Использование тестовой базы данных

Для избежания конфликта с данными разработки, используйте отдельную тестовую базу данных:

```typescript
// server/config/test-db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_TEST_URL } from './config';

const client = postgres(DATABASE_TEST_URL);
export const testDb = drizzle(client);

// server/integration/helpers.ts
export const setupTestDatabase = async () => {
  // Запуск миграций для тестовой базы
  await migrate(testDb, { migrationsFolder: './migrations' });
};

export const cleanupTestDatabase = async () => {
  // Очистка тестовой базы данных
  await testDb.execute(sql`TRUNCATE TABLE users, clubs, books, reading_sessions RESTART IDENTITY CASCADE;`);
};
```

### 3. Подготовка и очистка данных

Каждый тест должен иметь предсказуемое состояние данных:

```typescript
// server/repositories/user-repository.integration.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { UserRepository } from './user-repository';
import { setupTestDatabase, cleanupTestDatabase } from '../integration/helpers';

describe('User Repository Integration', () => {
  let userRepository: UserRepository;

  beforeEach(async () => {
    await setupTestDatabase();
    userRepository = new UserRepository();
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  it('should create and retrieve user', async () => {
    const userData = {
      email: 'integration@example.com',
      name: 'Integration Test',
      passwordHash: 'hashed_password'
    };

    const createdUser = await userRepository.create(userData);
    const retrievedUser = await userRepository.findById(createdUser.id);

    assert.ok(retrievedUser);
    assert.strictEqual(retrievedUser.email, userData.email);
    assert.strictEqual(retrievedUser.name, userData.name);
  });

  it('should update user', async () => {
    const user = await userRepository.create({
      email: 'update-test@example.com',
      name: 'Original Name',
      passwordHash: 'hashed_password'
    });

    const updatedData = {
      name: 'Updated Name',
      bio: 'Updated bio'
    };

    const updatedUser = await userRepository.update(user.id, updatedData);

    assert.strictEqual(updatedUser.name, updatedData.name);
    assert.strictEqual(updatedUser.bio, updatedData.bio);
  });
});
```

## Запуск интеграционных тестов

### Настройка тестовой среды

Перед запуском интеграционных тестов необходимо настроить тестовую базу данных:

```bash
# Установка переменных окружения для тестовой базы
export DATABASE_URL="postgresql://test_user:test_password@localhost:5432/voxlibris_test"
export DATABASE_TEST_URL="postgresql://test_user:test_password@localhost:5432/voxlibris_integration_test"

# Создание тестовой базы
createdb voxlibris_integration_test

# Запуск интеграционных тестов
pnpm run test:integration
```

### Команда запуска

```json
{
  "scripts": {
    "test:integration": "node --test --env-file=.env.test ./server/**/*.integration.test.ts"
  }
}
```

## Типичные сценарии для интеграционных тестов

### 1. Аутентификация и авторизация

```typescript
// server/integration/auth-flow.integration.test.ts
it('should allow registration, login, and protected route access', async () => {
  // Регистрация
  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'integration@test.com',
      password: 'password123',
      name: 'Integration Test'
    });
  
  assert.strictEqual(registerResponse.status, 200);
  const { accessToken } = registerResponse.body;
  
  // Проверка доступа к защищенному маршруту
  const profileResponse = await request(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${accessToken}`);
  
  assert.strictEqual(profileResponse.status, 200);
  assert.strictEqual(profileResponse.body.email, 'integration@test.com');
});
```

### 2. Работа с сессиями чтения

```typescript
// server/integration/reading-session.integration.test.ts
it('should manage reading session lifecycle', async () => {
  // Создание пользователя, клуба и книги
  const user = await userService.createUser(/* ... */);
  const club = await clubService.createClub(/* ... */, user.id);
  const book = await bookService.uploadBook(/* ... */);

  // Создание сессии
  const session = await sessionService.createSession({
    bookId: book.id,
    clubId: club.id,
    hostId: user.id
  });

  // Присоединение участников
  await sessionService.joinSession(session.id, user.id);

  // Обновление прогресса
  await sessionService.updateProgress(session.id, user.id, {
    chapterIndex: 1,
    position: 0.5
  });

  // Завершение сессии
  await sessionService.endSession(session.id, user.id);

  // Проверка сохраненных данных
  const updatedSession = await sessionService.getSessionById(session.id);
  assert.strictEqual(updatedSession.status, 'finished');
});
```

## Рекомендации

1. Используйте отдельную тестовую базу данных для избежания конфликта с данными разработки
2. Тестируйте полноценные сценарии использования, а не отдельные функции
3. Подготавливайте предсказуемое состояние данных перед каждым тестом
4. Очищайте данные после каждого теста
5. Используйте транзакции базы данных для изоляции тестов
6. Покрывайте интеграционными тестами критические пути приложения
7. Используйте фикстуры для подготовки тестовых данных
8. Запускайте интеграционные тесты перед деплоем
9. Следите за временем выполнения тестов (интеграционные тесты обычно медленнее unit-тестов)
10. Обновляйте тесты при изменении интеграций между компонентами