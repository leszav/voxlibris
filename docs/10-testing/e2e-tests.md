# E2E-тесты

## Обзор

E2E (end-to-end) тесты проверяют полные пользовательские сценарии приложения VoxLibris, включая взаимодействие между клиентской и серверной частями. Эти тесты обеспечивают проверку корректности работы всего приложения от начала до конца.

## Структура файлов

E2E-тесты находятся в директории `tests/e2e/`:

```
tests/
└── e2e/
    ├── auth.e2e.test.ts
    ├── club-management.e2e.test.ts
    ├── book-upload.e2e.test.ts
    ├── reading-session.e2e.test.ts
    ├── notification.e2e.test.ts
    ├── fixtures/
    │   ├── user-fixture.ts
    │   ├── club-fixture.ts
    │   └── book-fixture.ts
    └── helpers/
        ├── setup.ts
        ├── teardown.ts
        └── utils.ts
```

## Инструменты

### Playwright

Для E2E-тестов используется Playwright - современный фреймворк для автоматизации браузеров:

```typescript
// tests/e2e/auth.e2e.test.ts
import { test, expect } from '@playwright/test';
import { createUser, cleanUpUser } from './fixtures/user-fixture';

test.describe('Authentication Flow', () => {
  let testUser: { email: string; password: string; id: number };

  test.beforeEach(async () => {
    testUser = await createUser({
      email: 'e2e-test@example.com',
      name: 'E2E Test User',
      password: 'SecurePassword123!'
    });
  });

  test.afterEach(async () => {
    await cleanUpUser(testUser.id);
  });

  test('should allow user to register and login', async ({ page }) => {
    // Переход на главную страницу
    await page.goto('/');
    
    // Переход на страницу регистрации
    await page.getByRole('link', { name: 'Sign Up' }).click();
    
    // Заполнение формы регистрации
    await page.locator('input[name="email"]').fill(testUser.email);
    await page.locator('input[name="name"]').fill('E2E Test User');
    await page.locator('input[name="password"]').fill(testUser.password);
    await page.locator('input[name="confirmPassword"]').fill(testUser.password);
    
    // Отправка формы
    await page.getByRole('button', { name: 'Register' }).click();
    
    // Проверка успешной регистрации
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Welcome, E2E Test User')).toBeVisible();
    
    // Проверка наличия пользователя в базе данных
    const response = await page.request.get('/api/users/profile');
    expect(response.status()).toBe(200);
    
    const userData = await response.json();
    expect(userData.email).toBe(testUser.email);
  });

  test('should prevent login with invalid credentials', async ({ page }) => {
    // Переход на страницу входа
    await page.goto('/login');
    
    // Попытка входа с неверными данными
    await page.locator('input[name="email"]').fill('nonexistent@example.com');
    await page.locator('input[name="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Проверка сообщения об ошибке
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});
```

## Настройка тестовой среды

### Конфигурация Playwright

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Фикстуры

Фикстуры обеспечивают подготовку тестовых данных:

```typescript
// tests/e2e/fixtures/user-fixture.ts
import { request } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: number;
  email: string;
  name: string;
  password: string;
}

export const createUser = async (userData: Omit<User, 'id'>): Promise<User> => {
  // Используем отдельный контекст запросов для создания пользователя
  const apiContext = await request.newContext({
    baseURL: 'http://localhost:5000/api',
  });

  const response = await apiContext.post('/auth/register', {
    data: {
      email: userData.email,
      name: userData.name,
      password: userData.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create user: ${await response.text()}`);
  }

  const result = await response.json();
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    password: userData.password,
  };
};

export const cleanUpUser = async (userId: number) => {
  const apiContext = await request.newContext({
    baseURL: 'http://localhost:5000/api',
  });

  // Удаление пользователя
  await apiContext.delete(`/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`, // токен администратора
    }
  });
};
```

## Принципы написания E2E-тестов

### 1. Тестирование пользовательских сценариев

E2E-тесты должны проверять реальные пользовательские сценарии:

```typescript
// tests/e2e/club-management.e2e.test.ts
import { test, expect } from '@playwright/test';
import { createUser } from './fixtures/user-fixture';
import { createClub, deleteClub } from './fixtures/club-fixture';

