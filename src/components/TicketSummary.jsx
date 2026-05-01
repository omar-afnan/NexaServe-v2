import React from "react";
import { useNavigate } from "react-router-dom";

export default function TicketSummary({ tickets }) {
  const navigate = useNavigate();

  const getPriorityLabel = (priority) => {
    if (priority === null || priority === undefined || priority === "" || priority === 0 || priority === '0') {
      return "Medium";
    }



    // string  priorities  
    if (typeof priority === "string") {
      const p = priority.trim();
      // Just capitalize first letter for any string
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }

    //  numeric priorities
    if (typeof priority === "number") {
      switch (priority) {
        case 1: return "Low";
        case 2: return "Medium";
        case 3: return "High";
        case 4: return "Critical";
        default: return "Medium";
      }
    }

    // Default fallback
    return "Medium";
  };

  // Priority ranking: higher number = shown first in the table
  const priorityOrder = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };

  const sortedTickets = Array.isArray(tickets)
    ? [...tickets].sort((a, b) => {
      const aPriority = priorityOrder[getPriorityLabel(a.priority).toLowerCase()] || 0;
      const bPriority = priorityOrder[getPriorityLabel(b.priority).toLowerCase()] || 0;
      return bPriority - aPriority; 
    })
    : [];

  return (
    <div className="ticketSummary">

      <h2>My Tickets</h2>

      {sortedTickets.length > 0 ? (
        <table>
          <thead>

            <tr>
              <th>ID</th>

              <th>Title</th>

              <th>Status</th>

              <th>Priority</th>
            </tr>

          </thead>
          <tbody>

            {sortedTickets.map((t) => (
              <tr key={t.ticket_id}>
                 {/* ticket id  */}
                <td>
                  {
                    t.ticket_id  
                  }
                </td>
                {/*title */}
                <td>
                  {
                    t.title
                  }
                </td>
                {/* status */}
                <td>
                  {
                    t.status
                  }</td>

                <td>
                  <span className={`userPriorityBadge ${getPriorityLabel(t.priority).toLowerCase()}`}>
                    {getPriorityLabel(t.priority)}
                  </span>
                </td>
              </tr>

            ))}
          </tbody>
        </table>
      ) : (
        <p>No available tickets.</p>
      )}

      <div style={
        {
          marginTop: "16px",
          textAlign: "right"
        }}>

        <button
          className="viewAllBtn"
          onClick={() => navigate("/user/view-ticket")}>
          View All Tickets
        </button>
        
      </div>
    </div>
  );
}
