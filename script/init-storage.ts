#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { log } from "../server/index.js";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function initializeS3Storage() {
  const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
  const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin123';
  const bucketName = process.env.S3_BUCKET || 'xlibris-books';
  const region = process.env.S3_REGION || 'us-east-1';

  console.log('🗄️  [Storage Init] Initializing S3-compatible storage...');
  console.log(`📍 Endpoint: ${endpoint}`);
  console.log(`🪣 Bucket: ${bucketName}`);

  const s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for MinIO
  });

  // Ждем запуска MinIO (до 30 секунд)
  let retries = 30;
  let connected = false;

  while (retries > 0 && !connected) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      connected = true;
      console.log('✅ [Storage Init] MinIO connection established');
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Bucket не существует - это нормально, создадим его
        connected = true;
        break;
      } else if (error.code === 'ECONNREFUSED' || error.name === 'NetworkingError') {
        console.log(`⏳ [Storage Init] Waiting for MinIO to start... (${retries} retries left)`);
        retries--;
        await delay(2000);
      } else {
        console.log('🔄 [Storage Init] MinIO starting up, retrying...');
        retries--;
        await delay(2000);
      }
    }
  }

  if (!connected) {
    console.error('❌ [Storage Init] FAILED: Could not connect to MinIO after 60 seconds');
    console.error('💡 Make sure MinIO is running: docker compose up minio -d');
    process.exit(1);
  }

  // Проверяем/создаем bucket
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`✅ [Storage Init] Bucket "${bucketName}" already exists`);
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      try {
        await s3Client.send(new CreateBucketCommand({ 
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: region
          }
        }));
        console.log(`✅ [Storage Init] Created bucket "${bucketName}"`);
      } catch (createError: any) {
        if (createError.name === 'BucketAlreadyOwnedByYou') {
          console.log(`✅ [Storage Init] Bucket "${bucketName}" already exists and owned by you`);
        } else {
          console.error('❌ [Storage Init] Failed to create bucket:', createError.message);
          process.exit(1);
        }
      }
    } else {
      console.error('❌ [Storage Init] Failed to check bucket:', error.message);
      process.exit(1);
    }
  }

  // Проверяем что bucket доступен для операций
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log('🎯 [Storage Init] Storage system ready for file uploads');
    console.log('📚 [Storage Init] Book upload functionality is now available');
    
    // Выводим URL для MinIO Console
    const consoleUrl = endpoint.replace(':9000', ':9001');
    console.log(`🔗 [Storage Init] MinIO Console: ${consoleUrl}`);
    console.log(`👤 [Storage Init] Login: ${accessKeyId} / ${secretAccessKey}`);
    
  } catch (error: any) {
    console.error('❌ [Storage Init] Final verification failed:', error.message);
    process.exit(1);
  }
}

// Запускаем инициализацию
initializeS3Storage().catch((error) => {
  console.error('💥 [Storage Init] Unexpected error:', error);
  process.exit(1);
});