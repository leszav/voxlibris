# API Reference

## Обзор

В этом разделе представлен справочник по API приложения VoxLibris. Все API-эндпоинты используют JSON для обмена данными.

## Базовый URL

```
http://localhost:5000/api
```

В продакшене URL будет зависеть от настройки сервера.

## Аутентификация

Большинство эндпоинтов требуют JWT-токена для аутентификации. Токен должен быть передан в заголовке Authorization:

```
Authorization: Bearer <token>
```

## Структура ответов

Успешные ответы имеют следующую структуру:

```json
{
  "success": true,
  "data": {}
}
```

Ответы с ошибками:

```json
{
  "success": false,
  "error": "Error message",
  "details": {}
}
```

## Эндпоинты

### Аутентификация

#### POST /auth/register

Регистрация нового пользователя

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "User Name"
}
```

**Успешный ответ:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "createdAt": "2023-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here"
}
```

#### POST /auth/login

Вход пользователя

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Успешный ответ:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "createdAt": "2023-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here"
}
```

#### POST /auth/refresh

Обновление токена

**Тело запроса:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Успешный ответ:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "createdAt": "2023-01-01T00:00:00.000Z"
  },
  "accessToken": "new_jwt_token_here"
}
```

#### POST /auth/logout

Выход пользователя

**Успешный ответ:**
```json
{
  "message": "Successfully logged out"
}
```

### Пользователи

#### GET /users/profile

Получение профиля текущего пользователя

**Успешный ответ:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "User Name",
  "role": "user",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

#### PUT /users/profile

Обновление профиля

**Тело запроса:**
```json
{
  "name": "New Name",
  "bio": "My bio"
}
```

