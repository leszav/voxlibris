import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://xlibris:xlibris_dev@localhost:5432/xlibris';

const client = new Client({
  connectionString: DATABASE_URL,
});

async function runAllMigrations() {
  try {
    console.log('Connecting to database...');
    await client.connect();

    // Get all migration files and sort them
    const migrationsDir = join(__dirname, '../migrations');
    const migrationFiles = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && !file.startsWith('seed_data'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);
    
    for (const migrationFile of migrationFiles) {
      if (migrationFile === '00_clean_rebuild.sql') {
        console.log(`Skipping ${migrationFile} (clean rebuild - manual only)`);
        continue;
      }
      
      console.log(`Reading migration file: ${migrationFile}`);
      const migrationSQL = readFileSync(join(migrationsDir, migrationFile), 'utf8');

      console.log(`Executing migration: ${migrationFile}`);
      await client.query(migrationSQL);
      console.log(`Migration ${migrationFile} completed successfully!`);
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runAllMigrations();