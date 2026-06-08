import { db } from './index.js';

async function main(): Promise<void> {
  await db.connect();
  console.log('Migrations completed successfully.');
  await db.close();
}

void main();
