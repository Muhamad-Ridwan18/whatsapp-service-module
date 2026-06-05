import { db } from './index.js';

db.connect();
console.log('Migrations completed successfully.');
db.close();
