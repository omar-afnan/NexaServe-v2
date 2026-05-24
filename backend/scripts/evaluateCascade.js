import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "..", "tickets.db");

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Failed to open DB:", err.message);
    process.exit(1);
  }
});

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const pct = (n, d) => (d === 0 ? "0.0" : ((n / d) * 100).toFixed(1));
const truncate = (s, n) => {
  if (s == null) return "";
  const flat = String(s).replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "..." : flat;
};

(async () => {
  try {
    const totalRow = await getAsync("SELECT COUNT(*) AS c FROM llama_logs");
    const total = totalRow.c;

    const validationFailed = (
      await getAsync(
        "SELECT COUNT(*) AS c FROM llama_logs WHERE trigger_reason = 'validation_failed'"
      )
    ).c;

    const userDissatisfied = (
      await getAsync(
        "SELECT COUNT(*) AS c FROM llama_logs WHERE trigger_reason = 'user_dissatisfied'"
      )
    ).c;

    const resolved = (
      await getAsync("SELECT COUNT(*) AS c FROM llama_logs WHERE was_resolved = 1")
    ).c;

    const escalated = (
      await getAsync(
        "SELECT COUNT(*) AS c FROM llama_logs WHERE ticket_id IS NOT NULL"
      )
    ).c;

    const autoTicketCount = (
      await getAsync(
        "SELECT COUNT(DISTINCT ticket_id) AS c FROM llama_logs WHERE ticket_id IS NOT NULL"
      )
    ).c;

    const totalTickets = (await getAsync("SELECT COUNT(*) AS c FROM tickets")).c;
    const mlKept = (
      await getAsync("SELECT COUNT(*) AS c FROM tickets WHERE priority_source = 'ml'")
    ).c;
    const llamaCorrected = (
      await getAsync(
        "SELECT COUNT(*) AS c FROM tickets WHERE priority_source = 'llama_correction'"
      )
    ).c;
    const fallback = (
      await getAsync(
        "SELECT COUNT(*) AS c FROM tickets WHERE priority_source = 'fallback'"
      )
    ).c;

    const responses = await allAsync(
      "SELECT trigger_reason, was_resolved, chatterbot_response, llama_response FROM llama_logs ORDER BY id ASC"
    );

    
    console.log(" NEXASERVE v2 CASCADE EVALUATION REPORT");
   
    console.log(`Total Ollama triggers:        ${total}`);
    console.log(
      `Validation failed triggers:   ${validationFailed} (${pct(validationFailed, total)}%)`
    );
    console.log(
      `User dissatisfied triggers:   ${userDissatisfied} (${pct(userDissatisfied, total)}%)`
    );
    console.log(
      `Sessions resolved by Ollama:  ${resolved} (${pct(resolved, total)}%)`
    );
    console.log(
      `Sessions escalated to ticket: ${escalated} (${pct(escalated, total)}%)`
    );
    console.log(`Auto-created tickets:${autoTicketCount}`);
    console.log("");
    console.log("PRIORITY CORRECTION (RO4)");
    console.log(`ML priority kept:             ${mlKept}`);
    console.log(
      `Llama corrected priority:${llamaCorrected} (${pct(llamaCorrected, totalTickets)}% of all tickets)`
    );
    console.log(`Fallback priority:            ${fallback}`);
    
    console.log("OLLAMA RESPONSES FOR MANUAL REVIEW");
    
    if (responses.length === 0) {
      console.log("(no responses logged)");
    } else {
      responses.forEach((r, i) => {
        const resolvedStr = r.was_resolved === 1 ? "yes" : "no";
        console.log(
          `[${i + 1}] trigger: ${r.trigger_reason} | resolved: ${resolvedStr}`
        );
        console.log(`    ChatterBot said: "${truncate(r.chatterbot_response, 200)}"`);
        console.log(`    Ollama said: "${truncate(r.llama_response, 200)}"`);
        console.log("");
      });
    }
  

    db.close();
  } catch (e) {
    console.error("Evaluation failed:", e.message);
    db.close();
    process.exit(1);
  }
})();
