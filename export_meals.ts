import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const d1Dir = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const sqliteFile = fs.readdirSync(d1Dir).find(f => f.endsWith('.sqlite'));

if (!sqliteFile) {
    console.error('No local D1 file found.');
    process.exit(1);
}

const db = new Database(path.join(d1Dir, sqliteFile));
const rows = db.prepare('SELECT * FROM meals').all();

if (rows.length === 0) {
    console.log('No meals found in local DB.');
    process.exit(0);
}

let sql = 'INSERT OR REPLACE INTO meals (date, content, calories, origins, type, sysId) VALUES \n';
const values = rows.map(r => {
    const content = (r.content || "").replace(/'/g, "''");
    const origins = (r.origins || "").replace(/'/g, "''");
    return `('${r.date}', '${content}', '${r.calories || ''}', '${origins}', '${r.type}', '${r.sysId}')`;
}).join(',\n');

fs.writeFileSync('remote_meals.sql', sql + values + ';');
console.log(`Generated remote_meals.sql with ${rows.length} rows.`);
