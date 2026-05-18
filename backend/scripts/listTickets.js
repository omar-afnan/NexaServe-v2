import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "tickets.db");

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.all(
  `SELECT ticket_id, status,
          CASE WHEN solution IS NULL THEN 'NULL'
               WHEN solution = '' THEN 'empty'
               ELSE 'len=' || length(solution) END AS sol,
          substr(title,1,50) AS title
   FROM tickets ORDER BY created_at DESC`,
  [],
  (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    console.table(rows);
    db.close();
  }
);