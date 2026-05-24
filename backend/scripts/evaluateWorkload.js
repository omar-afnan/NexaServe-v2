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

const pct = (n, d) => (d === 0 ? "0.0" : ((n / d) * 100).toFixed(1));

const giniCoefficient = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  let weighted = 0;

  for (let i = 0; i < n; i++) {
    weighted += (i + 1) * sorted[i];
  }
  return (2 * weighted) / (n * sum) - (n + 1) / n;
};

const pad = (s, n) => String(s).padEnd(n);

(async () => {
  try {
    const agents = await allAsync(
      `SELECT u.userId, u.name,
              COUNT(t.ticket_id) AS total,
              SUM(CASE WHEN t.status != 'Closed' THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) AS closed
       FROM users u
       LEFT JOIN tickets t ON t.assigned_to = u.userId
       WHERE u.role = 'support'
       GROUP BY u.userId, u.name
       ORDER BY u.name`
    );

    const openCounts = agents.map((a) => a.open_count || 0);
    const gini = giniCoefficient(openCounts);

    const totalOpen = openCounts.reduce((a, b) => a + b, 0);
    const n = openCounts.length;
    const equalDistribution = new Array(n).fill(totalOpen / n);
    const giniEqual = giniCoefficient(equalDistribution);

    const maxOpen = openCounts.length ? Math.max(...openCounts) : 0;
    const minOpen = openCounts.length ? Math.min(...openCounts) : 0;
    const randomSpread = openCounts.length
      ? [minOpen, ...new Array(Math.max(0, n - 2)).fill((minOpen + maxOpen) / 2), maxOpen]
      : [];
    const giniRandom = giniCoefficient(randomSpread);

    const totalCyclesRow = await allAsync(
      "SELECT COUNT(*) AS c FROM supervisor_logs"
    );
    const totalLogRows = totalCyclesRow[0].c;

    const distinctCycles = await allAsync(
      "SELECT COUNT(DISTINCT created_at) AS c FROM supervisor_logs"
    );
    const totalCycles = distinctCycles[0].c;

    const flagRows = await allAsync(
      "SELECT flag, COUNT(*) AS c FROM supervisor_logs GROUP BY flag"
    );
    const flagCounts = { normal: 0, overloaded: 0, underperforming: 0 };
    for (const r of flagRows) {
      flagCounts[r.flag] = (flagCounts[r.flag] || 0) + r.c;
    }

    const redistRows = await allAsync(
      "SELECT action_taken FROM supervisor_logs WHERE action_taken LIKE '%Reassigned%'"
    );
    const redistTriggered = redistRows.length;
    let totalRedistributed = 0;
    for (const r of redistRows) {
      const m = String(r.action_taken).match(/Reassigned\s+(\d+)\s+ticket/i);
      if (m) totalRedistributed += parseInt(m[1], 10);
    }

    const perAgentFlags = await allAsync(
      `SELECT agent_name,
              SUM(CASE WHEN flag = 'normal' THEN 1 ELSE 0 END) AS normal_c,
              SUM(CASE WHEN flag = 'overloaded' THEN 1 ELSE 0 END) AS over_c,
              SUM(CASE WHEN flag = 'underperforming' THEN 1 ELSE 0 END) AS under_c
       FROM supervisor_logs
       GROUP BY agent_name
       ORDER BY agent_name`
    );

    const reasoningRows = await allAsync(
      `SELECT DISTINCT ollama_reasoning, agent_name, flag
       FROM supervisor_logs
       WHERE ollama_reasoning IS NOT NULL AND ollama_reasoning != ''
       ORDER BY agent_name, flag`
    );

    
    console.log(" NEXASERVE v2 — WORKLOAD EVALUATION REPORT");

    console.log("");
    console.log("AUTO-ASSIGNMENT DISTRIBUTION");
    console.log(
      `${pad("Agent", 22)}${pad("Total", 8)}${pad("Open", 8)}${pad("Closed", 8)}`
    );
    for (const a of agents) {
      console.log(
        `${pad(a.name, 22)}${pad(a.total || 0, 8)}${pad(a.open_count || 0, 8)}${pad(a.closed || 0, 8)}`
      );
    }
    console.log("");
    console.log(`Gini coefficient (open tickets):     ${gini.toFixed(2)}`);
    console.log(`Perfect equal distribution Gini:     ${giniEqual.toFixed(2)}`);
    console.log(
      `Random spread (min=${minOpen}, max=${maxOpen}) Gini:  ${giniRandom.toFixed(2)}`
    );
    console.log("");
    console.log("SUPERVISOR LOG ANALYSIS");
    console.log(`Total supervisor cycles:     ${totalCycles}`);
    console.log(`Total agent flag rows:       ${totalLogRows}`);
    console.log(
      `Normal flags:                ${flagCounts.normal} (${pct(flagCounts.normal, totalLogRows)}%)`
    );
    console.log(
      `Overloaded flags:            ${flagCounts.overloaded} (${pct(flagCounts.overloaded, totalLogRows)}%)`
    );
    console.log(
      `Underperforming flags:       ${flagCounts.underperforming} (${pct(flagCounts.underperforming, totalLogRows)}%)`
    );
    console.log(`Redistribution triggered:    ${redistTriggered} times`);
    console.log(`Total tickets redistributed: ${totalRedistributed}`);
    console.log("");
    console.log("PER-AGENT FLAG HISTORY");
    console.log(
      `${pad("Agent", 22)}${pad("Normal", 10)}${pad("Overloaded", 14)}${pad("Underperforming", 16)}`
    );
    for (const r of perAgentFlags) {
      console.log(
        `${pad(r.agent_name, 22)}${pad(r.normal_c, 10)}${pad(r.over_c, 14)}${pad(r.under_c, 16)}`
      );
    }
    console.log("");
    console.log("OLLAMA REASONING STRINGS");
    if (reasoningRows.length === 0) {
      console.log("(none)");
    } else {
      reasoningRows.forEach((r, i) => {
        console.log(`[${i + 1}] Agent: ${r.agent_name} | Flag: ${r.flag}`);
        console.log(`    "${String(r.ollama_reasoning).replace(/\s+/g, " ").trim()}"`);
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
