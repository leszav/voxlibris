# Контроллеры

## Обзор

В приложении VoxLibris контроллеры реализованы в виде обработчиков маршрутов (route handlers) в файлах маршрутов. В отличие от классических MVC-контроллеров, логика обработки запросов интегрирована непосредственно в файлы маршрутов, что упрощает структуру приложения.

## Структура контроллеров

Контроллеры находятся в тех же файлах, что и маршруты:

```
server/routes/
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

## Принципы организации контроллеров

### 1. Организация по функциональности

Каждый файл маршрутов отвечает за определенную функциональность:

- `auth-routes.ts` - аутентификация
- `club-routes.ts` - управление клубами
- `book-routes.ts` - работа с книгами
- `reading-sessions-routes.ts` - сессии чтения

### 2. Использование сервисов

Контроллеры делегируют бизнес-логику соответствующим сервисам:

```typescript
// server/routes/club-routes.ts
import { Request, Response } from 'express';
import { ClubService } from '../services/club-service';
import { authenticateToken } from '../middleware/auth-middleware';

const clubService = new ClubService();

// GET /clubs/my
export const getUserClubs = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id; // получаем из middleware аутентификации
    const clubs = await clubService.getUserClubs(userId);
    res.json(clubs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// POST /clubs
export const createClub = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const clubData = req.body;
    const club = await clubService.createClub(clubData, userId);
    res.status(201).json(club);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Регистрация маршрутов
router.get('/my', authenticateToken, getUserClubs);
router.post('/', authenticateToken, createClub);

export default router;
```

### 3. Обработка ошибок

Каждый контроллер должен обрабатывать ошибки и возвращать соответствующие HTTP-ответы:

```typescript
// server/routes/personal-books-routes.ts
import { Request, Response } from 'express';
import { BookService } from '../services/book-service';

const bookService = new BookService();

// POST /upload
export const uploadBook = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user!.id;
    const isPersonal = true;
    const book = await bookService.uploadBook(req.file, userId, isPersonal);
    res.status(201).json(book);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to upload book' });
    }
  }
};
```

### 4. Валидация входных данных

Валидация данных осуществляется с использованием Zod:

```typescript
// server/routes/club-routes.ts
import { z } from 'zod';
import { validate } from '../middleware/validator-middleware';

const createClubSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
});

// Использование валидации
router.post('/', authenticateToken, validate(createClubSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const clubData = req.body;
    const club = await clubService.createClub(clubData, userId);
    res.status(201).json(club);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## Примеры контроллеров

### Контроллер аутентификации

```typescript
// server/routes/auth-routes.ts
import { Request, Response } from 'express';
import { AuthService } from '../services/auth-service';

const authService = new AuthService();

// POST /login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    
    // Установка cookie с токеном
    res.cookie('token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 часа
    });
    
    res.json({
      user: result.user,
      refreshToken: result.refreshToken
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
};

// POST /refresh
export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    
    res.cookie('token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({ user: result.user });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
};
```

### Контроллер сессий чтения

```typescript
// server/routes/reading-sessions-routes.ts
import { Request, Response } from 'express';
import { ReadingSessionService } from '../services/reading-session-service';

const sessionService = new ReadingSessionService();

// POST /join
export const joinSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user!.id;
    
    await sessionService.joinSession(sessionId, userId);
    
    res.status(200).json({ message: 'Successfully joined session' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// POST /sync-progress
export const syncProgress = async (req: Request, res: Response) => {
  try {
    const { sessionId, chapterIndex, position } = req.body;
    const userId = req.user!.id;
    
    await sessionService.updateProgress(sessionId, userId, { chapterIndex, position });
    
    // Синхронизация через WebSocket
    // ... код для отправки обновления другим участникам сессии ...
    
    res.status(200).json({ message: 'Progress synced' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
```

### Контроллер уведомлений

```typescript
// server/routes/notifications-routes.ts
import { Request, Response } from 'express';
import { NotificationService } from '../services/notification-service';

const notificationService = new NotificationService();

// GET /
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit = 20, offset = 0 } = req.query;
    
    const notifications = await notificationService.getUserNotifications(
      userId, 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /:notificationId/read
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.id;
    
    await notificationService.markAsRead(parseInt(notificationId), userId);
    
    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
```

## Защита маршрутов

Контроллеры используют аутентификацию и авторизацию:

```typescript
// server/routes/club-routes.ts
import { authenticateToken, requireRole } from '../middleware/auth-middleware';

// Только авторизованные пользователи
router.get('/my', authenticateToken, getUserClubs);

// Только владельцы клуба или администраторы
router.put('/:clubId', authenticateToken, requireRole(['owner', 'admin']), updateClub);

// Публичные маршруты (без аутентификации)
router.get('/', getPublicClubs);
```

## Возвращаемые HTTP-статусы

Контроллеры должны использовать правильные HTTP-статусы:

- `200 OK` - успешный GET запрос
- `201 Created` - успешное создание ресурса
- `204 No Content` - успешное удаление
- `400 Bad Request` - неверный формат запроса
- `401 Unauthorized` - неавторизованный доступ
- `403 Forbidden` - недостаточно прав
- `404 Not Found` - ресурс не найден
- `500 Internal Server Error` - внутренняя ошибка сервера

## Рекомендации

1. Контроллеры должны быть тонкими и делегировать бизнес-логику сервисам
2. Используйте асинхронные функции для обработки запросов
3. Обрабатывайте ошибки с помощью try-catch блоков
4. Валидируйте входные данные перед обработкой
5. Используйте правильные HTTP-статусы
6. Проверяйте права доступа к ресурсам
7. Логируйте важные события в контроллерах
8. Не храните чувствительные данные в ответах в production
9. Обновляйте документацию при изменении контроллеров