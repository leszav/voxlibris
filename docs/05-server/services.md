# Сервисы

## Обзор

Сервисы в VoxLibris содержат бизнес-логику приложения. Они абстрагируют сложные операции и обеспечивают интерфейс для маршрутов и других компонентов. Сервисы находятся в директории `server/services/`.

## Структура файлов

```
server/services/
├── user-service.ts
├── club-service.ts
├── book-service.ts
├── reading-session-service.ts
├── notification-service.ts
├── email-service.ts
├── analytics-service.ts
├── scheduler.ts
├── recording-service.ts
├── club-popularity-service.ts
└── session-analytics-service.ts
```

## User Service

### server/services/user-service.ts

Сервис управления пользователями:

```typescript
class UserService {
  async createUser(userData: CreateUserInput): Promise<User>;
  async getUserById(id: number): Promise<User | null>;
  async getUserByEmail(email: string): Promise<User | null>;
  async updateUser(id: number, userData: UpdateUserInput): Promise<User>;
  async deleteUser(id: number): Promise<void>;
  async changePassword(userId: number, newPassword: string): Promise<void>;
  async updateProfilePicture(userId: number, picturePath: string): Promise<void>;
}
```

## Club Service

### server/services/club-service.ts

Сервис управления клубами и участниками:

```typescript
class ClubService {
  async createClub(clubData: CreateClubInput, ownerId: number): Promise<Club>;
  async getClubById(id: number): Promise<Club | null>;
  async getPublicClubs(limit?: number, offset?: number): Promise<Club[]>;
  async getUserClubs(userId: number): Promise<Club[]>;
  async updateClub(id: number, clubData: UpdateClubInput): Promise<Club>;
  async deleteClub(id: number): Promise<void>;
  async inviteMember(clubId: number, inviterId: number): Promise<string>; // возвращает токен приглашения
  async joinClub(clubId: number, userId: number, token: string): Promise<void>;
  async removeMember(clubId: number, adminId: number, memberId: number): Promise<void>;
  async transferOwnership(clubId: number, currentOwnerId: number, newOwnerId: number): Promise<void>;
}
```

## Book Service

### server/services/book-service.ts

Сервис управления книгами:

```typescript
class BookService {
  async uploadBook(file: File, uploaderId: number, isPersonal: boolean, clubId?: number): Promise<Book>;
  async getBookById(id: number): Promise<Book | null>;
  async getUserBooks(userId: number): Promise<Book[]>;
  async getClubBooks(clubId: number): Promise<Book[]>;
  async deleteBook(id: number, userId: number): Promise<void>;
  async parseBookContent(bookId: number): Promise<ParsedBookContent>;
  async updateBookMetadata(id: number, metadata: UpdateBookMetadataInput): Promise<Book>;
}
```

## Reading Session Service

### server/services/reading-session-service.ts

Сервис управления сессиями чтения:

```typescript
class ReadingSessionService {
  async createSession(sessionData: CreateSessionInput): Promise<ReadingSession>;
  async getSessionById(id: number): Promise<ReadingSession | null>;
  async getClubSessions(clubId: number): Promise<ReadingSession[]>;
  async joinSession(sessionId: number, userId: number): Promise<void>;
  async leaveSession(sessionId: number, userId: number): Promise<void>;
  async updateProgress(sessionId: number, userId: number, progress: ProgressUpdate): Promise<void>;
  async controlPlayback(sessionId: number, userId: number, controlAction: PlaybackControl): Promise<void>;
  async endSession(sessionId: number, userId: number): Promise<void>;
  async getActiveSessions(): Promise<ReadingSession[]>;
}
```

## Notification Service

### server/services/notification-service.ts

Сервис управления уведомлениями:

```typescript
class NotificationService {
  async createNotification(notificationData: CreateNotificationInput): Promise<Notification>;
  async getUserNotifications(userId: number, limit?: number, offset?: number): Promise<Notification[]>;
  async markAsRead(notificationId: number, userId: number): Promise<void>;
  async markAllAsRead(userId: number): Promise<void>;
  async deleteNotification(notificationId: number, userId: number): Promise<void>;
  async subscribeToNotifications(userId: number, sessionId: number): Promise<void>;
  async unsubscribeFromNotifications(userId: number, sessionId: number): Promise<void>;
}
```

## Email Service

### server/services/email-service.ts

Сервис отправки email-уведомлений:

```typescript
class EmailService {
  async sendInvitationEmail(inviteeEmail: string, clubName: string, invitationLink: string): Promise<void>;
  async sendPasswordResetEmail(userEmail: string, resetLink: string): Promise<void>;
  async sendWelcomeEmail(userEmail: string): Promise<void>;
  async sendSessionReminder(clubMembers: User[], sessionInfo: SessionInfo): Promise<void>;
  async sendScheduledEmail(to: string, subject: string, html: string, scheduledTime: Date): Promise<void>;
}
```

## Analytics Service

### server/services/analytics-service.ts

Сервис сбора и анализа данных:

```typescript
class AnalyticsService {
  async trackEvent(eventData: AnalyticsEvent): Promise<void>;
  async getUserActivity(userId: number): Promise<UserActivity[]>;
  async getClubPopularity(clubId: number): Promise<ClubPopularityMetrics>;
  async getReadingProgress(sessionId: number): Promise<ReadingProgressMetrics>;
  async getPlatformKPIs(): Promise<KPIData>;
  async generateReadingReport(userId: number, period: ReportPeriod): Promise<ReadingReport>;
}
```

