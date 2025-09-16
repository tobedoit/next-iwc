import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import pg from 'pg';

// Load env (prefer .env.local if present)
const cwd = process.cwd();
const envLocal = path.join(cwd, '.env.local');
const envFile = path.join(cwd, '.env');
// Load .env first, then override with .env.local if present
if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-sql.mjs <sql-file>');
  process.exit(1);
}

const sqlPath = path.resolve(file);
if (!fs.existsSync(sqlPath)) {
  console.error('SQL file not found:', sqlPath);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in env');
  process.exit(1);
}

const sqlText = fs.readFileSync(sqlPath, 'utf8');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  try {
    await client.query('begin');
    await client.query(sqlText);
    await client.query('commit');
    console.log('Applied:', path.basename(sqlPath));
  } catch (err) {
    await client.query('rollback');
    console.error('Error applying SQL:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
