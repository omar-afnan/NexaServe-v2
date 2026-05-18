import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "tickets.db");

const ticketId = process.argv[2];
if (!ticketId) {
  console.log("Usage: node backend/scripts/checkTicket.js <ticket_id>");
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.get(
  `SELECT ticket_id, title, status, priority, category, created_by, assigned_to,
          solution, category_confidence, priority_confidence, priority_source,
          created_at, updated_at
   FROM tickets WHERE ticket_id = ?`,
  [ticketId],
  (err, row) => {
    if (err) { console.error("Error:", err.message); process.exit(1); }
    if (!row) { console.log(`No ticket found with id "${ticketId}"`); db.close(); return; }

    console.log("─".repeat(60));
    Object.entries(row).forEach(([k, v]) => {
      const display =
        v === null ? "(NULL)" :
        v === ""   ? "(empty string)" :
        typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" :
        v;
      console.log(`${k.padEnd(22)} ${display}`);
    });
    console.log("─".repeat(60));
    console.log(`solution length: ${row.solution == null ? "null" : row.solution.length}`);
    db.close();
  }
);