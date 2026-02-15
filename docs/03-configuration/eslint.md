# ESLint

## Обзор

ESLint используется для обеспечения качества кода и соблюдения стиля программирования в проекте VoxLibris. Он проверяет синтаксис, находит потенциальные ошибки и обеспечивает единообразие кода во всем проекте.

## Конфигурационные файлы

### .eslintrc

Конфигурационный файл ESLint находится в корне проекта:

```json
{
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/recommended",
    "plugin:import/errors",
    "plugin:import/warnings"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": [
    "@typescript-eslint",
    "react",
    "import"
  ],
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  },
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "no-duplicate-imports": "error",
    "prefer-const": "error",
    "no-var": "error",
    "object-shorthand": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "react/react-in-jsx-scope": "off",
    "react/jsx-uses-react": "off",
    "react/prop-types": "off",
    "import/order": [
      "error",
      {
        "groups": [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index"
        ],
        "pathGroups": [
          {
            "pattern": "@/**",
            "group": "internal"
          },
          {
            "pattern": "@shared/**",
            "group": "internal"
          }
        ],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ]
  }
}
```

### package.json скрипты

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx --fix",
    "lint:check": "eslint . --ext .ts,.tsx"
  }
}
```

## Основные настройки

### Правила кода

- **no-console**: предупреждает об использовании `console.log`
- **no-unused-vars**: ошибка при неиспользуемых переменных
- **no-duplicate-imports**: ошибка при дублировании импортов
- **prefer-const**: рекомендует использовать `const` вместо `let`
- **no-var**: запрещает использование `var`
- **object-shorthand**: требует сокращённого синтаксиса объектов

### Правила TypeScript

- **@typescript-eslint/no-unused-vars**: ошибка при неиспользуемых переменных (TypeScript версия)
- **@typescript-eslint/no-explicit-any**: предупреждение при использовании типа `any`
- **@typescript-eslint/explicit-function-return-type**: отключено для удобства
- **@typescript-eslint/explicit-module-boundary-types**: отключено для удобства

### Правила React

- **react/react-in-jsx-scope**: отключено, так как React автоматически импортируется в JSX файлах
- **react/prop-types**: отключено, используется TypeScript вместо PropTypes
- **react/jsx-uses-react**: отключено для новых версий React

### Правила импортов

- **import/order**: обеспечивает последовательный порядок импортов:
  - builtin (встроенные модули Node.js)
  - external (npm пакеты)
  - internal (@/* и @shared/* пути)
  - parent (../)
  - sibling (./)
  - index (./index.js)

## Интеграция с редактором

Для корректной работы ESLint в редакторе кода (например, VSCode) требуется установка соответствующего расширения. После установки расширения ошибки будут отображаться в редакторе в режиме реального времени.

### VSCode настройки

```json
{
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Автоматические проверки

ESLint интегрирован в процесс разработки:

1. **При коммите**: lint-staged запускает ESLint только для измененных файлов
2. **При сборке**: проверка типов и линтинг выполняются перед созданием билда
3. **В CI/CD**: автоматические проверки при каждом пуше и PR

## Пользовательские правила

### Порядок импортов

ESLint проверяет порядок импортов согласно настройкам в `.eslintrc`. Правильный порядок:

```typescript
// builtin
import fs from 'fs';

// external
import React from 'react';
import { useState } from 'react';

// internal
import { User } from '@/types';
import { api } from '@shared/api';

// parent
import { utils } from '../utils';

// sibling
import { Button } from './Button';

// index
import { config } from './index';
```

## Игнорирование правил

В особых случаях можно игнорировать правило ESLint с помощью комментариев:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = fetchData();
```

Или отключить правило для всего файла:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// код файла
```

## Рекомендации

1. Используйте `pnpm run lint` для автоматического исправления большинства проблем
2. Настройте ваш редактор для отображения ошибок ESLint в реальном времени
3. Следуйте установленному порядку импортов для согласованности кода
4. Избегайте использования `any`, особенно в новых компонентах
5. Используйте `pnpm run lint:check` для проверки без исправлений перед коммитом