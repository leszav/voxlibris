import { AIMemoryManager } from './manager.js';

/**
 * Демо-пример использования AI Memory системы
 * Запуск: npx tsx server/ai-memory/test-example.ts
 */

async function demoAIMemory() {
  console.log('🧠 Демонстрация AI Memory системы\n');

  // Инициализация
  const memoryManager = new AIMemoryManager({
    maxContextSize: 10000,
    retentionDays: 7,
    priorityThreshold: 1
  });

  await memoryManager.initialize();

  const userId = 'demo-user-123';
  const sessionId = 'demo-session-456';

  // 1. Сохраняем различные типы воспоминаний
  console.log('📝 Сохраняем воспоминания...');
  
  await memoryManager.addToMemory(
    `Пользователь работает над проектом xLibris - системой для чтения книг онлайн. 
    Основные технологии: React, TypeScript, Express.js, PostgreSQL`,
    'context',
    sessionId,
    userId
  );

  await memoryManager.addToMemory(
    `РЕШЕНИЕ: Исправлен конфликт портов между клиентом (3000) и сервером (5000). 
    Клиент теперь корректно подключается к API.`,
    'solution',
    sessionId,
    userId,
    ['server/index.ts', 'client/vite.config.ts']
  );

  await memoryManager.addToMemory(
    `ERROR: TypeError при попытке загрузки книги в Reader Studio. 
    Проблема в отсутствующем API endpoint для загрузки контента.`,
    'error',
    sessionId,
    userId,
    ['client/src/pages/reader-studio.tsx']
  );

  await memoryManager.addToMemory(
    `function uploadBook(file: File) {
      const formData = new FormData();
      formData.append('book', file);
      return fetch('/api/books/upload', { method: 'POST', body: formData });
    }`,
    'code',
    sessionId,
    userId,
    ['client/src/lib/api.ts']
  );

  await memoryManager.addToMemory(
    `РЕШЕНИЕ: Создан API endpoint /api/books/upload для загрузки EPUB/FB2 файлов. 
    Интегрирована поддержка multer middleware.`,
    'solution',
    sessionId,
    userId,
    ['server/routes/books.ts']
  );

  console.log('✅ Воспоминания сохранены\n');

  // 2. Поиск релевантного контекста
  console.log('🔍 Тестируем поиск релевантного контекста...\n');
  
  const queries = [
    'проблемы с загрузкой книг',
    'исправление портов',
    'TypeScript код для API',
    'xLibris проект'
  ];

  for (const query of queries) {
    console.log(`📋 Запрос: "${query}"`);
    const context = await memoryManager.getRelevantContext(query, userId, sessionId);
    
    if (context) {
      console.log(`🎯 Найденный контекст:\n${context.substring(0, 200)}...\n`);
    } else {
      console.log('❌ Контекст не найден\n');
    }
  }

  // 3. Создаем сводку сессии
  console.log('📊 Создаем сводку сессии...');
  const sessionSummary = await memoryManager.createSessionSummary(sessionId, userId);
  console.log(`\n${sessionSummary}\n`);

  // 4. Поиск по типам
  console.log('🔎 Поиск решений...');
  const solutions = await memoryManager.searchByType('solution', userId, 5);
  console.log(`Найдено решений: ${solutions.length}`);
  solutions.forEach((solution, index) => {
    console.log(`${index + 1}. [${solution.metadata.priority}⭐] ${solution.content.substring(0, 100)}...`);
  });

  // 5. Поиск по тегам  
  console.log('\n🏷️ Поиск по тегу "typescript"...');
  const typeScriptMemories = await memoryManager.searchByTag('typescript', userId, 3);
  console.log(`Найдено: ${typeScriptMemories.length} воспоминаний с тегом "typescript"`);

  console.log('\n🎉 Демонстрация завершена! AI Memory система работает корректно.');
}

// Запуск демо только если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  demoAIMemory().catch(console.error);
}

export { demoAIMemory };