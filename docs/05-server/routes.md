# Маршруты

## Обзор

В этом разделе описаны API-маршруты серверной части приложения VoxLibris. Все маршруты реализованы с использованием Express.js и обеспечивают взаимодействие между клиентской частью и бизнес-логикой приложения.

## Структура файлов

Маршруты находятся в директории `server/routes/`:

```
server/routes/
├── index.ts
├── auth-routes.ts
├── user-routes.ts
├── club-routes.ts
├── club-reader-routes.ts
├── club-books-routes.ts
├── club-discussions-routes.ts
├── personal-books-routes.ts
├── reading-sessions-routes.ts
├── reactions-routes.ts
├── questions-routes.ts
├── schedule-routes.ts
├── recordings-routes.ts
└── notifications-routes.ts
```

## Центральный маршрут

### server/routes/index.ts

Файл `index.ts` объединяет все маршруты в одно приложение:

```typescript
import { Router } from 'express';
import authRoutes from './auth-routes';
import userRoutes from './user-routes';
import clubRoutes from './club-routes';
// ... другие маршруты

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/clubs', clubRoutes);
// ... другие маршруты

export default router;
```

## Маршруты аутентификации

### server/routes/auth-routes.ts

Обеспечивает регистрацию, вход и восстановление пароля:

- `POST /register` - Регистрация нового пользователя
- `POST /login` - Вход пользователя
- `POST /refresh` - Обновление токена
- `POST /logout` - Выход пользователя
- `POST /forgot-password` - Запрос сброса пароля
- `POST /reset-password` - Сброс пароля

## Маршруты пользователей

### server/routes/user-routes.ts

Обработка пользовательских данных:

- `GET /profile` - Получение профиля текущего пользователя
- `PUT /profile` - Обновление профиля
- `PUT /password` - Изменение пароля
- `GET /:userId` - Получение профиля другого пользователя
- `GET /clubs` - Получение клубов пользователя

## Маршруты клубов

### server/routes/club-routes.ts

Управление клубами и участниками:

- `GET /` - Получение списка публичных клубов
- `GET /my` - Получение клубов, в которых состоит пользователь
- `POST /` - Создание нового клуба
- `GET /:clubId` - Получение информации о клубе
- `PUT /:clubId` - Обновление информации о клубе
- `DELETE /:clubId` - Удаление клуба
- `POST /:clubId/invite` - Создание приглашения
- `POST /:clubId/join/:token` - Присоединение к клубу по токену
- `DELETE /:clubId/members/:userId` - Исключение участника

### server/routes/club-reader-routes.ts

Маршруты для участников клуба:

- `GET /:clubId/books` - Получение книг клуба
- `GET /:clubId/sessions` - Получение сессий чтения
- `GET /:clubId/discussions` - Получение обсуждений

### server/routes/club-books-routes.ts

Управление книгами клуба:

- `GET /:clubId/books` - Получение книг клуба
- `POST /:clubId/books/upload` - Загрузка новой книги
- `DELETE /:clubId/books/:bookId` - Удаление книги
- `GET /:clubId/books/:bookId/download` - Скачивание книги

### server/routes/club-discussions-routes.ts

Управление обсуждениями клуба:

- `GET /:clubId/discussions` - Получение обсуждений
- `POST /:clubId/discussions` - Создание обсуждения
- `PUT /:clubId/discussions/:discussionId` - Обновление обсуждения
- `DELETE /:clubId/discussions/:discussionId` - Удаление обсуждения

## Маршруты книг

### server/routes/personal-books-routes.ts

Управление личной библиотекой:

- `GET /` - Получение личных книг
- `POST /upload` - Загрузка новой книги
- `DELETE /:bookId` - Удаление книги
- `GET /:bookId/download` - Скачивание книги

## Маршруты сессий чтения

### server/routes/reading-sessions-routes.ts

Управление сессиями чтения:

- `POST /join` - Присоединение к сессии
- `POST /leave` - Покидание сессии
- `POST /sync-progress` - Синхронизация прогресса
- `POST /control` - Управление воспроизведением
- `GET /current/:sessionId` - Получение текущего состояния сессии

## Маршруты взаимодействия

### server/routes/reactions-routes.ts

Работа с реакциями во время чтения:

- `POST /` - Отправка реакции
- `GET /session/:sessionId` - Получение реакций сессии
- `DELETE /:reactionId` - Удаление реакции

### server/routes/questions-routes.ts

Работа с вопросами во время чтения:

- `POST /` - Отправка вопроса
- `GET /session/:sessionId` - Получение вопросов сессии
- `PUT /:questionId` - Обновление статуса вопроса
- `DELETE /:questionId` - Удаление вопроса

## Маршруты планирования

### server/routes/schedule-routes.ts

Управление расписанием сессий:

- `GET /club/:clubId` - Получение запланированных сессий клуба
- `POST /` - Создание запланированной сессии
- `PUT /:scheduleId` - Обновление запланированной сессии
- `DELETE /:scheduleId` - Удаление запланированной сессии

## Маршруты записей

### server/routes/recordings-routes.ts

Управление записями сессий:

- `GET /session/:sessionId` - Получение записи сессии
- `GET /club/:clubId` - Получение записей клуба
- `DELETE /:recordingId` - Удаление записи

## Маршруты уведомлений

### server/routes/notifications-routes.ts

Управление уведомлениями:

- `GET /` - Получение уведомлений пользователя
- `PUT /:notificationId/read` - Отметка уведомления как прочитанного
- `PUT /read-all` - Отметка всех уведомлений как прочитанных
- `DELETE /:notificationId` - Удаление уведомления

## Защита маршрутов

Многие маршруты защищены JWT-аутентификацией:

```typescript
import { authenticateToken } from '../middleware/auth-middleware';

// Защита маршрута
router.get('/profile', authenticateToken, (req, res) => {
  // Обработка запроса
});
```

## Обработка ошибок

Каждый маршрут включает обработку ошибок:

```typescript
router.get('/:clubId', async (req, res) => {
  try {
    const club = await clubService.getClubById(parseInt(req.params.clubId));
    res.json(club);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});
```

## Валидация данных

Валидация входных данных осуществляется с использованием Zod:

```typescript
import { z } from 'zod';

const createClubSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

router.post('/', async (req, res) => {
  try {
    const validatedData = createClubSchema.parse(req.body);
    const club = await clubService.createClub(validatedData);
    res.status(201).json(club);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});
```

## Рекомендации

1. Используйте асинхронные функции для обработки запросов
2. Всегда оборачивайте асинхронные операции в try-catch
3. Валидируйте входные данные с использованием Zod
4. Защищайте маршруты с помощью аутентификации
5. Возвращайте соответствующие HTTP-статусы
6. Используйте RESTful принципы при проектировании маршрутов
7. Обновляйте документацию при изменении маршрутов