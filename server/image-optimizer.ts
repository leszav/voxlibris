import sharp from 'sharp';
import { logger } from './lib/logger.js';

export type ImageType = 'cover' | 'background' | 'avatar' | 'thumbnail';

interface OptimizationResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

interface OptimizationOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  fit: 'cover' | 'contain' | 'inside' | 'outside';
}

// Настройки оптимизации для разных типов изображений
const OPTIMIZATION_PRESETS: Record<ImageType, OptimizationOptions> = {
  cover: {
    maxWidth: 600,
    maxHeight: 900,
    quality: 85,
    fit: 'inside', // Сохраняет пропорции, масштабирует чтобы поместиться в размер
  },
  thumbnail: {
    maxWidth: 150,
    maxHeight: 225,
    quality: 80,
    fit: 'inside',
  },
  background: {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 80,
    fit: 'cover', // Заполняет размер, обрезая если нужно
  },
  avatar: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 85,
    fit: 'cover',
  },
};

/**
 * Оптимизирует изображение: изменяет размер и конвертирует в WebP
 * @param inputBuffer - Исходный буфер изображения
 * @param type - Тип изображения (определяет параметры оптимизации)
 * @returns Результат оптимизации с буфером и метаданными
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  type: ImageType = 'cover'
): Promise<OptimizationResult> {
  const originalSize = inputBuffer.length;
  const options = OPTIMIZATION_PRESETS[type];

  try {
    // Получаем метаданные исходного изображения
    const metadata = await sharp(inputBuffer).metadata();
    
    logger.info({
      type,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalFormat: metadata.format,
      originalSize: `${(originalSize / 1024 / 1024).toFixed(2)} MB`,
    }, '[ImageOptimizer] Processing image');

    // Оптимизируем изображение
    const optimizedBuffer = await sharp(inputBuffer)
      .rotate() // Автоматически поворачивает по EXIF
      .resize(options.maxWidth, options.maxHeight, {
        fit: options.fit,
        withoutEnlargement: true, // Не увеличивать маленькие изображения
      })
      .webp({
        quality: options.quality,
        effort: 4, // Баланс между качеством и скоростью (0-6, 4 - хороший)
      })
      .toBuffer();

    const optimizedSize = optimizedBuffer.length;
    const compressionRatio = ((1 - optimizedSize / originalSize) * 100).toFixed(1);

    logger.info({
      type,
      optimizedSize: `${(optimizedSize / 1024).toFixed(2)} KB`,
      compressionRatio: `${compressionRatio}%`,
      savings: `${((originalSize - optimizedSize) / 1024 / 1024).toFixed(2)} MB`,
    }, '[ImageOptimizer] Image optimized successfully');

    return {
      buffer: optimizedBuffer,
      mimeType: 'image/webp',
      extension: 'webp',
      originalSize,
      optimizedSize,
      compressionRatio: Number.parseFloat(compressionRatio),
    };
  } catch (error) {
    logger.error({ error, type }, '[ImageOptimizer] Failed to optimize image');
    throw new Error(`Failed to optimize image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Генерирует thumbnail из обложки книги
 * @param coverBuffer - Буфер оригинальной обложки или оптимизированной
 * @returns Буфер thumbnail
 */
export async function generateThumbnail(coverBuffer: Buffer): Promise<Buffer> {
  return (await optimizeImage(coverBuffer, 'thumbnail')).buffer;
}

/**
 * Проверяет, является ли буфер валидным изображением
 * @param buffer - Буфер для проверки
 * @returns true если это изображение
 */
export async function isValidImage(buffer: Buffer): Promise<boolean> {
  try {
    await sharp(buffer).metadata();
    return true;
  } catch {
    return false;
  }
}

/**
 * Получает метаданные изображения без оптимизации
 * @param buffer - Буфер изображения
 * @returns Метаданные изображения
 */
export async function getImageMetadata(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: buffer.length,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
    };
  } catch (error) {
    logger.error({ error }, '[ImageOptimizer] Failed to get image metadata');
    return null;
  }
}

export const imageOptimizer = {
  optimizeImage,
  generateThumbnail,
  isValidImage,
  getImageMetadata,
};
