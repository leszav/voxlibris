import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import * as mime from "mime-types";
import * as path from "node:path";

export interface FileUploadResult {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export interface FileMetadata {
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

export class FileStorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const region = process.env.S3_REGION || 'us-east-1';
    
    this.bucketName = process.env.S3_BUCKET || 'xlibris-books';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 configuration is missing. Please check environment variables.');
    }

    // Конфигурация по принципам Quark: "Явность вместо магии"
    // Отключаем все "умные эвристики" AWS SDK для совместимости с MinIO
    this.s3Client = new S3Client({
      endpoint, // Явно указываем endpoint - КЛЮЧЕВОЕ для MinIO
      region, // MinIO не использует регионы, но SDK требует значение
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // Критически важные параметры для MinIO совместимости
      forcePathStyle: true, // Обязательно! Иначе bucket.name.s3...
      bucketEndpoint: false, // Отключаем bucket-style URLs
      useAccelerateEndpoint: false, // Отключаем AWS Transfer Acceleration
      useDualstackEndpoint: false, // Отключаем IPv6 dual-stack
      useFipsEndpoint: false, // Отключаем FIPS endpoints
      // Отключаем проблемные middleware и автонастройки
      disableHostPrefix: true, // Критично для MinIO
      maxAttempts: 1, // Отключаем retry логику AWS
    });
    
