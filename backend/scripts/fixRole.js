import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "tickets.db");

const ALLOWED_ROLES = ["user", "support", "admin"];

function usage() {
  console.log("Usage: node backend/scripts/fixRole.js <email> <role>");
  console.log("       node backend/scripts/fixRole.js --list");
  console.log("Roles: user | support | admin");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to open DB:", err.message);
    process.exit(1);
  }
});

if (args[0] === "--list") {
  db.all("SELECT userId, name, email, role FROM users ORDER BY userId", [], (err, rows) => {
    if (err) {
      console.error("Query failed:", err.message);
      process.exit(1);
    }
    console.table(rows);
    db.close();
  });
} else {
  const [email, role] = args;
  if (!email || !role) usage();
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${ALLOWED_ROLES.join(", ")}`);
    process.exit(1);
  }

  db.get("SELECT userId, name, email, role FROM users WHERE email = ?", [email], (err, row) => {
    if (err) {
      console.error("Lookup failed:", err.message);
      process.exit(1);
    }
    if (!row) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Found: id=${row.userId}  name=${row.name}  current role=${row.role}`);

    if (row.role === role) {
      console.log(`Role is already "${role}". Nothing to do.`);
      db.close();
      return;
    }

    db.run("UPDATE users SET role = ? WHERE userId = ?", [role, row.userId], function (updateErr) {
      if (updateErr) {
        console.error("Update failed:", updateErr.message);
        process.exit(1);
      }
      console.log(`Updated ${row.email}: ${row.role} → ${role}  (rows changed: ${this.changes})`);
      db.close();
    });
  });
}