test.describe('Club Management', () => {
  test('should allow user to create, update and delete a club', async ({ page, browser }) => {
    // Создание тестового пользователя
    const user = await createUser({
      email: `club-test-${Date.now()}@example.com`,
      name: 'Club Test User',
      password: 'SecurePassword123!'
    });

    // Авторизация пользователя
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Создание клуба
    await page.getByRole('button', { name: 'Create New Club' }).click();
    
    await page.locator('input[name="name"]').fill('My Test Club');
    await page.locator('textarea[name="description"]').fill('A club for testing purposes');
    await page.getByRole('checkbox', { name: 'Public Club' }).click(); // сделать публичным
    
    await page.getByRole('button', { name: 'Create Club' }).click();
    
    // Проверка создания клуба
    await page.waitForURL('**/clubs/**');
    await expect(page.getByRole('heading', { name: 'My Test Club' })).toBeVisible();

    // Обновление клуба
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('input[name="name"]').fill('Updated Test Club');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    
    // Проверка обновления
    await expect(page.getByRole('heading', { name: 'Updated Test Club' })).toBeVisible();

    // Удаление клуба
    await page.getByRole('button', { name: 'Delete Club' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    
    // Проверка, что клуб удален
    await expect(page.getByRole('heading', { name: 'Updated Test Club' })).not.toBeVisible();
  });
});
```

### 2. Изоляция тестов

Каждый тест должен быть изолирован и не зависеть от других тестов:

```typescript
// tests/e2e/book-upload.e2e.test.ts
import { test, expect } from '@playwright/test';
import { createUser } from './fixtures/user-fixture';

test.describe('Book Upload', () => {
  let user: Awaited<ReturnType<typeof createUser>>;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser: testBrowser }) => {
    browser = testBrowser;
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.beforeEach(async () => {
    user = await createUser({
      email: `book-test-${Date.now()}@example.com`,
      name: 'Book Test User',
      password: 'SecurePassword123!'
    });

    // Авторизация
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test.afterEach(async () => {
    // Удаление всех книг пользователя
    await page.goto('/books/library');
    const bookCards = page.locator('.book-card');
    const count = await bookCards.count();
    
    for (let i = 0; i < count; i++) {
      await bookCards.nth(i).getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
    }
  });

  test.afterAll(async () => {
    await context.close();
    await browser.close();
  });

  test('should allow user to upload and delete a book', async () => {
    // Переход к загрузке книги
    await page.getByRole('link', { name: 'Upload Book' }).click();
    
    // Подготовка файла для загрузки
    const bookFile = {
      name: 'test-book.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from('fake epub content'),
    };
    
    // Загрузка файла
    await page.locator('input[type="file"]').setInputFiles({
      name: bookFile.name,
      mimeType: bookFile.mimeType,
      buffer: bookFile.buffer,
    });
    
    // Проверка загрузки
    await expect(page.getByText('Upload Successful')).toBeVisible();
    
    // Проверка, что книга появилась в библиотеке
    await page.getByRole('link', { name: 'My Library' }).click();
    await expect(page.getByText('test-book')).toBeVisible();
  });
});
```

### 3. Использование Page Object Model

Для сложных сценариев используйте паттерн Page Object Model:

```typescript
// tests/e2e/pages/DashboardPage.ts
export class DashboardPage {
  readonly page: Page;
  readonly welcomeMessage: Locator;
  readonly createClubButton: Locator;
  readonly myClubsSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeMessage = page.getByText(/Welcome,/);
    this.createClubButton = page.getByRole('button', { name: 'Create New Club' });
    this.myClubsSection = page.locator('[data-testid="my-clubs"]');
  }

  async goto() {
    await this.page.goto('/dashboard');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.welcomeMessage).toBeVisible();
  }

  async clickCreateClub() {
    await this.createClubButton.click();
  }

  async getClubByName(name: string) {
    return this.myClubsSection.getByText(name);
  }
}

// tests/e2e/pages/ClubCreatePage.ts
export class ClubCreatePage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly isPublicCheckbox: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.locator('input[name="name"]');
    this.descriptionInput = page.locator('textarea[name="description"]');
    this.isPublicCheckbox = page.getByRole('checkbox', { name: 'Public Club' });
    this.createButton = page.getByRole('button', { name: 'Create Club' });
  }

  async createClub(clubData: { name: string; description: string; isPublic: boolean }) {
    await this.nameInput.fill(clubData.name);
    await this.descriptionInput.fill(clubData.description);
    if (clubData.isPublic) {
      await this.isPublicCheckbox.check();
    }
    await this.createButton.click();
  }
}

// tests/e2e/club-management.pom.test.ts
import { test, expect } from '@playwright/test';
import { createUser } from './fixtures/user-fixture';
import { DashboardPage } from './pages/DashboardPage';
import { ClubCreatePage } from './pages/ClubCreatePage';

test('should allow user to create club using POM', async ({ page }) => {
  const user = await createUser({
    email: `pom-test-${Date.now()}@example.com`,
    name: 'POM Test User',
    password: 'SecurePassword123!'
  });

  // Авторизация
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Использование POM
  const dashboardPage = new DashboardPage(page);
  await dashboardPage.goto();

  await dashboardPage.clickCreateClub();

  const clubCreatePage = new ClubCreatePage(page);
  await clubCreatePage.createClub({
    name: 'POM Test Club',
    description: 'Created using Page Object Model',
    isPublic: true
  });

  // Проверка результата
  await expect(page.getByRole('heading', { name: 'POM Test Club' })).toBeVisible();
});
```

## Запуск E2E-тестов

### Установка зависимостей

```bash
# Установка Playwright и браузеров
npx playwright install
```

### Запуск тестов

```bash
# Запуск всех E2E-тестов
pnpm run test:e2e

# Запуск в headless режиме (по умолчанию)
npx playwright test

# Запуск с открытием браузера
npx playwright test --headed

# Запуск конкретного теста
npx playwright test tests/e2e/auth.e2e.test.ts

# Запуск в определенном браузере
npx playwright test --project=chromium

# Генерация отчета
npx playwright test --reporter=html
```

## Рекомендации

1. Пишите E2E-тесты для критических пользовательских сценариев
2. Используйте фикстуры для подготовки тестовых данных
3. Изолируйте каждый тест от других
4. Используйте Page Object Model для сложных страниц
5. Проверяйте результаты через UI и через API
6. Используйте ожидания (expectations) вместо фиксированных задержек
7. Запускайте E2E-тесты в CI/CD перед деплоем
8. Обновляйте скриншоты и трейсы при изменениях UI
9. Используйте разные браузеры для тестирования
10. Пишите понятные описания для тестов