    console.log(`🔧 [FileStorage] S3 Client configured for MinIO (Quark principles):`);
    console.log(`   Endpoint: ${endpoint} (explicit)`);
    console.log(`   Region: ${region} (required by SDK)`);
    console.log(`   Bucket: ${this.bucketName}`);
    console.log(`   Access Key: ${accessKeyId.substring(0, 4)}***`);
    console.log(`   Force Path Style: true (MinIO requirement)`);
    console.log(`   AWS Smart Features: disabled (compatibility)`);
  }

  /**
   * Инициализирует bucket если он не существует
   */
  private async ensureBucketExists(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this._initializeBucket();
    await this.initPromise;
  }

  private async _initializeBucket(): Promise<void> {
    try {
      // Проверяем существование bucket
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: '.bucket-check'
      }));
      
      this.isInitialized = true;
      console.log(`✅ [FileStorage] Bucket "${this.bucketName}" is accessible`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Bucket или объект не найден - пробуем создать bucket
        try {
          console.log(`🗄️ [FileStorage] Bucket initialization: ${this.bucketName}`);
          await this.s3Client.send(new CreateBucketCommand({
            Bucket: this.bucketName
          }));
          console.log(`✅ [FileStorage] Created bucket: ${this.bucketName}`);
          this.isInitialized = true;
        } catch (createError: any) {
          if (createError.name === 'BucketAlreadyOwnedByYou' ||
              createError.name === 'BucketAlreadyExists') {
            console.log(`✅ [FileStorage] Bucket "${this.bucketName}" already exists`);
            this.isInitialized = true;
          } else {
            console.error('❌ [FileStorage] Bucket creation failed:', createError.message);
            throw new Error(`Failed to initialize storage bucket: ${createError.message}`);
          }
        }
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('MinIO/S3 service is not running. Please start it with: docker compose up minio -d');
      } else {
        throw new Error(`Storage initialization failed: ${error.message}`);
      }
    }
  }

  /**
   * Генерирует уникальный ключ для файла
   */
  private generateFileKey(originalName: string, prefix?: string): string {
    const ext = path.extname(originalName);
    const uuid = randomUUID();
    
    // Для безопасности и читаемости используем только UUID + расширение
    // Оригинальное имя сохраняется в метаданных
    const key = prefix
      ? `${prefix}/${uuid}${ext}`
      : `books/${uuid}${ext}`;
    
    console.log(`🔑 [FileStorage] Generated key: ${originalName} -> ${key}`);
    return key;
  }

  /**
   * Загружает файл в S3-совместимое хранилище
   */
  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    contentType?: string,
    prefix?: string
  ): Promise<FileUploadResult> {
    // Убеждаемся что bucket существует перед загрузкой
    await this.ensureBucketExists();
    let key: string;

    // If caller provided a path-like originalName (contains '/'), treat it as explicit key
    if (originalName?.includes('/')) {
      // strip leading slash if present
      key = originalName.startsWith('/') ? originalName.slice(1) : originalName;
      console.log(`📤 [FileStorage] Using explicit key from originalName: ${originalName} -> ${key}`);
    } else {
      key = this.generateFileKey(originalName, prefix);
    }
    const detectedContentType = contentType || mime.lookup(originalName) || 'application/octet-stream';

    try {
      console.log(`📤 [FileStorage] Uploading file: ${originalName} -> ${key}`);
      
      // Используем прямой PutObjectCommand для MinIO
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: detectedContentType,
        Metadata: {
          // Кодируем имя файла в Base64 для безопасной передачи кириллицы в HTTP заголовках
          'original-name': Buffer.from(originalName || key, 'utf-8').toString('base64'),
          'uploaded-at': new Date().toISOString(),
        },
      });

      await this.s3Client.send(command);
      
      console.log(`✅ [FileStorage] File uploaded successfully: ${key}`);

      return {
        key,
        url: `${process.env.S3_ENDPOINT}/${this.bucketName}/${key}`,
        contentType: detectedContentType,
        size: fileBuffer.length,
      };
    } catch (error) {
      console.error('❌ [FileStorage] Upload failed:', error);
      console.error('❌ [FileStorage] Error details:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Получает файл из хранилища
   */
  async getFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('File not found');
      }

      // Конвертируем stream в buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as Readable;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error getting file from S3:', error);
      // Try fallback: if key looks like an original path, try to find actual stored key by metadata
      try {
        const found = await this.findKeyByOriginalName(key);
        if (found && found !== key) {
          console.log(`🔎 [FileStorage] Fallback found actual key for ${key} -> ${found}`);
          return await this.getFile(found);
        }
      } catch (error_) {
        console.warn('Fallback lookup failed:', error_);
      }
      throw new Error(`Failed to get file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Получает метаданные файла
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        originalName: response.Metadata?.['original-name'] || path.basename(key),
        contentType: response.ContentType || 'application/octet-stream',
        size: response.ContentLength || 0,
        uploadedAt: response.Metadata?.['uploaded-at'] 
          ? new Date(response.Metadata['uploaded-at'])
          : response.LastModified || new Date(),
      };
    } catch (error) {
      console.error('Error getting file metadata from S3:', error);
      // Try fallback lookup by original-name metadata
      try {
        const found = await this.findKeyByOriginalName(key);
        if (found && found !== key) {
          console.log(`🔎 [FileStorage] Fallback metadata lookup for ${key} -> ${found}`);
          return await this.getFileMetadata(found);
        }
      } catch (error_) {
        console.warn('Fallback metadata lookup failed:', error_);
      }
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fallback: find stored S3 key by matching 'original-name' metadata.
   * Scans bucket (paged) and performs Head requests to compare metadata.
   */
  private async findKeyByOriginalName(originalName: string): Promise<string | null> {
    try {
      const encoded = Buffer.from(originalName, 'utf-8').toString('base64');
      let continuationToken: string | undefined = undefined;

      // Limit the number of items checked to avoid long scans in large buckets
      const maxPages = 5;
      let pages = 0;

      do {
        const listCmd = new ListObjectsV2Command({
          Bucket: this.bucketName,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        });
        const listResp = await this.s3Client.send(listCmd);
        const contents = listResp.Contents || [];

        for (const item of contents) {
          if (!item.Key) continue;
          try {
            const head = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: item.Key }));
            if (head.Metadata?.['original-name'] === encoded) {
              return item.Key;
            }
          } catch (error_) {
            console.debug(`Could not fetch metadata for ${item.Key}:`, error_);
          }
        }

        continuationToken = listResp.NextContinuationToken as any;
        pages++;
      } while (continuationToken && pages < maxPages);

      return null;
    } catch (e) {
      console.error('Error during findKeyByOriginalName:', e);
      throw e;
    }
  }

  /**
   * Генерирует подписанный URL для доступа к файлу
   */
  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Удаляет файл из хранилища
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      return false;
    }
  }

  /**
   * Проверяет существование файла
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.warn(`Failed to check file existence: ${error}`);
      return false;
    }
  }

  /**
   * Возвращает публичный URL файла (для MinIO)
   */
  getPublicUrl(key: string): string {
    return `${process.env.S3_ENDPOINT}/${this.bucketName}/${key}`;
  }

  /**
   * Инициализирует bucket если его нет
   */
  async initializeBucket(): Promise<void> {
    try {
      // Попытка создать bucket (MinIO создаст если его нет)
      const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
      
      await this.s3Client.send(new CreateBucketCommand({
        Bucket: this.bucketName,
      }));
    } catch (error) {
      // Bucket уже существует или другая ошибка - это нормально
      console.log('Bucket initialization:', error instanceof Error ? error.message : 'Done');
    }
  }
}

// Singleton instance
export const fileStorage = new FileStorageService();

// Экспорт для использования в других модулях
export default fileStorage;