# Кастомизация

## Обзор

В этом разделе описаны способы настройки и изменения шаблонов электронных писем приложения VoxLibris.

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
├── club-updated-email.tsx
└── _base-template.tsx
```

## Изменение стилей

### Базовые стили

Каждый шаблон содержит встроенные стили в виде объектов. Для изменения стилей необходимо отредактировать соответствующие объекты в файле шаблона:

```tsx
// server/templates/emails/welcome-email.tsx
const main = {
  backgroundColor: '#f6f9fc',  // Изменить фон письма
  fontFamily: 'Arial, sans-serif',  // Изменить шрифт
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',  // Изменить фон контейнера
  borderRadius: '8px',  // Изменить скругление углов
};

const heading = {
  fontSize: '24px',  // Изменить размер шрифта заголовка
  lineHeight: '1.3',
  fontWeight: 'bold',
  color: '#000',  // Изменить цвет заголовка
  textAlign: 'center' as const,
};

const paragraph = {
  fontSize: '16px',  // Изменить размер шрифта параграфа
  lineHeight: '1.4',
  color: '#333',  // Изменить цвет текста
  margin: '0 0 16px',  // Изменить отступы
};

const link = {
  color: '#007bff',  // Изменить цвет ссылки
  textDecoration: 'underline',
};
```

### Создание базового шаблона

Для унификации стилей можно создать базовый шаблон:

```tsx
// server/templates/emails/_base-template.tsx
import React from 'react';
import { Body, Container, Head, Html, Preview, Text, Link } from '@react-email/components';

interface BaseEmailTemplateProps {
  children: React.ReactNode;
  previewText?: string;
  title?: string;
}

export const BaseEmailTemplate = ({ 
  children, 
  previewText = 'VoxLibris Notification',
  title = 'VoxLibris'
}: BaseEmailTemplateProps) => {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <div style={header}>
            <h1 style={headerText}>{title}</h1>
          </div>
          {children}
          <footer style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} VoxLibris. All rights reserved.
            </Text>
            <Text style={footerText}>
              <Link href="https://voxlibris.app/unsubscribe" style={unsubscribeLink}>
                Unsubscribe
              </Link>
            </Text>
          </footer>
        </Container>
      </Body>
    </Html>
  );
};

// Общие стили
export const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Arial, sans-serif',
};

export const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

export const header = {
  marginBottom: '24px',
  paddingBottom: '16px',
  borderBottom: '1px solid #e1e5e9',
};

export const headerText = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#1a1d1f',
  textAlign: 'center' as const,
  margin: 0,
};

export const footer = {
  marginTop: '32px',
  paddingTop: '16px',
  borderTop: '1px solid #e1e5e9',
  textAlign: 'center' as const,
};

export const footerText = {
  fontSize: '12px',
  color: '#6c757d',
  margin: '4px 0',
};

export const unsubscribeLink = {
  color: '#6c757d',
  textDecoration: 'underline',
};
```

Затем использовать его в других шаблонах:

```tsx
// server/templates/emails/welcome-email.tsx
import React from 'react';
import { Heading, Text, Link, Section, Button } from '@react-email/components';
import { BaseEmailTemplate, headerText } from './_base-template';

interface WelcomeEmailProps {
  name: string;
  welcomeMessage?: string;
}

