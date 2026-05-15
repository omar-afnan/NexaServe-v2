import React from "react";
import { useNavigate } from "react-router-dom";

export default function TicketSummary({ tickets }) {
  const navigate = useNavigate();

  const getPriorityLabel = (priority) => {
    if (priority === null || priority === undefined || priority === "" || priority === 0 || priority === '0') {
      return "Medium";
    }

    if (typeof priority === "string") {
      const p = priority.trim();
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }

    if (typeof priority === "number") {
      switch (priority) {
        case 1: return "Low";
        case 2: return "Medium";
        case 3: return "High";
        case 4: return "Critical";
        default: return "Medium";
      }
    }

    return "Medium";
  };

  const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

  const sortedTickets = Array.isArray(tickets)
    ? [...tickets].sort((a, b) => {
        const aPriority = priorityOrder[getPriorityLabel(a.priority).toLowerCase()] || 0;
        const bPriority = priorityOrder[getPriorityLabel(b.priority).toLowerCase()] || 0;
        return bPriority - aPriority;
      })
    : [];

  const getStatusClass = (status) => {
    switch ((status || "").toLowerCase().replace(" ", "-")) {
      case "open": return "tsBadgeOpen";
      case "closed": return "tsBadgeClosed";
      case "in-progress": return "tsBadgeInProgress";
      default: return "tsBadgeOpen";
    }
  };

  return (
    <div className="ticketSummary">
      <h2>My Tickets</h2>

      {sortedTickets.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sortedTickets.map((t) => (
              <tr key={t.ticket_id}>
                <td>{t.ticket_id}</td>
                <td>{t.title}</td>
                <td>{t.category || "—"}</td>
                <td>
                  <span className={`userPriorityBadge ${getPriorityLabel(t.priority).toLowerCase()}`}>
                    {getPriorityLabel(t.priority)}
                  </span>
                </td>
                <td>
                  <span className={`tsStatusBadge ${getStatusClass(t.status)}`}>
                    {t.status}
                  </span>
                </td>
                <td>{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No tickets found.</p>
      )}

      <div style={{ marginTop: "0", textAlign: "right" }}>
        <button className="viewAllBtn" onClick={() => navigate("/user/view-ticket")}>
          View All Tickets
        </button>
      </div>
    </div>
  );
}