**Успешный ответ:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "New Name",
  "bio": "My bio",
  "role": "user",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-02T00:00:00.000Z"
}
```

#### PUT /users/password

Изменение пароля

**Тело запроса:**
```json
{
  "currentPassword": "currentPassword123",
  "newPassword": "newSecurePassword123"
}
```

**Успешный ответ:**
```json
{
  "message": "Password successfully updated"
}
```

### Клубы

#### GET /clubs

Получение публичных клубов

**Параметры запроса:**
- `limit` (опционально, по умолчанию 10)
- `offset` (опционально, по умолчанию 0)

**Успешный ответ:**
```json
[
  {
    "id": 1,
    "name": "Book Lovers",
    "description": "A club for book enthusiasts",
    "isPublic": true,
    "memberCount": 15,
    "ownerId": 2,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
]
```

#### GET /clubs/my

Получение клубов пользователя

**Успешный ответ:**
```json
[
  {
    "id": 1,
    "name": "My Book Club",
    "description": "Private club",
    "isPublic": false,
    "memberCount": 5,
    "ownerId": 1,
    "role": "owner",
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
]
```

#### POST /clubs

Создание нового клуба

**Тело запроса:**
```json
{
  "name": "New Book Club",
  "description": "Our reading group",
  "isPublic": false
}
```

**Успешный ответ:**
```json
{
  "id": 1,
  "name": "New Book Club",
  "description": "Our reading group",
  "isPublic": false,
  "memberCount": 1,
  "ownerId": 1,
  "createdAt": "2023-01-01T00:00:00.000Z"
}
```

#### GET /clubs/:clubId

Получение информации о клубе

**Успешный ответ:**
```json
{
  "id": 1,
  "name": "Book Lovers",
  "description": "A club for book enthusiasts",
  "isPublic": true,
  "memberCount": 15,
  "ownerId": 2,
  "members": [
    {
      "id": 2,
      "name": "Owner Name",
      "role": "owner"
    }
  ],
  "createdAt": "2023-01-01T00:00:00.000Z"
}
```

#### POST /clubs/:clubId/invite

Создание приглашения в клуб

**Успешный ответ:**
```json
{
  "invitationToken": "abc123def456..."
}
```

#### POST /clubs/:clubId/join/:token

Присоединение к клубу по токену

**Успешный ответ:**
```json
{
  "message": "Successfully joined the club"
}
```

### Книги

#### GET /clubs/:clubId/books

Получение книг клуба

**Успешный ответ:**
```json
[
  {
    "id": 1,
    "title": "Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "description": "Classic novel",
    "coverUrl": "/covers/gatsby.jpg",
    "uploaderId": 1,
    "uploadedAt": "2023-01-01T00:00:00.000Z"
  }
]
```

#### POST /clubs/:clubId/books/upload

Загрузка новой книги в клуб

**Тело запроса (multipart/form-data):**
- `file`: файл книги (EPUB или FB2)

**Успешный ответ:**
```json
{
  "id": 1,
  "title": "New Book Title",
  "author": "Author Name",
  "description": "Book description from metadata",
  "coverUrl": "/covers/new-book.jpg",
  "uploaderId": 1,
  "uploadedAt": "2023-01-01T00:00:00.000Z"
}
```

#### GET /books

Получение личных книг

**Успешный ответ:**
```json
[
  {
    "id": 1,
    "title": "Personal Book",
    "author": "Author Name",
    "description": "Personal copy",
    "coverUrl": "/covers/personal-book.jpg",
    "uploaderId": 1,
    "uploadedAt": "2023-01-01T00:00:00.000Z"
  }
]
```

### Сессии чтения

#### POST /reading-sessions/join

Присоединение к сессии чтения

**Тело запроса:**
```json
{
  "sessionId": 123
}
```

**Успешный ответ:**
```json
{
  "message": "Successfully joined session",
  "sessionInfo": {
    "id": 123,
    "book": {
      "id": 1,
      "title": "Great Gatsby",
      "author": "F. Scott Fitzgerald"
    },
    "participants": [
      {
        "id": 1,
        "name": "Participant Name"
      }
    ],
    "progress": {
      "chapterIndex": 2,
      "position": 0.45
    }
  }
}
```

#### POST /reading-sessions/sync-progress

Синхронизация прогресса чтения

**Тело запроса:**
```json
{
  "sessionId": 123,
  "chapterIndex": 2,
  "position": 0.65
}
```

**Успешный ответ:**
```json
{
  "message": "Progress synchronized"
}
```

### Реакции

#### POST /reactions

Отправка реакции во время чтения

**Тело запроса:**
```json
{
  "sessionId": 123,
  "type": "like",
  "timestamp": 1234567
}
```

**Успешный ответ:**
```json
{
  "id": 456,
  "sessionId": 123,
  "userId": 1,
  "type": "like",
  "timestamp": 1234567,
  "createdAt": "2023-01-01T00:00:00.000Z"
}
```

#### GET /reactions/session/:sessionId

Получение реакций сессии

**Успешный ответ:**
```json
[
  {
    "id": 456,
    "userId": 1,
    "userName": "User Name",
    "type": "like",
    "timestamp": 1234567,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
]
```

### Уведомления

#### GET /notifications

Получение уведомлений пользователя

**Параметры запроса:**
- `limit` (опционально, по умолчанию 20)
- `offset` (опционально, по умолчанию 0)

**Успешный ответ:**
```json
[
  {
    "id": 1,
    "title": "New Book Added",
    "content": "A new book was added to your club",
    "type": "BOOK_ADDED",
    "read": false,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
]
```

#### PUT /notifications/:notificationId/read

Отметка уведомления как прочитанного

**Успешный ответ:**
```json
{
  "message": "Notification marked as read"
}
```

## Обработка ошибок

API возвращает соответствующие HTTP-статусы и сообщения об ошибках:

- `400 Bad Request`: Неверный формат запроса или невалидные данные
- `401 Unauthorized`: Отсутствует или невалиден токен аутентификации
- `403 Forbidden`: Недостаточно прав для выполнения действия
- `404 Not Found`: Запрашиваемый ресурс не найден
- `429 Too Many Requests`: Превышен лимит запросов
- `500 Internal Server Error`: Внутренняя ошибка сервера

Пример ошибки:
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

## Рекомендации

1. Всегда проверяйте статус ответа перед обработкой данных
2. Обрабатывайте ошибки на клиенте с учетом типа ошибки
3. Используйте токен обновления при истечении основного токена
4. Проверяйте права доступа к ресурсам
5. Следите за лимитом запросов
6. Обновляйте токены аутентификации при необходимости