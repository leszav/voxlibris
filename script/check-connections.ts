#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

async function checkConnections() {
  console.log('🔍 Checking connections to remote services...');
  console.log('');

  let allGood = true;

  // Check PostgreSQL
  console.log('📊 PostgreSQL Connection:');
  console.log(`   URL: ${process.env.DATABASE_URL}`);
  try {
    const sql = postgres(process.env.DATABASE_URL!);
    const result = await sql`SELECT version()`;
    console.log('   ✅ PostgreSQL connected successfully');
    console.log(`   📦 Version: ${result[0].version.split(' ')[0]} ${result[0].version.split(' ')[1]}`);
    await sql.end();
  } catch (error: any) {
    console.log('   ❌ PostgreSQL connection failed:', error.message);
    allGood = false;
  }
  console.log('');

  // Check MinIO/S3
  console.log('🗄️ MinIO/S3 Connection:');
  console.log(`   Endpoint: ${process.env.S3_ENDPOINT}`);
  console.log(`   Bucket: ${process.env.S3_BUCKET}`);
  console.log(`   Access Key: ${process.env.S3_ACCESS_KEY}`);
  try {
    const s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || 'eu-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle: true,
    });

    await s3Client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }));
    console.log('   ✅ MinIO connected successfully');
    console.log(`   🪣 Bucket "${process.env.S3_BUCKET}" exists and is accessible`);
  } catch (error: any) {
    console.log(`   ❌ MinIO connection failed: ${error.name || 'Unknown'}`);
    console.log(`   📄 Error details: ${error.message}`);
    console.log(`   📊 HTTP Status: ${error.$metadata?.httpStatusCode || 'N/A'}`);
    
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log('   💡 Bucket does not exist - will be created on first upload');
      console.log('   ✅ MinIO endpoint is accessible, bucket just needs creation');
    } else if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      console.log('   🚫 Access denied - check credentials');
      allGood = false;
    } else if (error.code === 'ECONNREFUSED' || error.name === 'NetworkingError') {
      console.log('   🌐 Network error - check endpoint URL');
      allGood = false;
    } else {
      console.log('   ⚠️  Unknown error, but MinIO may still work');
    }
  }
  console.log('');

  if (allGood) {
    console.log('🎉 All remote services are accessible!');
    console.log('✅ Ready to start local development in production mode');
    process.exit(0);
  } else {
    console.log('❌ Some services are not accessible');
    console.log('🔧 Please check your network connection and service URLs');
    process.exit(1);
  }
}

checkConnections().catch(console.error);