export const WelcomeEmail = ({ name, welcomeMessage }: WelcomeEmailProps) => {
  return (
    <BaseEmailTemplate 
      previewText="Welcome to VoxLibris!" 
      title={`Welcome, ${name}`}
    >
      <Heading style={headerText}>Welcome, {name}!</Heading>
      <Text style={paragraph}>
        {welcomeMessage || 'We are thrilled to have you join our community of readers.'}
      </Text>
      <Text style={paragraph}>
        Explore our platform to discover new books, join reading clubs, and connect with fellow readers.
      </Text>
      <Section style={buttonContainer}>
        <Button style={button}>
          <Link href="https://voxlibris.app" style={buttonLink}>
            Start exploring
          </Link>
        </Button>
      </Section>
    </BaseEmailTemplate>
  );
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
  backgroundColor: '#007bff',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const buttonLink = {
  color: '#fff',
  textDecoration: 'none',
};
```

## Изменение содержимого

### Добавление новых элементов

Можно добавить новые элементы в шаблон, такие как изображения, кнопки или разделы:

```tsx
// server/templates/emails/welcome-email.tsx
import { Img } from '@react-email/components';

// Добавление логотипа
export const WelcomeEmail = ({ name, welcomeMessage }: WelcomeEmailProps) => {
  return (
    <BaseEmailTemplate 
      previewText="Welcome to VoxLibris!" 
      title={`Welcome, ${name}`}
    >
      <Section style={logoSection}>
        <Img 
          src="https://voxlibris.app/logo.png" 
          width="120" 
          height="40" 
          alt="VoxLibris Logo" 
          style={logo}
        />
      </Section>
      {/* ... остальное содержимое ... */}
    </BaseEmailTemplate>
  );
};

const logoSection = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const logo = {
  display: 'block',
  margin: '0 auto',
};
```

### Изменение текста

Изменение текста шаблона осуществляется путем редактирования компонентов `Text` и `Heading`:

```tsx
// До
<Text style={paragraph}>
  We are thrilled to have you join our community of readers.
</Text>

// После
<Text style={paragraph}>
  Welcome to the ultimate social reading experience! We're excited to have you aboard.
</Text>
```

## Добавление новых шаблонов

Для добавления нового шаблона создайте новый файл в директории `server/templates/emails/`:

```tsx
// server/templates/emails/new-feature-email.tsx
import React from 'react';
import { Heading, Text, Link, Section, Button } from '@react-email/components';
import { BaseEmailTemplate, headerText } from './_base-template';

interface NewFeatureEmailProps {
  name: string;
  featureName: string;
  featureDescription: string;
  featureLink: string;
}

export const NewFeatureEmail = ({ 
  name, 
  featureName, 
  featureDescription, 
  featureLink 
}: NewFeatureEmailProps) => {
  return (
    <BaseEmailTemplate 
      previewText={`New feature: ${featureName}`} 
      title="Exciting News!"
    >
      <Heading style={headerText}>Hello, {name}!</Heading>
      <Text style={paragraph}>
        We're excited to announce our newest feature: <strong>{featureName}</strong>.
      </Text>
      <Text style={paragraph}>
        {featureDescription}
      </Text>
      <Section style={buttonContainer}>
        <Button style={button}>
          <Link href={featureLink} style={buttonLink}>
            Try It Now
          </Link>
        </Button>
      </Section>
    </BaseEmailTemplate>
  );
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
  backgroundColor: '#28a745',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '4px',
  textDecoration: 'none',
  display: 'inline-block',
};

const buttonLink = {
  color: '#fff',
  textDecoration: 'none',
};
```

Затем добавьте его в сервис отправки:

```typescript
// server/services/email-service.ts
import { NewFeatureEmail } from '../templates/emails/new-feature-email';

export class EmailService {
  // ... другие методы ...
  
  async sendNewFeatureEmail(
    to: string, 
    name: string, 
    featureName: string, 
    featureDescription: string, 
    featureLink: string
  ) {
    const emailTemplate = NewFeatureEmail({ 
      name, 
      featureName, 
      featureDescription, 
      featureLink 
    });
    
    await resend.emails.send({
      from: 'updates@voxlibris.app',
      to: to,
      subject: `New Feature: ${featureName}`,
      react: emailTemplate,
    });
  }
}
```

## Тестирование изменений

### Локальное тестирование

Для тестирования шаблонов локально можно использовать React Email CLI:

```bash
# Установка CLI
npm install -g @react-email/cli

# Запуск сервера разработки
cd server/templates/emails
email dev
```

Это запустит локальный сервер, где можно просматривать шаблоны в реальном времени.

### Проверка совместимости

Для проверки совместимости с почтовыми клиентами:

```bash
# Сборка шаблонов
email build

# Проверка HTML-результата
email preview
```

## Рекомендации по кастомизации

1. **Используйте встроенные стили** - Почтовые клиенты плохо поддерживают внешние стили
2. **Тестируйте на разных устройствах** - Проверяйте, как письмо выглядит на мобильных устройствах
3. **Следите за размером письма** - Не превышайте 100 КБ для лучшей совместимости
4. **Используйте табличную верстку** - Некоторые почтовые клиенты не поддерживают Flexbox и Grid
5. **Проверяйте доступность** - Используйте атрибуты `alt` для изображений
6. **Следите за брендированием** - Поддерживайте единый стиль во всех письмах
7. **Тестируйте с реальными почтовыми клиентами** - Используйте сервисы вроде Litmus или Email on Acid для проверки рендеринга
8. **Обновляйте шаблоны по мере изменения брендинга** - Поддерживайте актуальность дизайна

## Переменные окружения

Для кастомизации некоторых аспектов шаблонов можно использовать переменные окружения:

```typescript
// server/services/email-service.ts
const BRAND_NAME = process.env.BRAND_NAME || 'VoxLibris';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@voxlibris.app';
const APP_URL = process.env.APP_URL || 'https://voxlibris.app';

export class EmailService {
  async sendWelcomeEmail(to: string, name: string) {
    // Использование переменных в шаблоне
    const emailTemplate = WelcomeEmail({ 
      name, 
      brandName: BRAND_NAME,
      supportEmail: SUPPORT_EMAIL
    });
    
    await resend.emails.send({
      from: `noreply@${BRAND_NAME.toLowerCase().replace(/\s+/g, '')}.app`,
      to: to,
      subject: `Welcome to ${BRAND_NAME}!`,
      react: emailTemplate,
    });
  }
}
```

Таким образом, можно легко адаптировать шаблоны под различные бренды или среды развертывания.