# Tailwind CSS

## Обзор

Tailwind CSS - это утилита-first фреймворк CSS, который позволяет быстро создавать пользовательские интерфейсы без написания пользовательских стилей. В проекте VoxLibris Tailwind используется для стилизации компонентов пользовательского интерфейса.

## Конфигурационные файлы

### tailwind.config.js

Конфигурационный файл Tailwind находится в корне проекта:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        secondary: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        accent: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        error: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
        '120': '30rem',
        '128': '32rem',
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
};
```

### postcss.config.js

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Inter', sans-serif;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-bold;
  }
}

@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200;
  }

  .btn-secondary {
    @apply px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200;
  }

  .card {
    @apply bg-white rounded-lg shadow-card p-6 border border-gray-200;
  }

  .input-field {
    @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent;
  }
}

@layer utilities {
  .text-shadow {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .text-shadow-md {
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .text-shadow-lg {
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
  }
}
```

## Основные настройки

### Content Configuration

```javascript
content: [
  "./client/index.html",
  "./client/src/**/*.{js,ts,jsx,tsx}",
],
```

Это позволяет Tailwind обнаруживать классы, используемые в проекте, и генерировать только используемый CSS.

### Цветовая палитра

В проекте определены следующие цветовые палитры:

- **primary**: Основные акцентные цвета
- **secondary**: Дополнительные акцентные цвета
- **accent**: Цвета для выделения важных элементов
- **success**, **warning**, **error**: Статусные цвета
- **gray**: Нейтральные серые оттенки

### Шрифты

- **Inter**: Современный шрифт без засечек, используется как основной шрифт проекта

### Дополнительные отступы

Определены дополнительные значения отступов для более точного контроля над расположением элементов.

### Плагины

- **@tailwindcss/forms**: Обеспечивает согласованные стили для элементов форм
- **@tailwindcss/typography**: Предоставляет стили для контентных элементов
- **@tailwindcss/aspect-ratio**: Позволяет устанавливать соотношение сторон элементов

## Использование в проекте

### Классы utility-first

Вместо написания пользовательских CSS-стилей, используйте комбинации утилитных классов:

```jsx
<div className="bg-white rounded-lg shadow-card p-6 border border-gray-200">
  <h2 className="text-xl font-bold text-gray-800 mb-4">Заголовок</h2>
  <p className="text-gray-600 mb-6">Описание контента</p>
  <button className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
    Кнопка
  </button>
</div>
```

### Пользовательские компоненты

В файле `src/index.css` определены пользовательские компоненты с помощью `@apply`:

```css
.btn-primary {
  @apply px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200;
}
```

Это позволяет использовать пользовательские классы:

```jsx
<button className="btn-primary">Primary Button</button>
```

## Оптимизация для production

При сборке проекта для production, Tailwind автоматически удаляет неиспользуемые стили, что значительно уменьшает размер итогового CSS файла.

## Рекомендации

1. Используйте утилитные классы для большинства стилей, избегая написания пользовательского CSS
2. Определяйте пользовательские компоненты в `src/index.css` для часто используемых комбинаций
3. Используйте цвета из определенной палитры для обеспечения согласованности интерфейса
4. Используйте семантические имена классов при создании пользовательских компонентов
5. Проверяйте адаптивность интерфейса с помощью встроенных адаптивных классов Tailwind
6. Используйте плагины Tailwind для расширения функциональности (формы, типографика и т.д.)