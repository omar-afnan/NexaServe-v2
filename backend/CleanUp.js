import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "tickets.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Could not open database:", err.message);
    return;
  }
  console.log("Database connected");
});

db.serialize(() => {
  db.run(
    `DELETE FROM users
     WHERE email LIKE '%@test.com'
     AND userId NOT IN (1, 52)`,
    function (err) {
      if (err) {
        console.error("Cleanup error:", err.message);
      } else {
        console.log(`Cleanup complete: ${this.changes} users removed`);
      }

      db.close();
    }
  );
});
