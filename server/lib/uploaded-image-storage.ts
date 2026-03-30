import { randomUUID } from "node:crypto";
import { fileStorage } from "../file-storage.js";
import { optimizeImage, type ImageType } from "../image-optimizer.js";
import { logger } from "./logger.js";

const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

interface PersistImageOptions {
  type: ImageType;
  keyPrefix: string;
  filenamePrefix: string;
}

function parseImageDataUrl(value: string): { mimeType: string; buffer: Buffer } | null {
  const match = value.match(IMAGE_DATA_URL_PATTERN);
  if (!match) {
    return null;
  }

  try {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

export async function storeOptimizedImageIfNeeded(
  value: string | null | undefined,
  options: PersistImageOptions,
): Promise<string | null | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const parsedImage = parseImageDataUrl(normalizedValue);
  if (!parsedImage) {
    return normalizedValue;
  }

  const optimized = await optimizeImage(parsedImage.buffer, options.type);
  const key = `${options.keyPrefix}/${options.filenamePrefix}-${randomUUID()}.${optimized.extension}`;
  const uploaded = await fileStorage.uploadFile(optimized.buffer, key, optimized.mimeType);
  const publicUrl = `/api/storage/${uploaded.key}`;

  logger.info(
    {
      key: uploaded.key,
      imageType: options.type,
      originalMimeType: parsedImage.mimeType,
      originalSize: optimized.originalSize,
      optimizedSize: optimized.optimizedSize,
      compressionRatio: optimized.compressionRatio,
    },
    "[uploaded-image-storage] Stored optimized image",
  );

  return publicUrl;
}
