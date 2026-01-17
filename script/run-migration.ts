import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://xlibris:xlibris_dev@localhost:5432/xlibris';

const client = new Client({
  connectionString: DATABASE_URL,
});

async function runMigration() {
  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Reading migration file...');
    const migrationSQL = readFileSync(join(__dirname, '../migrations/0012_club_reader_tables.sql'), 'utf8');

    console.log('Executing migration...');
    await client.query(migrationSQL);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
