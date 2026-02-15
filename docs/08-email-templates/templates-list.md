# Список шаблонов

## Обзор

В этом разделе перечислены все шаблоны электронных писем, используемых приложением VoxLibris. Каждый шаблон предназначен для определенного типа уведомления.

## Структура файлов

Шаблоны электронных писем находятся в директории `server/templates/emails/`:

```
server/templates/emails/
├── welcome-email.tsx
├── invitation-email.tsx
├── password-reset-email.tsx
├── session-reminder-email.tsx
├── session-started-email.tsx
├── book-added-email.tsx
└── club-updated-email.tsx
```

## Основные шаблоны

### Welcome Email

**Файл:** `server/templates/emails/welcome-email.tsx`

**Назначение:** Отправляется новому зарегистрированному пользователю.

**Параметры:**
- `name` - Имя пользователя
- `email` - Email пользователя
- `welcomeMessage` - Приветственное сообщение

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/welcome-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link } from '@react-email/components';

interface WelcomeEmailProps {
  name: string;
  welcomeMessage?: string;
}

export const WelcomeEmail = ({ name, welcomeMessage }: WelcomeEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Welcome to VoxLibris!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome, {name}!</Heading>
          <Text style={paragraph}>
            {welcomeMessage || 'We are thrilled to have you join our community of readers.'}
          </Text>
          <Text style={paragraph}>
            Explore our platform to discover new books, join reading clubs, and connect with fellow readers.
          </Text>
          <Text style={paragraph}>
            <Link href="https://voxlibris.app" style={link}>
              Start exploring
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center' as const,
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

### Invitation Email

**Файл:** `server/templates/emails/invitation-email.tsx`

**Назначение:** Отправляется при приглашении в клуб.

**Параметры:**
- `inviterName` - Имя пригласившего
- `clubName` - Название клуба
- `invitationLink` - Ссылка для присоединения
- `message` - Персональное сообщение от пригласившего

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/invitation-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section, Button } from '@react-email/components';

interface InvitationEmailProps {
  inviterName: string;
  clubName: string;
  invitationLink: string;
  message?: string;
}

export const InvitationEmail = ({ 
  inviterName, 
  clubName, 
  invitationLink, 
  message 
}: InvitationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>You've been invited to join {clubName}!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>You're invited to join {clubName}!</Heading>
          <Text style={paragraph}>
            Hi there,
          </Text>
          <Text style={paragraph}>
            <strong>{inviterName}</strong> has invited you to join their reading club "<strong>{clubName}</strong>".
          </Text>
          {message && (
            <Section style={section}>
              <Text style={paragraph}>
                <em>"{message}"</em>
              </Text>
            </Section>
          )}
          <Text style={paragraph}>
            Join this club to participate in reading sessions, discussions, and literary events.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={invitationLink}>
              Join Club
            </Button>
          </Section>
          <Text style={paragraph}>
            If the button doesn't work, copy and paste this link into your browser: 
            <br />
            <Link href={invitationLink} style={link}>{invitationLink}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 16px',
};

const section = {
  margin: '16px 0',
  padding: '16px',
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#007bff',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

### Password Reset Email

**Файл:** `server/templates/emails/password-reset-email.tsx`

**Назначение:** Отправляется при запросе сброса пароля.

**Параметры:**
- `name` - Имя пользователя
- `resetLink` - Ссылка для сброса пароля
- `expiresInHours` - Время действия ссылки в часах

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/password-reset-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section, Button } from '@react-email/components';

interface PasswordResetEmailProps {
  name: string;
  resetLink: string;
  expiresInHours: number;
}

export const PasswordResetEmail = ({ 
  name, 
  resetLink, 
  expiresInHours 
}: PasswordResetEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Reset your VoxLibris password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Password Reset Request</Heading>
          <Text style={paragraph}>
            Hi {name},
          </Text>
          <Text style={paragraph}>
            We received a request to reset your password for your VoxLibris account.
          </Text>
          <Text style={paragraph}>
            Click the button below to set a new password. This link will expire in {expiresInHours} hours.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={resetLink}>
              Reset Password
            </Button>
          </Section>
          <Text style={paragraph}>
            If you didn't request a password reset, you can safely ignore this email.
          </Text>
          <Text style={paragraph}>
            If the button doesn't work, copy and paste this link into your browser: 
            <br />
            <Link href={resetLink} style={link}>{resetLink}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#dc3545',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

### Session Reminder Email

**Файл:** `server/templates/emails/session-reminder-email.tsx`

**Назначение:** Отправляется перед началом сессии чтения.

**Параметры:**
- `userName` - Имя пользователя
- `sessionTitle` - Название сессии
- `clubName` - Название клуба
- `startTime` - Время начала сессии
- `bookTitle` - Название книги
- `sessionLink` - Ссылка на сессию

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/session-reminder-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section, Button } from '@react-email/components';

