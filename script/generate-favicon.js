#!/usr/bin/env node

/**
 * Скрипт для генерации фавиконки VoxLibris
 * Создает SVG файл
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgContent = `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle with VoxLibris purple -->
  <circle cx="128" cy="128" r="128" fill="#8B5CF6" />
  
  <!-- Book illustration -->
  <g transform="translate(64, 64)">
    <!-- Left page -->
    <path
      d="M10 10 L10 108 C10 115 15 120 25 118 L60 110 L60 5 C50 7 15 10 10 10Z"
      fill="white"
      opacity="0.95"
    />
    
    <!-- Right page -->
    <path
      d="M118 10 C113 10 78 7 68 5 L68 110 L103 118 C113 120 118 115 118 108 L118 10Z"
      fill="white"
      opacity="0.95"
    />
    
    <!-- Book spine -->
    <rect x="60" y="5" width="8" height="113" fill="#E0E7FF" />
    
    <!-- Audio waves overlay -->
    <g transform="translate(64, 40)">
      <!-- Center wave (tallest) -->
      <line x1="0" y1="20" x2="0" y2="40" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" />
      
      <!-- Side waves -->
      <line x1="-12" y1="25" x2="-12" y2="35" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" />
      <line x1="12" y1="25" x2="12" y2="35" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" />
      
      <!-- Outer waves (smallest) -->
      <line x1="-24" y1="28" x2="-24" y2="32" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" />
      <line x1="24" y1="28" x2="24" y2="32" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" />
    </g>
  </g>
</svg>`;

// Сохраняем SVG
const publicDir = path.join(__dirname, '../client/public');
const svgPath = path.join(publicDir, 'favicon.svg');

try {
  fs.writeFileSync(svgPath, svgContent);
  console.log('✅ Фавиконка создана: favicon.svg');
  console.log('📝 Файл сохранен в:', svgPath);
  console.log('\n💡 Для использования PNG версии можно:');
  console.log('   1. Открыть SVG в браузере');
  console.log('   2. Сделать скриншот размером 256x256');
  console.log('   3. Или использовать онлайн конвертер SVG→PNG');
} catch (error) {
  console.error('❌ Ошибка при создании фавиконки:', error);
  process.exit(1);
}
