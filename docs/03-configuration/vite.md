# Vite

## Обзор

Vite - это инструмент сборки, который обеспечивает быструю загрузку и горячую замену модулей (HMR) во время разработки. В проекте VoxLibris Vite используется для сборки клиентской части приложения.

## Конфигурационный файл

Конфигурационный файл Vite находится в корне проекта и называется `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
      '@shared': '../shared',
    },
  },
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
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          ui: ['@radix-ui/react-slot', '@radix-ui/react-dialog'],
          utils: ['zod', 'react-hook-form'],
        },
      },
    },
  },
});
```

## Основные настройки

### Плагины

- **@vitejs/plugin-react**: Поддержка React и Fast Refresh
- **vite-plugin-node-polyfills**: Предоставляет полифилы для Node.js API, которые могут использоваться в браузере

### Алиасы

- **@**: Сокращение для `/src`, используется для импортов вроде `import { Component } from '@/components/Component'`
- **@shared**: Сокращение для `../shared`, используется для общих типов и утилит

### Сервер разработки

- **port**: 3000 - порт, на котором запускается клиентское приложение
- **proxy**: Проксирует `/api` и `/ws` запросы на сервер (localhost:5000)

### Сборка

- **outDir**: '../dist/client' - директория, куда помещаются собранные файлы
- **emptyOutDir**: true - очищает директорию перед каждой сборкой
- **sourcemap**: true - генерирует sourcemaps для отладки
- **manualChunks**: Оптимизация загрузки, разделяет код на логические блоки

## Скрипты в package.json

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

## Особенности конфигурации

### Проксирование запросов

Во время разработки клиент работает на порту 3000, а сервер на порту 5000. Для решения проблемы CORS, все запросы к `/api` и WebSocket подключения к `/ws` проксируются на сервер:

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

### Оптимизация загрузки

Для улучшения производительности сборка настроена на разделение кода:

```typescript
manualChunks: {
  react: ['react', 'react-dom'],
  ui: ['@radix-ui/react-slot', '@radix-ui/react-dialog'],
  utils: ['zod', 'react-hook-form'],
},
```

Это позволяет браузеру кэшировать часто используемые зависимости отдельно от основного кода приложения.

## Горячая замена модулей (HMR)

Vite обеспечивает быструю горячую замену модулей, что позволяет видеть изменения в реальном времени без перезагрузки страницы. Это особенно полезно при разработке пользовательского интерфейса.

## Параметры сборки

При сборке приложения в production:

1. Выполняется проверка типов с помощью TypeScript
2. Код минифицируется с помощью esbuild
3. Создаются уникальные имена файлов с хэшами для кэширования
4. Генерируются sourcemaps для отладки

## Режимы работы

Vite поддерживает несколько режимов работы:

- **development**: Горячая замена модулей, быстрая перезагрузка
- **production**: Минификация, оптимизация, генерация статических файлов
- **preview**: Локальный сервер для просмотра production сборки

## Рекомендации

1. Используйте алиасы для упрощения импортов и лучшей читаемости кода
2. Настройте проксирование запросов для избежания проблем с CORS во время разработки
3. Оптимизируйте загрузку с помощью manualChunks для улучшения производительности
4. Проверяйте сборку перед деплоем с помощью `vite preview`
5. Используйте переменные окружения в Vite с помощью `process.env` или `import.meta.env`