interface SessionReminderEmailProps {
  userName: string;
  sessionTitle: string;
  clubName: string;
  startTime: Date;
  bookTitle: string;
  sessionLink: string;
}

export const SessionReminderEmail = ({ 
  userName, 
  sessionTitle, 
  clubName, 
  startTime, 
  bookTitle, 
  sessionLink 
}: SessionReminderEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Reminder: {sessionTitle} is starting soon</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reminder: {sessionTitle}</Heading>
          <Text style={paragraph}>
            Hi {userName},
          </Text>
          <Text style={paragraph}>
            This is a friendly reminder that the reading session "<strong>{sessionTitle}</strong>" in the <strong>{clubName}</strong> club is starting soon.
          </Text>
          <Section style={detailsSection}>
            <Text style={detailItem}>
              <strong>Book:</strong> {bookTitle}
            </Text>
            <Text style={detailItem}>
              <strong>Time:</strong> {startTime.toLocaleString()}
            </Text>
            <Text style={detailItem}>
              <strong>Club:</strong> {clubName}
            </Text>
          </Section>
          <Section style={buttonContainer}>
            <Button style={button} href={sessionLink}>
              Join Session
            </Button>
          </Section>
          <Text style={paragraph}>
            Make sure you're ready to join us for this exciting reading session!
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 16px',
};

const detailsSection = {
  margin: '16px 0',
  padding: '16px',
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
};

const detailItem = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#28a745',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

### Session Started Email

**Файл:** `server/templates/emails/session-started-email.tsx`

**Назначение:** Отправляется при начале сессии чтения.

**Параметры:**
- `userName` - Имя пользователя
- `sessionTitle` - Название сессии
- `clubName` - Название клуба
- `bookTitle` - Название книги
- `sessionLink` - Ссылка на сессию

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/session-started-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section, Button } from '@react-email/components';

interface SessionStartedEmailProps {
  userName: string;
  sessionTitle: string;
  clubName: string;
  bookTitle: string;
  sessionLink: string;
}

export const SessionStartedEmail = ({ 
  userName, 
  sessionTitle, 
  clubName, 
  bookTitle, 
  sessionLink 
}: SessionStartedEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Live now: {sessionTitle} has started!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Session Started: {sessionTitle}</Heading>
          <Text style={paragraph}>
            Hi {userName},
          </Text>
          <Text style={paragraph}>
            The reading session "<strong>{sessionTitle}</strong>" in the <strong>{clubName}</strong> club has just started!
          </Text>
          <Section style={detailsSection}>
            <Text style={detailItem}>
              <strong>Book:</strong> {bookTitle}
            </Text>
            <Text style={detailItem}>
              <strong>Club:</strong> {clubName}
            </Text>
          </Section>
          <Section style={buttonContainer}>
            <Button style={button} href={sessionLink}>
              Join Now
            </Button>
          </Section>
          <Text style={paragraph}>
            Join the session now to participate in the live reading and discussion!
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 16px',
};

const detailsSection = {
  margin: '16px 0',
  padding: '16px',
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
};

const detailItem = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#ffc107',
  color: '#212529',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

### Book Added Email

**Файл:** `server/templates/emails/book-added-email.tsx`

**Назначение:** Отправляется членам клуба при добавлении новой книги.

**Параметры:**
- `userName` - Имя пользователя
- `bookTitle` - Название добавленной книги
- `bookAuthor` - Автор книги
- `clubName` - Название клуба
- `addedBy` - Кто добавил книгу
- `bookLink` - Ссылка на книгу

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/book-added-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section, Button } from '@react-email/components';

interface BookAddedEmailProps {
  userName: string;
  bookTitle: string;
  bookAuthor: string;
  clubName: string;
  addedBy: string;
  bookLink: string;
}

