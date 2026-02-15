# TypeScript

## Обзор

TypeScript используется как для фронтенд-компонента (client), так и для бэкенд-компонента (server) приложения VoxLibris. Он обеспечивает статическую типизацию, что позволяет выявлять ошибки на этапе разработки и улучшает качество кода.

## Конфигурационные файлы

### tsconfig.json

Основной файл конфигурации TypeScript для фронтенд-приложения находится в корне проекта:

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
      "@/*": ["./client/src/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["client/src", "shared"],
  "exclude": ["node_modules", "server", "dist"]
}
```

### tsconfig.server.json

Конфигурация TypeScript для бэкенд-приложения:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "NodeNext",
    "skipLibCheck": true,
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "./dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["server/**/*", "shared/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/__tests__/**"]
}
```

## Основные настройки

### Компилятор

- **target**: ES2020 - обеспечивает поддержку современных возможностей JavaScript
- **module**: ESNext для клиента, NodeNext для сервера - соответствует используемым сборщикам
- **lib**: Указывает библиотеки типов для компиляции
- **moduleResolution**: bundler для клиента, NodeNext для сервера - определяет как будут разрешаться модули

### Строгая типизация

- **strict**: true - включает все строгие проверки типов
- **noImplicitAny**: true - не позволяет использовать тип `any` неявно
- **noImplicitReturns**: true - требует возвращаемого значения для всех путей выполнения
- **noUnusedLocals** и **noUnusedParameters**: true - предупреждает о неиспользуемых переменных и параметрах

### Пути и резолюция

- **baseUrl**: "." - базовая директория для разрешения путей
- **paths**: Псевдонимы для часто используемых путей:
  - `@/*` → `./client/src/*` для фронтенд-компонентов
  - `@shared/*` → `./shared/*` для общих типов и схем

### JSX

- **jsx**: "react-jsx" - использует новый JSX трансформ для React 17+

## Общие типы

Приложение использует общие типы, определенные в директории `shared/`, которые доступны как на клиенте, так и на сервере. Это позволяет обеспечить согласованность типов между различными частями приложения.

Пример общего типа:

```typescript
// shared/types.ts
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'moderator' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}
```

## Рекомендации по использованию

1. Используйте строгую типизацию для всех функций и компонентов
2. Определяйте интерфейсы для всех API-ответов и DTO
3. Используйте общие типы из директории `shared/` для обеспечения согласованности
4. Определяйте типы для пропсов компонентов React
5. Используйте enum или union типы для фиксированных значений
6. Проверяйте типы перед коммитом с помощью `pnpm run check`