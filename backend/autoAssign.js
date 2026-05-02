import db from "./database.js";

export function autoAssignTicket(ticketId) {
  db.all(
    `SELECT u.userId,
            COUNT(t.ticket_id) AS open_count
     FROM users u
     LEFT JOIN tickets t
       ON t.assigned_to = u.userId
      AND t.status IN ('Open', 'In Progress')
      AND t.ticket_id != ?
     WHERE u.role = 'support'
     GROUP BY u.userId
     ORDER BY open_count ASC
     LIMIT 1`,
    [ticketId],
    (err, rows) => {
      if (err || !rows || rows.length === 0) return;
      const agentId = rows[0].userId;
      db.run(
        `UPDATE tickets SET assigned_to = ? WHERE ticket_id = ?`,
        [agentId, ticketId],
        (updateErr) => {
          if (updateErr) console.error(`[autoAssign] Failed to assign ${ticketId}:`, updateErr.message);
          else console.log(`[autoAssign] Ticket ${ticketId} assigned to agent ${agentId}`);
        }
      );
    }
  );
}
