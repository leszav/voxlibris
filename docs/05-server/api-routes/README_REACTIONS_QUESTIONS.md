# Reactions & Questions API

API для управления реакциями и вопросами в сессиях чтения VoxLibris Studio.

---

## Reactions API

### Добавить реакцию

**POST** `/api/reactions`

Тело запроса:
```json
{
  "sessionId": "session-id",
  "emoji": "👍",
  "type": "positive",
  "position": "123"
}
```

Параметры:
- `sessionId` (обязательно) — ID сессии
- `emoji` (обязательно) — эмодзи реакции
- `type` (опционально) — тип реакции: `positive` или `negative` (по умолчанию `positive`)
- `position` (опционально) — позиция в аудио (timestamp в секундах)

Ответ:
```json
{
  "success": true,
  "reaction": {
    "id": "reaction-id",
    "sessionId": "session-id",
    "userId": "user-id",
    "emoji": "👍",
    "type": "positive",
    "position": "123",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Получить реакции сессии

**GET** `/api/reactions/session/:sessionId`

Ответ:
```json
{
  "success": true,
  "reactions": [
    {
      "id": "reaction-id",
      "sessionId": "session-id",
      "userId": "user-id",
      "emoji": "👍",
      "type": "positive",
      "position": "123",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Получить сводку реакций

**GET** `/api/reactions/session/:sessionId/summary`

Ответ:
```json
{
  "success": true,
  "summary": {
    "positive": 15,
    "negative": 2,
    "emojiStats": {
      "👍": 8,
      "❤️": 5,
      "🔥": 2,
      "👎": 2
    },
    "total": 17
  }
}
```

### Получить реакции по типу

**GET** `/api/reactions/session/:sessionId/type/:type`

Параметры:
- `type` — тип реакции: `positive` или `negative`

Ответ:
```json
{
  "success": true,
  "reactions": [ ... ]
}
```

### Получить реакции пользователя

**GET** `/api/reactions/user/:userId`

Ответ:
```json
{
  "success": true,
  "reactions": [ ... ]
}
```

### Получить популярные эмодзи

**GET** `/api/reactions/session/:sessionId/emojis`

Ответ:
```json
{
  "success": true,
  "emojis": [
    { "emoji": "👍", "count": 8 },
    { "emoji": "❤️", "count": 5 },
    { "emoji": "🔥", "count": 2 }
  ]
}
```

### Удалить реакцию

**DELETE** `/api/reactions/:reactionId`

Ответ:
```json
{
  "success": true,
  "message": "Reaction deleted successfully"
}
```

---

## Questions API

### Задать вопрос

**POST** `/api/questions`

Тело запроса:
```json
{
  "sessionId": "session-id",
  "question": "Вопрос к чтецу"
}
```

Параметры:
- `sessionId` (обязательно) — ID сессии
- `question` (обязательно) — текст вопроса (максимум 1000 символов)

Ответ:
```json
{
  "success": true,
  "question": {
    "id": "question-id",
    "sessionId": "session-id",
    "userId": "user-id",
    "question": "Вопрос к чтецу",
    "isAnswered": false,
    "answer": null,
    "answeredAt": null,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Получить вопросы сессии

**GET** `/api/questions/session/:sessionId`

Параметры запроса:
- `includeAnswered` (опционально) — включить отвеченные вопросы (`true`/`false`)

Ответ:
```json
{
  "success": true,
  "questions": [ ... ]
}
```

### Получить неотвеченные вопросы

**GET** `/api/questions/session/:sessionId/unanswered`

Ответ:
```json
{
  "success": true,
  "questions": [ ... ],
  "count": 5
}
```

### Получить вопрос по ID

**GET** `/api/questions/:questionId`

Ответ:
```json
{
  "success": true,
  "question": { ... }
}
```

### Ответить на вопрос

**PUT** `/api/questions/:questionId/answer`

Тело запроса:
```json
{
  "answer": "Ответ на вопрос"
}
```

Параметры:
- `answer` (обязательно) — текст ответа (максимум 2000 символов)

**Примечание:** Только чтец (создатель сессии) может отвечать на вопросы.

Ответ:
```json
{
  "success": true,
  "question": {
    "id": "question-id",
    "sessionId": "session-id",
    "userId": "user-id",
    "question": "Вопрос к чтецу",
    "isAnswered": true,
    "answer": "Ответ на вопрос",
    "answeredAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Получить вопросы пользователя

**GET** `/api/questions/user/:userId`

Ответ:
```json
{
  "success": true,
  "questions": [ ... ]
}
```

### Удалить вопрос

**DELETE** `/api/questions/:questionId`

**Примечание:** Только автор вопроса или чтец может удалить вопрос.

Ответ:
```json
{
  "success": true,
  "message": "Question deleted successfully"
}
```

### Получить статистику вопросов

**GET** `/api/questions/session/:sessionId/stats`

Ответ:
```json
{
  "success": true,
  "stats": {
    "total": 20,
    "answered": 15,
    "unanswered": 5,
    "answeredRate": 75
  }
}
```

---

## WebSocket Events

Реакции и вопросы также поддерживаются через WebSocket в namespace `/reading-sessions`.

### Реакции

#### Отправить реакцию
```javascript
socket.emit('reading-session:reaction', {
  sessionId: 'session-id',
  emoji: '👍',
  type: 'positive'
});
```

#### Получить реакцию (всем в комнате)
```javascript
socket.on('reading-session:reaction', (data) => {
  console.log('Reaction:', data.emoji);
  console.log('From:', data.userId);
  console.log('Type:', data.type);
});
```

### Вопросы

#### Задать вопрос
```javascript
socket.emit('reading-session:question', {
  sessionId: 'session-id',
  question: 'Вопрос к чтецу'
});
```

#### Получить вопрос (всем в комнате)
```javascript
socket.on('reading-session:question', (data) => {
  console.log('Question:', data.question);
  console.log('From:', data.userId);
  console.log('Question ID:', data.questionId);
});
```

#### Ответить на вопрос (только для чтеца)
```javascript
socket.emit('reading-session:answer-question', {
  questionId: 'question-id',
  answer: 'Ответ на вопрос'
});
```

#### Получить ответ (всем в комнате)
```javascript
socket.on('reading-session:question-answered', (data) => {
  console.log('Answer:', data.answer);
  console.log('Question ID:', data.questionId);
});
```

---

## Предопределённые реакции

Для UI можно использовать следующий предопределённый набор:

```typescript
const REACTIONS = {
  positive: [
    { emoji: "❤️", label: "Нравится" },
    { emoji: "👍", label: "Круто" },
    { emoji: "🔥", label: "Огонь" },
    { emoji: "😍", label: "Обожаю" },
    { emoji: "👏", label: "Аплодисменты" },
    { emoji: "🎉", label: "Праздник" },
  ],
  negative: [
    { emoji: "👎", label: "Не нравится" },
    { emoji: "💩", label: "Плохо" },
    { emoji: "😴", label: "Скучно" },
    { emoji: "😕", label: "Не понял" },
    { emoji: "🤔", label: "Вопрос" },
  ],
};
```

---

## Использование с React

### Пример компонента реакций

```typescript
import { useState } from 'react';
import { api } from '@/lib/api';

export function ReactionPanel({ sessionId }: { sessionId: string }) {
  const [reactions, setReactions] = useState([]);
  const [summary, setSummary] = useState({ positive: 0, negative: 0 });

  const loadReactions = async () => {
    const data = await api.get(`/reactions/session/${sessionId}`);
    setReactions(data.reactions);
  };

  const loadSummary = async () => {
    const data = await api.get(`/reactions/session/${sessionId}/summary`);
    setSummary(data.summary);
  };

  const addReaction = async (emoji: string, type: 'positive' | 'negative') => {
    await api.post('/reactions', {
      sessionId,
      emoji,
      type,
      position: audioPlayer.currentTime,
    });
    loadReactions();
    loadSummary();
  };

  return (
    <div className="reaction-panel">
      <div className="summary">
        <span>👍 {summary.positive}</span>
        <span>👎 {summary.negative}</span>
      </div>
      <div className="emojis">
        {REACTIONS.positive.map(r => (
          <button key={r.emoji} onClick={() => addReaction(r.emoji, 'positive')}>
            {r.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Пример компонента вопросов

```typescript
import { useState } from 'react';
import { api } from '@/lib/api';

export function QuestionPanel({ sessionId, isReader }: { sessionId: string; isReader: boolean }) {
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const loadQuestions = async () => {
    const data = await api.get(`/questions/session/${sessionId}`);
    setQuestions(data.questions);
  };

  const askQuestion = async () => {
    if (!newQuestion.trim()) return;
    await api.post('/questions', { sessionId, question: newQuestion });
    setNewQuestion('');
    loadQuestions();
  };

  const answerQuestion = async (questionId: string) => {
    if (!answer.trim()) return;
    await api.put(`/questions/${questionId}/answer`, { answer });
    setAnswer('');
    loadQuestions();
  };

  return (
    <div className="question-panel">
      {!isReader && (
        <div className="ask-question">
          <textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Задайте вопрос чтецу..."
          />
          <button onClick={askQuestion}>Отправить</button>
        </div>
      )}
      <div className="questions-list">
        {questions.map(q => (
          <div key={q.id} className="question">
            <p>{q.question}</p>
            {q.isAnswered && <p className="answer">{q.answer}</p>}
            {isReader && !q.isAnswered && (
              <div className="answer-input">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Ответ на вопрос..."
                />
                <button onClick={() => answerQuestion(q.id)}>Ответить</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Rate Limiting

Все endpoints защищены rate limiting:
- Общие: 500 запросов за 15 минут
- Auth: 5 попыток за 15 минут

---

## Ошибки

### Коды ошибок

- `400` — Bad Request (неверные параметры)
- `401` — Unauthorized (требуется авторизация)
- `403` — Forbidden (нет прав доступа)
- `404` — Not Found (ресурс не найден)
- `500` — Internal Server Error

### Формат ошибок

```json
{
  "success": false,
  "error": "Описание ошибки"
}
```