export const BookAddedEmail = ({ 
  userName, 
  bookTitle, 
  bookAuthor, 
  clubName, 
  addedBy, 
  bookLink 
}: BookAddedEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>New book added to {clubName}: {bookTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>New Book Added: {bookTitle}</Heading>
          <Text style={paragraph}>
            Hi {userName},
          </Text>
          <Text style={paragraph}>
            A new book has been added to the <strong>{clubName}</strong> club by <strong>{addedBy}</strong>.
          </Text>
          <Section style={detailsSection}>
            <Text style={detailItem}>
              <strong>Title:</strong> {bookTitle}
            </Text>
            <Text style={detailItem}>
              <strong>Author:</strong> {bookAuthor}
            </Text>
            <Text style={detailItem}>
              <strong>Club:</strong> {clubName}
            </Text>
          </Section>
          <Section style={buttonContainer}>
            <Button style={button} href={bookLink}>
              View Book
            </Button>
          </Section>
          <Text style={paragraph}>
            Check out the new book and join the upcoming reading sessions!
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 16px',
};

const detailsSection = {
  margin: '16px 0',
  padding: '16px',
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
};

const detailItem = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#17a2b8',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

### Club Updated Email

**Файл:** `server/templates/emails/club-updated-email.tsx`

**Назначение:** Отправляется членам клуба при обновлении информации о клубе.

**Параметры:**
- `userName` - Имя пользователя
- `clubName` - Название клуба
- `updatedBy` - Кто обновил информацию
- `changes` - Описание изменений
- `clubLink` - Ссылка на клуб

**Используется в:** `server/services/email-service.ts`

```tsx
// server/templates/emails/club-updated-email.tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section, Button } from '@react-email/components';

interface ClubUpdatedEmailProps {
  userName: string;
  clubName: string;
  updatedBy: string;
  changes: string[];
  clubLink: string;
}

export const ClubUpdatedEmail = ({ 
  userName, 
  clubName, 
  updatedBy, 
  changes, 
  clubLink 
}: ClubUpdatedEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Updates made to {clubName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Updates to {clubName}</Heading>
          <Text style={paragraph}>
            Hi {userName},
          </Text>
          <Text style={paragraph}>
            Changes have been made to the <strong>{clubName}</strong> club by <strong>{updatedBy}</strong>.
          </Text>
          <Section style={detailsSection}>
            <Heading style={subHeading}>Changes:</Heading>
            <ul style={list}>
              {changes.map((change, index) => (
                <li key={index} style={listItem}>{change}</li>
              ))}
            </ul>
          </Section>
          <Section style={buttonContainer}>
            <Button style={button} href={clubLink}>
              View Club
            </Button>
          </Section>
          <Text style={paragraph}>
            Check out the updates to stay informed about the latest changes in your club.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  textAlign: 'center',
};

const subHeading = {
  fontSize: '18px',
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',
  margin: '0 0 12px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 16px',
};

const detailsSection = {
  margin: '16px 0',
  padding: '16px',
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
};

const list = {
  margin: '0',
  paddingLeft: '20px',
};

const listItem = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#333',
  margin: '0 0 8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#6f42c1',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const link = {
  color: '#007bff',
  textDecoration: 'underline',
};
```

## Использование шаблонов

Шаблоны используются в сервисе отправки электронной почты:

```typescript
// server/services/email-service.ts
import { Resend } from 'resend';
import { WelcomeEmail } from '../templates/emails/welcome-email';
import { InvitationEmail } from '../templates/emails/invitation-email';
import { PasswordResetEmail } from '../templates/emails/password-reset-email';
import { SessionReminderEmail } from '../templates/emails/session-reminder-email';
import { SessionStartedEmail } from '../templates/emails/session-started-email';
import { BookAddedEmail } from '../templates/emails/book-added-email';
import { ClubUpdatedEmail } from '../templates/emails/club-updated-email';

const resend = new Resend(process.env.RESEND_API_KEY);

export class EmailService {
  async sendWelcomeEmail(to: string, name: string) {
    const emailTemplate = WelcomeEmail({ name });
    
    await resend.emails.send({
      from: 'onboarding@voxlibris.app',
      to: to,
      subject: 'Welcome to VoxLibris!',
      react: emailTemplate,
    });
  }

  async sendInvitationEmail(
    to: string, 
    inviterName: string, 
    clubName: string, 
    invitationLink: string, 
    message?: string
  ) {
    const emailTemplate = InvitationEmail({ 
      inviterName, 
      clubName, 
      invitationLink, 
      message 
    });
    
    await resend.emails.send({
      from: 'noreply@voxlibris.app',
      to: to,
      subject: `You're invited to join ${clubName}`,
      react: emailTemplate,
    });
  }

  async sendPasswordResetEmail(
    to: string, 
    name: string, 
    resetLink: string, 
    expiresInHours: number
  ) {
    const emailTemplate = PasswordResetEmail({ 
      name, 
      resetLink, 
      expiresInHours 
    });
    
    await resend.emails.send({
      from: 'security@voxlibris.app',
      to: to,
      subject: 'Password Reset Request',
      react: emailTemplate,
    });
  }

  // Другие методы отправки email...
}
```

## Рекомендации

1. Используйте семантические имена для компонентов шаблонов
2. Проверяйте все ссылки на валидность перед отправкой
3. Обеспечьте адаптивность шаблонов для разных устройств
4. Тестируйте шаблоны в разных почтовых клиентах
5. Обновляйте шаблоны при изменении брендинга
6. Следите за политикой рассылки и разрешениями пользователей
7. Обеспечьте возможность отказа от рассылки
8. Используйте безопасные практики при работе с персональными данными