## Scheduler Service

### server/services/scheduler.ts

Сервис планирования задач:

```typescript
class SchedulerService {
  async scheduleSession(sessionData: ScheduledSession): Promise<ScheduledSession>;
  async cancelScheduledSession(sessionId: number): Promise<void>;
  async updateScheduledSession(sessionId: number, newData: ScheduledSession): Promise<ScheduledSession>;
  async getUpcomingSessions(userId: number): Promise<ScheduledSession[]>;
  async notifyAboutUpcomingSession(sessionId: number): Promise<void>;
  async scheduleTask(task: ScheduledTask): Promise<void>;
}
```

## Recording Service

### server/services/recording-service.ts

Сервис управления записями сессий:

```typescript
class RecordingService {
  async startRecording(sessionId: number): Promise<void>;
  async stopRecording(sessionId: number): Promise<void>;
  async getRecordingsBySession(sessionId: number): Promise<Recording[]>;
  async getRecordingsByClub(clubId: number): Promise<Recording[]>;
  async getRecordingById(recordingId: number): Promise<Recording | null>;
  async deleteRecording(recordingId: number): Promise<void>;
  async publishRecording(recordingId: number): Promise<void>;
}
```

## Club Popularity Service

### server/services/club-popularity-service.ts

Сервис анализа популярности клубов:

```typescript
class ClubPopularityService {
  async calculatePopularity(clubId: number): Promise<number>;
  async getPopularClubs(limit?: number): Promise<ClubWithPopularity[]>;
  async getTrendingClubs(limit?: number): Promise<ClubWithPopularity[]>;
  async updatePopularityFactors(clubId: number): Promise<void>;
  async getPopularityHistory(clubId: number, period: TimePeriod): Promise<PopularityHistory[]>;
}
```

## Session Analytics Service

### server/services/session-analytics-service.ts

Сервис аналитики сессий чтения:

```typescript
class SessionAnalyticsService {
  async recordSessionStart(sessionId: number, participants: number): Promise<void>;
  async recordSessionEnd(sessionId: number, duration: number): Promise<void>;
  async recordUserParticipation(sessionId: number, userId: number, joinTime: Date): Promise<void>;
  async recordProgressSync(sessionId: number, userId: number, position: number): Promise<void>;
  async recordReaction(sessionId: number, userId: number, reaction: ReactionType): Promise<void>;
  async recordQuestion(sessionId: number, userId: number, question: string): Promise<void>;
  async getSessionStats(sessionId: number): Promise<SessionStats>;
  async getClubStats(clubId: number): Promise<ClubStats>;
}
```

## Архитектурные принципы

### Единая ответственность

Каждый сервис отвечает за определенную область функциональности. Например, `UserService` отвечает только за пользователей, а `ClubService` - только за клубы.

### Инкапсуляция

Сервисы инкапсулируют бизнес-логику и скрывают детали реализации. Внешние компоненты взаимодействуют с сервисами только через публичные методы.

### Независимость

Сервисы максимально независимы друг от друга, что упрощает тестирование и сопровождение.

### Безопасность

Сервисы проверяют права доступа к ресурсам. Например, `ClubService` проверяет, является ли пользователь владельцем или модератором клуба перед выполнением действий.

## Взаимодействие с репозиториями

Сервисы взаимодействуют с базой данных через репозитории:

```typescript
import { UserRepository } from '../repositories/UserRepository';
import { ClubRepository } from '../repositories/ClubRepository';

class UserService {
  private userRepository: UserRepository;
  private clubRepository: ClubRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.clubRepository = new ClubRepository();
  }

  async getUserById(id: number): Promise<User | null> {
    return await this.userRepository.findById(id);
  }

  async createUser(userData: CreateUserInput): Promise<User> {
    // Бизнес-логика создания пользователя
    const user = await this.userRepository.create(userData);
    // Отправка приветственного email
    await EmailService.sendWelcomeEmail(user.email);
    return user;
  }
}
```

## Обработка ошибок

Сервисы выбрасывают специфичные ошибки, которые могут быть обработаны на уровне маршрутов:

```typescript
class ClubService {
  async joinClub(clubId: number, userId: number, token: string): Promise<void> {
    const invitation = await this.invitationRepository.findByToken(token);
    if (!invitation || invitation.clubId !== clubId) {
      throw new UnauthorizedError("Invalid invitation token");
    }
    
    const club = await this.clubRepository.findById(clubId);
    if (!club) {
      throw new NotFoundError("Club not found");
    }
    
    // Проверка, не является ли пользователь уже участником
    const isMember = await this.clubRepository.isUserMember(clubId, userId);
    if (isMember) {
      throw new BadRequestError("User is already a member of this club");
    }
    
    await this.clubRepository.addMember(clubId, userId);
  }
}
```

## Рекомендации

1. Держите методы сервисов сфокусированными на одной задаче
2. Валидируйте входные данные на уровне сервисов
3. Используйте транзакции при необходимости согласованности данных
4. Обрабатывайте ошибки и выбрасывайте специфичные исключения
5. Используйте логирование для отладки и мониторинга
6. Покрывайте методы сервисов юнит-тестами
7. Обновляйте документацию при изменении интерфейсов сервисов