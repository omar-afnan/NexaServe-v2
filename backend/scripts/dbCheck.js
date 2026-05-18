import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "tickets.db");

console.log("─".repeat(60));
console.log("DB Health Check");
console.log("─".repeat(60));

if (!fs.existsSync(dbPath)) {
  console.error(`X DB file missing at: ${dbPath}`);
  process.exit(1);
}
const sizeKb = (fs.statSync(dbPath).size / 1024).toFixed(1);
console.log(`OK DB file: ${dbPath}  (${sizeKb} KB)`);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("X Failed to open DB:", err.message);
    process.exit(1);
  }
  console.log("OK Connection opened");
});

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

(async () => {
  try {
    const integrity = await getAsync("PRAGMA integrity_check");
    console.log(`OK Integrity: ${integrity.integrity_check}`);

    const fk = await getAsync("PRAGMA foreign_keys");
    console.log(`   foreign_keys = ${fk.foreign_keys}`);

    const jm = await getAsync("PRAGMA journal_mode");
    console.log(`   journal_mode = ${jm.journal_mode}`);

    console.log("\nTables:");
    const tables = await allAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    if (tables.length === 0) {
      console.log("   (none)");
    } else {
      for (const { name } of tables) {
        const { c } = await getAsync(`SELECT COUNT(*) AS c FROM "${name}"`);
        console.log(`   - ${name.padEnd(20)} ${c} rows`);
      }
    }

    console.log("\nUsers by role:");
    const roleCounts = await allAsync(
      "SELECT role, COUNT(*) AS c FROM users GROUP BY role ORDER BY role"
    );
    if (roleCounts.length === 0) console.log("   (no users)");
    else roleCounts.forEach((r) => console.log(`   - ${r.role.padEnd(10)} ${r.c}`));

    console.log("\nLooking for issues...");
    let problems = 0;

    const dupEmails = await allAsync(
      "SELECT email, COUNT(*) AS c FROM users GROUP BY email HAVING c > 1"
    );
    if (dupEmails.length) {
      problems++;
      console.log(`! Duplicate emails: ${dupEmails.map(d => `${d.email} (${d.c})`).join(", ")}`);
    }

    const orphanTickets = await getAsync(
      `SELECT COUNT(*) AS c FROM tickets t LEFT JOIN users u ON u.userId = t.created_by WHERE u.userId IS NULL`
    );
    if (orphanTickets.c > 0) {
      problems++;
      console.log(`! Tickets with missing creator: ${orphanTickets.c}`);
    }

    const badAssignees = await getAsync(
      `SELECT COUNT(*) AS c FROM tickets t LEFT JOIN users u ON u.userId = t.assigned_to WHERE t.assigned_to IS NOT NULL AND u.userId IS NULL`
    );
    if (badAssignees.c > 0) {
      problems++;
      console.log(`! Tickets assigned to non-existent users: ${badAssignees.c}`);
    }

    const orphanComments = await getAsync(
      `SELECT COUNT(*) AS c FROM comments c LEFT JOIN tickets t ON t.ticket_id = c.ticket_id WHERE t.ticket_id IS NULL`
    );
    if (orphanComments.c > 0) {
      problems++;
      console.log(`! Comments referencing missing tickets: ${orphanComments.c}`);
    }

    const invalidRoles = await getAsync(
      `SELECT COUNT(*) AS c FROM users WHERE role NOT IN ('user','support','admin')`
    );
    if (invalidRoles.c > 0) {
      problems++;
      console.log(`! Users with unexpected role values: ${invalidRoles.c}`);
    }

    if (problems === 0) {
      console.log("OK No integrity issues found");
    }

    console.log("\n" + "─".repeat(60));
    console.log("Done.");
    db.close();
  } catch (e) {
    console.error("Check failed:", e.message);
    db.close();
    process.exit(1);
  }
})();