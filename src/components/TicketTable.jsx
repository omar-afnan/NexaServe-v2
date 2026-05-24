import { useEffect, useMemo, useState } from "react";
import {
  MdCheckCircle,
  MdAccessTime,
  MdDelete,
  MdVisibility,
  MdEdit,
} from "react-icons/md";
import { IoWarning } from "react-icons/io5";

function TicketTable({
  tickets,
  onStatusChange,
  onDelete,
  onView,
  onEdit,
  pageSize = 10,
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tickets]);

  const totalPages = Math.max(1, Math.ceil((tickets?.length || 0) / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageTickets = useMemo(() => {
    if (!Array.isArray(tickets)) return [];
    const start = (safePage - 1) * pageSize;
    return tickets.slice(start, start + pageSize);
  }, [tickets, safePage, pageSize]);

  const showActions = Boolean(onDelete || onView || onEdit);

  const navBtnBase = {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #4F46E5",
    background: "#fff",
    color: "#4F46E5",
    cursor: "pointer",
  };
  const navBtnDisabled = {
    ...navBtnBase,
    borderColor: "#e5e7eb",
    color: "#9ca3af",
    cursor: "not-allowed",
    background: "#f9fafb",
  };

  return (
    <>
      <table className="ticketsTable">
        <thead>
          <tr>
            <th>
              <div className="thContent">
                <span>ID</span>
              </div>
            </th>
            <th>
              <div className="thContent">
                <span>Title</span>
              </div>
            </th>
            <th>
              <div className="thContent">
                <span>Category</span>
              </div>
            </th>
            <th>
              <div className="thContent">
                <IoWarning size={14} />
                <span>Priority</span>
              </div>
            </th>
            <th>
              <div className="thContent">
                <MdCheckCircle size={14} />
                <span>Status</span>
              </div>
            </th>
            <th>
              <div className="thContent">
                <MdAccessTime size={14} />
                <span>Created</span>
              </div>
            </th>
            {showActions && (
              <th>
                <div className="thContent">
                  <span>Actions</span>
                </div>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {pageTickets.map((ticket) => (
            <tr key={ticket.ticket_id} className="ticketRow">
              <td>
                <span className="ticketId">{ticket.ticket_id}</span>
              </td>
              <td>
                <div className="ticketTitle">{ticket.title}</div>
              </td>
              <td>
                <span className="categoryBadge">{ticket.category}</span>
              </td>
              <td>
                <span
                  className={`priorityBadge priority-${String(
                    ticket.priority || "low"
                  ).toLowerCase()}`}
                >
                  {ticket.priority === 0 || ticket.priority === "0"
                    ? "Not Set"
                    : ticket.priority}
                </span>
              </td>
              <td>
                {onStatusChange ? (
                  <select
                    value={ticket.status}
                    onChange={(e) =>
                      onStatusChange(ticket.ticket_id, e.target.value)
                    }
                    className={`statusSelect status-${ticket.status
                      .toLowerCase()
                      .replace(" ", "-")}`}
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Closed">Closed</option>
                  </select>
                ) : (
                  <span
                    className={`statusBadge status-${ticket.status
                      .toLowerCase()
                      .replace(" ", "-")}`}
                  >
                    {ticket.status}
                  </span>
                )}
              </td>
              <td>
                <span className="ticketDate">
                  {new Date(ticket.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  <br />
                  <span className="ticketTime">
                    {new Date(ticket.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </td>
              {showActions && (
                <td>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    {onView && (
                      <button
                        type="button"
                        className="deleteButton"
                        onClick={() => onView(ticket.ticket_id)}
                        title="View ticket"
                      >
                        <MdVisibility size={18} />
                      </button>
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        className="deleteButton"
                        onClick={() => onEdit(ticket.ticket_id)}
                        title="Edit ticket"
                      >
                        <MdEdit size={18} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        className="deleteButton"
                        onClick={() => onDelete(ticket.ticket_id)}
                        title="Delete ticket"
                      >
                        <MdDelete size={18} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "14px 0 4px",
          fontFamily: "inherit",
        }}
      >
        <button
          type="button"
          style={safePage <= 1 ? navBtnDisabled : navBtnBase}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          onMouseEnter={(e) => {
            if (safePage > 1) {
              e.currentTarget.style.background = "#4F46E5";
              e.currentTarget.style.color = "#fff";
            }
          }}
          onMouseLeave={(e) => {
            if (safePage > 1) {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.color = "#4F46E5";
            }
          }}
        >
          Previous
        </button>
        <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
          Page {safePage} of {totalPages}
        </span>
        <button
          type="button"
          style={safePage >= totalPages ? navBtnDisabled : navBtnBase}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          onMouseEnter={(e) => {
            if (safePage < totalPages) {
              e.currentTarget.style.background = "#4F46E5";
              e.currentTarget.style.color = "#fff";
            }
          }}
          onMouseLeave={(e) => {
            if (safePage < totalPages) {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.color = "#4F46E5";
            }
          }}
        >
          Next
        </button>
      </div>
    </>
  );
}

export default TicketTable;
