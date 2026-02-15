# Сборка

## Обзор

В этом разделе описан процесс сборки приложения VoxLibris для различных сред (development, staging, production). Сборка включает в себя компиляцию TypeScript, объединение модулей, оптимизацию ресурсов и подготовку приложения к деплою.

## Структура файлов

Конфигурационные файлы сборки находятся в корне проекта:

```
/
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── package.json
├── client/
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── server/
    ├── tsconfig.json
    └── database/
        └── migrate.ts
```

## Конфигурация TypeScript

### tsconfig.json (корневой)

Конфигурационный файл TypeScript для всего приложения:

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
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["server/**/*", "shared/**/*"],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./client/tsconfig.json" }
  ]
}
```

### tsconfig.node.json

Конфигурация для компиляции файлов сборки и серверной части:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "server/**/*"]
}
```

### client/tsconfig.json

Конфигурация TypeScript для клиентской части:

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
      "@/*": ["./src/*"],
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## Конфигурация Vite

### vite.config.ts (корневой)

Конфигурационный файл Vite для серверной части:

```typescript
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        server: './server/index.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
  ssr: {
    noExternal: ['some-necessary-dependencies'],
  },
});
```

### client/vite.config.ts

Конфигурационный файл Vite для клиентской части:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
  ],
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
          routing: ['wouter'],
        },
      },
    },
  },
});
```

## Скрипты сборки

### package.json

Скрипты сборки определены в корневом файле `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm:dev:*\"",
    "dev:server": "tsx watch --env-file=.env ./server/index.ts",
    "dev:client": "cd client && vite",
    "build": "npm run build:server && npm run build:client",
    "build:server": "rimraf dist && tsc --project tsconfig.server.json",
    "build:client": "cd client && npm run build",
    "start": "NODE_ENV=production node dist/server/index.js",
    "start:dev": "npm run dev",
    "lint": "eslint . --ext .ts,.tsx --fix",
    "check": "tsc --noEmit"
  }
}
```

### Пояснение скриптов

- `dev`: Запускает сервер и клиент одновременно с помощью `concurrently`
- `dev:server`: Запускает сервер в режиме watch с автоматической перезагрузкой
- `dev:client`: Запускает клиентскую часть с помощью Vite
- `build`: Выполняет полную сборку серверной и клиентской частей
- `build:server`: Компилирует TypeScript серверной части в JavaScript
- `build:client`: Собирает клиентскую часть с оптимизациями
- `start`: Запускает собранное production приложение
- `lint`: Проверяет и исправляет код с помощью ESLint
- `check`: Проверяет типы TypeScript без генерации файлов

## Процесс сборки

### Сборка серверной части

1. Очистка предыдущей сборки:
   ```bash
   rimraf dist
   ```

2. Компиляция TypeScript:
   ```bash
   tsc --project tsconfig.server.json
   ```

3. Результат:
   - TypeScript файлы компилируются в JavaScript
   - Файлы сохраняются в директорию `dist/`
   - Сохраняется структура директорий

### Сборка клиентской части

1. Вход в директорию клиента:
   ```bash
   cd client
   ```

2. Сборка с помощью Vite:
   ```bash
   npm run build
   ```

3. Результат:
   - Создается оптимизированный production бандл
   - Статические ресурсы обрабатываются и минифицируются
   - Результат сохраняется в `dist/client/`

## Оптимизации сборки

### Модульные чанки

Vite позволяет разбивать код на модульные чанки для оптимизации загрузки:

```typescript
manualChunks: {
  react: ['react', 'react-dom'],
  ui: ['@radix-ui/react-slot', '@radix-ui/react-dialog'],
  utils: ['zod', 'react-hook-form'],
  routing: ['wouter'],
},
```

Это позволяет браузеру кэшировать часто используемые зависимости отдельно от основного кода приложения.

### Sourcemaps

В процессе сборки генерируются sourcemaps для упрощения отладки:

```typescript
build: {
  sourcemap: true,
}
```

### Минификация

Vite автоматически минифицирует код при сборке в production режиме с помощью esbuild и Terser.

## Переменные окружения

В процессе сборки учитываются переменные окружения:

```typescript
server: {
  proxy: {
    '/api': {
      target: process.env.API_TARGET || 'http://localhost:5000',
      changeOrigin: true,
      secure: false,
    },
  },
}
```

## Проверка перед сборкой

Перед выполнением сборки рекомендуется выполнить проверки:

1. Проверка типов:
   ```bash
   pnpm run check
   ```

2. Проверка линтером:
   ```bash
   pnpm run lint
   ```

3. Запуск тестов:
   ```bash
   pnpm run test
   ```

## Ошибки сборки

Частые ошибки сборки и их решения:

1. **TS2307: Cannot find module**:
   - Проверьте правильность путей в `tsconfig.json`
   - Убедитесь, что файл существует

2. **Module not found**:
   - Убедитесь, что зависимость установлена
   - Проверьте регистр файлов

3. **Maximum call stack size exceeded**:
   - Проверьте циклические импорты
   - Разделите большие файлы на модули

## Рекомендации

1. Используйте разные конфигурации TypeScript для разных частей приложения
2. Проверяйте типы перед сборкой
3. Используйте оптимизации бандла для уменьшения размера
4. Генерируйте sourcemaps для production сборки
5. Используйте CI для автоматической проверки сборки
6. Регулярно обновляйте зависимости
7. Используйте разные конфигурации для разных сред
8. Следите за размером бандла
9. Используйте кэширование в CI для ускорения сборки
10. Документируйте процесс сборки для других разработчиков