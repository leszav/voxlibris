# Геймификация VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Архитектура](#архитектура)
3. [Система достижений](#система-достижений)
4. [Очки и уровни](#очки-и-уровни)
5. [Награды](#награды)
6. [API Endpoints](#api-endpoints)
7. [Админ-панель](#админ-панель)
8. [Интеграция с социальными функциями](#интеграция-с-социальными-функциями)

## Обзор

Геймификация в VoxLibris мотивирует пользователей к чтению и участию в клубах через систему достижений, очков и наград.

### Компоненты

- **Достижения** — выполнение целей за действия
- **Очки опыта (XP)** — накопление за активность
- **Уровни** — прогрессия пользователя
- **Награды** — визуальные и функциональные бонусы

## Архитектура

### Flow начисления

```
Пользователь выполняет действие
        ↓
Сервис активности фиксирует событие
        ↓
Gamification Service проверяет условия
        ↓
Начисление XP / разблокировка достижения
        ↓
Уведомление пользователя (WebSocket)
        ↓
Обновление UI
```

### Сервисы

| Сервис | Файл | Назначение |
|--------|------|------------|
| Gamification Service | `server/services/gamification-service.ts` | Основная логика |
| Activity Service | `server/services/activity-service.ts` | Фиксация событий |
| Club Popularity | `server/services/club-popularity-service.ts` | Рейтинг клубов |

## Система достижений

### Типы достижений

| Тип | Описание | Пример |
|-----|----------|--------|
| `milestone` | Достигнуть числа | Прочитать 10 книг |
| `streak` | Серия дней | Читать 7 дней подряд |
| `social` | Социальное | Получить 100 лайков |
| `club` | Клубное | Создать клуб |
| `reader` | Чтение вслух | Провести 5 сессий |

### Структура достижения

```typescript
interface Achievement {
  id: string;
  name: string;
  description: string;
  type: 'milestone' | 'streak' | 'social' | 'club' | 'reader';
  icon: string;           // URL иконки
  condition: {
    metric: string;       // Что считать
    target: number;       // Целевое значение
    period?: string;      // Период (optional)
  };
  reward: {
    xp: number;           // Очки опыта
    badge?: string;       // Бейдж
    title?: string;       // Титул
  };
  isActive: boolean;
  createdAt: Date;
}
```

### Примеры достижений

```json
{
  "id": "first-book",
  "name": "Первые шаги",
  "description": "Завершить первую книгу",
  "type": "milestone",
  "condition": {
    "metric": "books_completed",
    "target": 1
  },
  "reward": {
    "xp": 100,
    "badge": "novice-reader"
  }
}
```

## Очки и уровни

### Начисление XP

| Действие | XP |
|----------|-----|
| Завершить книгу | 100 |
| Прочитать главу | 10 |
| Присоединиться к клубу | 50 |
| Провести сессию чтения | 200 |
| Получить лайк | 5 |
| Оставить комментарий | 15 |
| Пригласить друга | 25 |

### Уровневая система

| Уровень | XP требуется | Название |
|---------|--------------|----------|
| 1 | 0 | Новичок |
| 2 | 100 | Читатель |
| 3 | 300 | Библиофил |
| 4 | 600 | Книжный червь |
| 5 | 1000 | Литератор |
| 6 | 1500 | Писатель |
| 7 | 2100 | Критик |
| 8 | 2800 | Мудрец |
| 9 | 3600 | Гуру |
| 10 | 4500 | Легенда |

### Формула уровня

```typescript
function getLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

function getXpForLevel(level: number): number {
  return Math.pow(level - 1, 2) * 100;
}
```

## Награды

### Типы наград

| Тип | Описание |
|-----|----------|
| `badge` | Визуальный бейдж на профиле |
| `title` | Титул перед именем |
| `theme` | Кастомная тема оформления |
| `feature` | Доступ к функции |

### Бейджи

Бейджи отображаются на профиле пользователя:
- Размер: 64x64px
- Формат: SVG или PNG
- Хранение: `gamification/achievements/`

### Титулы

Титулы отображаются перед именем пользователя:
- "📚 Книжный червь"
- "🎤 Мастер чтения"
- "🏆 Легенда"

## API Endpoints

### Получение прогресса

```http
GET /api/gamification/progress
Authorization: Bearer {token}
```

**Response:**
```json
{
  "userId": "uuid",
  "level": 5,
  "currentXp": 1250,
  "nextLevelXp": 1500,
  "totalXp": 1250,
  "achievements": [
    {
      "id": "first-book",
      "name": "Первые шаги",
      "unlockedAt": "2026-01-15T10:30:00Z",
      "icon": "https://..."
    }
  ],
  "badges": ["novice-reader", "club-founder"],
  "title": "📚 Литератор"
}
```

### Получение достижений

```http
GET /api/gamification/achievements
Authorization: Bearer {token}
```

**Response:**
```json
{
  "achievements": [
    {
      "id": "first-book",
      "name": "Первые шаги",
      "description": "Завершить первую книгу",
      "icon": "https://...",
      "progress": {
        "current": 1,
        "target": 1,
        "percentage": 100
      },
      "isUnlocked": true,
      "unlockedAt": "2026-01-15T10:30:00Z"
    }
  ]
}
```

### Получение лидерборда

```http
GET /api/gamification/leaderboard?period=week&limit=10
```

**Response:**
```json
{
  "period": "week",
  "users": [
    {
      "rank": 1,
      "userId": "uuid",
      "username": "reader1",
      "level": 8,
      "xp": 2500,
      "achievements": 15
    }
  ]
}
```

### Админ: Создание достижения

```http
POST /api/admin/gamification/achievements
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "Марафонец",
  "description": "Прочитать 1000 страниц",
  "type": "milestone",
  "condition": {
    "metric": "pages_read",
    "target": 1000
  },
  "reward": {
    "xp": 500,
    "badge": "marathon-reader"
  }
}
```

### Админ: Обновление достижения

```http
PUT /api/admin/gamification/achievements/{id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "isActive": false
}
```

### Админ: Получение статистики

```http
GET /api/admin/gamification/stats
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "totalUsers": 1500,
  "activeUsers": 800,
  "averageLevel": 3.5,
  "totalAchievementsUnlocked": 5000,
  "topAchievements": [
    {
      "achievementId": "first-book",
      "unlockedCount": 1200
    }
  ]
}
```

## Админ-панель

### Управление достижениями

- Создание новых достижений
- Редактирование условий
- Активация/деактивация
- Загрузка иконок

### Статистика

- Общая статистика по пользователям
- Популярные достижения
- Активность по уровням
- Распределение XP

### Конструктор достижений

```typescript
// Пример создания через UI
const achievement = {
  name: "Социальный бабочка",
  description: "Подписаться на 50 человек",
  type: "social",
  condition: {
    metric: "following_count",
    target: 50,
    period: "all_time"
  },
  reward: {
    xp: 200,
    title: "🦋 Социальный бабочка"
  }
};
```

## Интеграция с социальными функциями

### Лента активности

При разблокировке достижения:
```typescript
// Создание события в ленте
activityService.create({
  type: 'achievement_unlocked',
  userId: user.id,
  data: {
    achievementId: achievement.id,
    achievementName: achievement.name
  }
});
```

### Уведомления

```typescript
// Отправка уведомления
notificationService.send({
  userId: user.id,
  type: 'achievement_unlocked',
  title: 'Новое достижение!',
  body: `Вы разблокировали "${achievement.name}"`,
  data: {
    achievementId: achievement.id
  }
});
```

### Real-time обновления

```typescript
// Через WebSocket
io.to(`user:${userId}`).emit('achievement_unlocked', {
  achievement: achievement,
  newLevel: level,
  totalXp: xp
});
```

## Таблицы базы данных

```sql
-- Достижения
achievements (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  type text NOT NULL,
  icon text,
  condition jsonb NOT NULL,
  reward jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- Прогресс пользователя
user_gamification (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  level integer DEFAULT 1,
  total_xp integer DEFAULT 0,
  current_xp integer DEFAULT 0,
  title text,
  badges jsonb DEFAULT '[]',
  updated_at timestamp DEFAULT now()
);

-- Разблокированные достижения
user_achievements (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  achievement_id uuid REFERENCES achievements(id),
  progress jsonb DEFAULT '{}',
  is_unlocked boolean DEFAULT false,
  unlocked_at timestamp,
  created_at timestamp DEFAULT now()
);

-- История XP
xp_history (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  amount integer NOT NULL,
  source text NOT NULL,
  source_id uuid,
  description text,
  created_at timestamp DEFAULT now()
);
```

## События для начисления

### Чтение

| Событие | Метрика | XP |
|---------|---------|-----|
| book_started | books_started | 10 |
| book_completed | books_completed | 100 |
| chapter_read | chapters_read | 10 |
| page_read | pages_read | 1 |

### Клубы

| Событие | Метрика | XP |
|---------|---------|-----|
| club_joined | clubs_joined | 50 |
| club_created | clubs_created | 100 |
| session_hosted | sessions_hosted | 200 |
| session_attended | sessions_attended | 50 |

### Социальное

| Событие | Метрика | XP |
|---------|---------|-----|
| post_liked | likes_received | 5 |
| comment_posted | comments_posted | 15 |
| follower_gained | followers_gained | 10 |
| invitation_accepted | invitations_accepted | 25 |

## Мониторинг

### Метрики

- DAU с геймификацией
- Средний уровень пользователя
- Количество разблокированных достижений
- Время до первого достижения
- Retention по уровням

### Алерты

- Падение активности геймификации
- Ошибки начисления XP
- Некорректные условия достижений