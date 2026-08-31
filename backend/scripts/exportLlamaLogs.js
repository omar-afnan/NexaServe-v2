import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "tickets.db");
const outPath = path.resolve(__dirname, "..", "..", "llama_logs.csv");

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Failed to open DB:", err.message);
    process.exit(1);
  }
});

const COLUMNS = [
  "id",
  "user_id",
  "ticket_id",
  "user_message",
  "chatterbot_response",
  "llama_response",
  "was_resolved",
  "trigger_reason",
  "created_at",
];

// RFC-4180 style escaping: wrap in quotes and double any embedded quotes.
// llama_response holds multi-line markdown with commas/newlines, so every
// field is quoted to keep the CSV valid.
const csvCell = (value) => {
  if (value === null || value === undefined) return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
};

const csvRow = (row) => COLUMNS.map((col) => csvCell(row[col])).join(",");

db.all(`SELECT * FROM llama_logs ORDER BY id ASC`, [], (err, rows) => {
  if (err) {
    console.error("Query failed:", err.message);
    db.close();
    process.exit(1);
  }

  const lines = [COLUMNS.join(","), ...rows.map(csvRow)];
  fs.writeFileSync(outPath, lines.join("\r\n"), "utf-8");

  console.log(`Exported ${rows.length} llama_logs rows to:`);
  console.log(`  ${outPath}`);
  db.close();
});
