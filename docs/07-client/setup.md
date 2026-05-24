# Настройка

## Обзор

В этом разделе описана установка и настройка клиентской части приложения VoxLibris.

## Структура директории

Клиентская часть приложения находится в директории `client/`:

```
client/
├── public/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── types/
│   ├── assets/
│   └── styles/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Установка зависимостей

Для установки зависимостей клиентской части выполните команду в директории `client/`:

```bash
cd client
npm install
```

Или, если используется pnpm глобально:

```bash
cd client
pnpm install
```

## Конфигурационные файлы

### package.json

Файл `client/package.json` содержит зависимости и скрипты клиентской части:

```json
{
  "name": "voxlibris-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "tailwindcss-animate": "^1.0.7",
    "react-hook-form": "^7.47.0",
    "zod": "^3.22.4",
    "zustand": "^4.4.7",
    "wouter": "^3.0.1",
    "react-query": "^3.39.3",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@typescript-eslint/eslint-plugin": "^6.10.0",
    "@typescript-eslint/parser": "^6.10.0",
    "@vitejs/plugin-react": "^4.1.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.53.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.4",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^4.5.0"
  }
}
```

### vite.config.ts

Конфигурация Vite для сборки клиентского приложения:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
})
```

### tsconfig.json

Конфигурация TypeScript:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### tailwind.config.js

Конфигурация Tailwind CSS:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## Основные зависимости

### Основные библиотеки

- **React 19** - Библиотека для создания пользовательских интерфейсов
- **React DOM** - Пакет для рендеринга React в браузере
- **Radix UI Primitives** - Библиотека примитивных компонентов
- **Tailwind CSS** - Utility-first CSS-фреймворк
- **React Hook Form** - Библиотека для работы с формами
- **Zod** - Библиотека для валидации данных
- **Zustand** - Легковесное хранилище состояния
- **Wouter** - Простая библиотека для маршрутизации
- **React Query** - Библиотека для управления и кэширования серверных данных
- **Date-fns** - Библиотека для работы с датами

### Dev-зависимости

- **TypeScript** - Язык программирования с поддержкой статической типизации
- **Vite** - Инструмент сборки
- **@vitejs/plugin-react** - Плагин для поддержки React в Vite
- **ESLint** - Инструмент для выявления и исправления проблем в коде
- **@typescript-eslint/parser** - Парсер для ESLint

## Настройка путей

Клиентская часть использует алиасы для упрощения импортов:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Это позволяет использовать короткие пути импортов:

```typescript
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
```

## Проксирование API-запросов

В конфигурации Vite настроено проксирование запросов к API:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true,
    secure: false,
  },
  '/ws': {
    target: 'http://localhost:5000',
    changeOrigin: true,
    ws: true,
    secure: false,
  },
}
```

Это позволяет делать запросы к API с префиксом `/api` без проблем с CORS во время разработки.

## Структура исходного кода

### components/

Содержит переиспользуемые UI-компоненты:

```
client/src/components/
├── ui/
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   └── ...
├── layout/
│   ├── header.tsx
│   ├── sidebar.tsx
│   └── ...
└── forms/
    ├── login-form.tsx
    ├── signup-form.tsx
    └── ...
```

### pages/

Содержит страницы приложения:

```
client/src/pages/
├── home.tsx
├── login.tsx
├── dashboard/
│   ├── index.tsx
│   ├── clubs.tsx
│   └── ...
├── clubs/
│   ├── list.tsx
│   ├── detail.tsx
│   └── ...
└── ...
```

### hooks/

Содержит пользовательские React-хуки:

```
client/src/hooks/
├── use-auth.ts
├── use-api.ts
├── use-mobile.ts
└── ...
```

### lib/

Содержит вспомогательные библиотеки и утилиты:

```
client/src/lib/
├── api.ts
├── store.ts
├── utils.ts
├── constants.ts
└── ...
```

### services/

Содержит сервисы для взаимодействия с API:

```
client/src/services/
├── auth-service.ts
├── club-service.ts
├── book-service.ts
└── ...
```

### types/

Содержит определения типов:

```
client/src/types/
├── global.d.ts
├── api.ts
├── user.ts
├── club.ts
└── ...
```

## Запуск в режиме разработки

Для запуска клиентского приложения в режиме разработки выполните:

```bash
cd client
npm run dev
```

Приложение будет доступно по адресу [http://localhost:3000](http://localhost:3000).

## Сборка для продакшена

Для сборки клиентского приложения для продакшена выполните:

```bash
cd client
npm run build
```

Собранные файлы будут помещены в директорию `dist/client/`.

## Рекомендации

1. Используйте TypeScript для обеспечения типизации
2. Следите за размером бандла при добавлении новых зависимостей
3. Используйте lazy loading для страниц
4. Оптимизируйте компоненты с помощью React.memo и useCallback
5. Следуйте принципам доступности (a11y) при создании компонентов
6. Используйте линтинг и форматирование кода
7. Покрывайте компоненты тестами
8. Обновляйте зависимости регулярно