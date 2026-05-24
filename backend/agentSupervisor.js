import database from "./database.js";
import fetch from "node-fetch";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const SUPERVISOR_INTERVAL_MS = 30 * 60 * 1000;

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function getAgentStats(agentId) {
  const assignedRow = await dbAll(
    `SELECT COUNT(*) AS cnt FROM tickets WHERE assigned_to = ? AND status != 'Closed'`,
    [agentId]
  );
  const resolvedRow = await dbAll(
    `SELECT COUNT(*) AS cnt FROM tickets
     WHERE assigned_to = ? AND status = 'Closed'
       AND updated_at >= datetime('now', '-1 hour')`,
    [agentId]
  );
  const avgRow = await dbAll(
    `SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) AS avg_hours
     FROM tickets WHERE assigned_to = ? AND status = 'Closed'`,
    [agentId]
  );

  return {
    tickets_assigned: assignedRow[0]?.cnt || 0,
    tickets_resolved_last_hour: resolvedRow[0]?.cnt || 0,
    avg_resolution_hours: Number(avgRow[0]?.avg_hours || 0),
  };
}

function buildPrompt(agent, stats) {
  return `You are a helpdesk supervisor AI. Analyze this support agent's workload and respond in JSON only.

Agent: ${agent.name}
Tickets assigned (open): ${stats.tickets_assigned}
Tickets resolved in last hour: ${stats.tickets_resolved_last_hour}
Average resolution time: ${stats.avg_resolution_hours.toFixed(2)} hours

Rules:
- If tickets_assigned > 10 and tickets_resolved_last_hour < 1: flag as "overloaded"
- If tickets_assigned < 3 and tickets_resolved_last_hour < 1 and avg_resolution_hours > 48: flag as "underperforming"
- Otherwise: flag as "normal"

Respond ONLY with this JSON:
{"flag": "normal|overloaded|underperforming", "action": "brief action description", "reasoning": "one sentence explanation"}`;
}

function fallbackDecision(stats) {
  if (stats.tickets_assigned > 10 && stats.tickets_resolved_last_hour < 1) {
    return {
      flag: "overloaded",
      action: "Redistribute tickets to less-loaded agents",
      reasoning: "Agent has high open ticket count and no recent resolutions.",
    };
  }
  if (
    stats.tickets_assigned < 3 &&
    stats.tickets_resolved_last_hour < 1 &&
    stats.avg_resolution_hours > 48
  ) {
    return {
      flag: "underperforming",
      action: "Review agent workload and provide coaching",
      reasoning: "Low ticket count with slow resolution time.",
    };
  }
  return {
    flag: "normal",
    action: "No action required",
    reasoning: "Agent workload and resolution metrics are within expected range.",
  };
}

async function askOllama(prompt, stats) {
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    });

    if (!res.ok) {
      console.warn("[Supervisor] Ollama HTTP", res.status, "- using fallback");
      return fallbackDecision(stats);
    }

    const data = await res.json();
    const raw = (data?.response || "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallbackDecision(stats);

    const parsed = JSON.parse(match[0]);
    if (!["normal", "overloaded", "underperforming"].includes(parsed.flag)) {
      return fallbackDecision(stats);
    }
    return {
      flag: parsed.flag,
      action: parsed.action || "",
      reasoning: parsed.reasoning || "",
    };
  } catch (err) {
    console.warn("[Supervisor] Ollama call failed:", err.message);
    return fallbackDecision(stats);
  }
}

async function reassignFromOverloaded(overloadedAgentId, allAgents, overloadedSet = new Set()) {
  // Fix: previously this picked the single least-loaded agent without checking
  // whether that agent was also flagged overloaded in this cycle. Pull a list
  // of candidates ordered by load and skip any already-overloaded agents.
  const loadRows = await dbAll(
    `SELECT u.userId, u.name, COUNT(t.ticket_id) AS open_count
     FROM users u
     LEFT JOIN tickets t
       ON t.assigned_to = u.userId AND t.status != 'Closed'
     WHERE u.role = 'support' AND u.userId != ?
     GROUP BY u.userId
     ORDER BY open_count ASC`,
    [overloadedAgentId]
  );

  const target = loadRows.find(r => !overloadedSet.has(r.userId));
  if (!target) return null;

  const movable = await dbAll(
    `SELECT ticket_id FROM tickets
     WHERE assigned_to = ? AND status != 'Closed'
     ORDER BY created_at ASC
     LIMIT 3`,
    [overloadedAgentId]
  );

  if (!movable.length) return null;

  for (const t of movable) {
    await dbRun(
      `UPDATE tickets SET assigned_to = ? WHERE ticket_id = ?`,
      [target.userId, t.ticket_id]
    );
  }

  // Fix: previously approximated newLoad as target.open_count + movable.length.
  // Re-query the actual open ticket count after reassignment for an accurate
  // warning threshold check.
  const newLoadRows = await dbAll(
    `SELECT COUNT(*) AS cnt FROM tickets
     WHERE assigned_to = ? AND status != 'Closed'`,
    [target.userId]
  );
  const newLoad = newLoadRows[0]?.cnt || 0;
  if (newLoad > 10) {
    console.warn(
      `[Supervisor] Warning: ${target.name} now holds ${newLoad} open tickets after reassignment (exceeds 10)`
    );
  }

  return `Reassigned ${movable.length} ticket(s) to ${target.name}`;
}

export async function runSupervisorCycle() {
  console.log("[Supervisor] Cycle started at", new Date().toISOString());
  try {
    const agents = await dbAll(
      `SELECT userId, name FROM users WHERE role = 'support'`
    );
    if (!agents.length) {
      console.log("[Supervisor] No support agents found");
      return;
    }

    // Fix: track overloaded agents in this cycle so we don't reassign tickets
    // to another agent that's also been flagged as overloaded.
    const overloadedSet = new Set();
    for (const agent of agents) {
      try {
        const stats = await getAgentStats(agent.userId);
        const prompt = buildPrompt(agent, stats);
        const decision = await askOllama(prompt, stats);

        let actionTaken = decision.action || null;
        if (decision.flag === "overloaded") {
          overloadedSet.add(agent.userId);
          const reassignNote = await reassignFromOverloaded(agent.userId, agents, overloadedSet);
          if (reassignNote) {
            actionTaken = actionTaken
              ? `${actionTaken} | ${reassignNote}`
              : reassignNote;
          }
        }

        await dbRun(
          `INSERT INTO supervisor_logs
            (agent_id, agent_name, tickets_resolved_last_hour, tickets_assigned,
             avg_resolution_hours, flag, action_taken, ollama_reasoning)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            agent.userId,
            agent.name,
            stats.tickets_resolved_last_hour,
            stats.tickets_assigned,
            stats.avg_resolution_hours,
            decision.flag,
            actionTaken,
            decision.reasoning || null,
          ]
        );
      } catch (innerErr) {
        console.error(
          `[Supervisor] Error processing agent ${agent.userId}:`,
          innerErr.message
        );
      }
    }

    console.log("[Supervisor] Cycle finished");
  } catch (err) {
    console.error("[Supervisor] Cycle failed:", err.message);
  }
}

export function startSupervisorTimer() {
  runSupervisorCycle().catch((err) =>
    console.error("[Supervisor] Initial run failed:", err.message)
  );
  setInterval(() => {
    runSupervisorCycle().catch((err) =>
      console.error("[Supervisor] Scheduled run failed:", err.message)
    );
  }, SUPERVISOR_INTERVAL_MS);
  console.log("[Supervisor] Timer started (30 min interval)");
}
