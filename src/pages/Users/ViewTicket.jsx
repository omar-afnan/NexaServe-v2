import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import UserSideBar from "../../components/userSideBar";
import "../CSS/UserTickets.css";
import fetchWithAuth from "../../api/fetchWithAuth";
import { MdArrowBack } from "react-icons/md";

const STATUS_FILTERS = ["All", "Open", "In Progress", "Closed"];

export default function UserViewTicket() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    fetchUserTickets();
  }, []);

  const fetchUserTickets = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");

      const response = await fetchWithAuth("http://localhost:5000/tickets/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) throw new Error("Failed to fetch tickets");

      const data = await response.json();
      setTickets(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getPriorityLabel = (priority) => {
    if (!priority) return "Medium";

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

  const filteredTickets =
    activeFilter === "All"
      ? tickets
      : tickets.filter((t) => t.status === activeFilter);

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aPriority = String(a.priority || "medium").toLowerCase();
    const bPriority = String(b.priority || "medium").toLowerCase();
    return (priorityOrder[aPriority] ?? 4) - (priorityOrder[bPriority] ?? 4);
  });

  const getPriorityClass = (priority) => {
    const label = getPriorityLabel(priority).toLowerCase();
    switch (label) {
      case "critical": return "vtPriorityCritical";
      case "high": return "vtPriorityHigh";
      case "medium": return "vtPriorityMedium";
      case "low": return "vtPriorityLow";
      default: return "vtPriorityMedium";
    }
  };

  const getStatusClass = (status) => {
    switch ((status || "").toLowerCase().replace(" ", "-")) {
      case "open": return "vtStatusOpen";
      case "closed": return "vtStatusClosed";
      case "in-progress": return "vtStatusInProgress";
      default: return "vtStatusOpen";
    }
  };

  return (
    <div className="layout">
      <UserSideBar />
      <main className="ticketContent">
        {/* Top bar */}
        <div className="vtTopBar">
          <div className="vtTopBarLeft">
            <button className="vtBackBtn" onClick={() => navigate("/UserDashboard")}>
              <MdArrowBack size={16} style={{ marginRight: 4 }} />
              Back
            </button>
            <div>
              <h2 className="vtTitle">My Tickets</h2>
              <p className="vtSubtitle">Track and manage your support requests</p>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div className="vtFilterPills">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              className={`vtFilterPill ${activeFilter === f ? "active" : ""}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {loading && <p className="loading">Loading tickets…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && (
          <div className="ticketsTableContainer">
            {sortedTickets.length === 0 ? (
              <p className="noTickets">
                {activeFilter === "All"
                  ? "No tickets found. Create a ticket first."
                  : `No ${activeFilter} tickets.`}
              </p>
            ) : (
              <table className="ticketsTable">
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
                  {sortedTickets.map((ticket) => (
                    <tr key={ticket.ticket_id}>
                      <td className="vtIdCell">{ticket.ticket_id || "N/A"}</td>
                      <td>{ticket.title}</td>
                      <td>{ticket.category || "—"}</td>
                      <td>
                        <span className={`priorityBadge ${getPriorityClass(ticket.priority)}`}>
                          {getPriorityLabel(ticket.priority)}
                        </span>
                      </td>
                      <td>
                        <span className={`statusBadge ${getStatusClass(ticket.status)}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
