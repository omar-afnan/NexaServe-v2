import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdDelete,
  MdPerson,
  MdConfirmationNumber,
  MdRefresh,
  MdErrorOutline
} from "react-icons/md";
import "./CSS/AdminViewTickets.css";
import AdminSideBar from "../components/AdminSideBar";

export default function AdminViewTicket() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch("http://localhost:5000/tickets/all", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch tickets. Please reload the page");
      }
      const data = await response.json();
      setTickets(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const term = searchTerm.toLowerCase();
    const searchMatch =
      (t.title ?? "").toLowerCase().includes(term) ||
      (t.description ?? "").toLowerCase().includes(term) ||
      (t.category ?? "").toLowerCase().includes(term);

    if (!searchMatch) {
      return false;
    }

    if (statusFilter !== "All" && t.status !== statusFilter) {
      return false;
    }
    if (priorityFilter !== "All" && t.priority !== priorityFilter) {
      return false;
    }

    return true;
  });

  const handleDeleteTicket = async (ticketId) => {
    if (!window.confirm("Are you sure you want to delete this ticket?")) return;

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch(`http://localhost:5000/tickets/${ticketId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setTickets((prev) => prev.filter((ticket) => ticket.ticket_id !== ticketId));
      } else {
        alert("Failed to delete ticket");
      }
    } catch (err) {
      alert(`Error deleting ticket: ${err.message}`);
    }
  };

  const view = () => {
    if (loading) {
      return (
        <div className="ticketPortalWrapper">
          <div className="loadingContainer">
            <MdRefresh size={40} style={
              {
                color: "#0D9488",
                marginBottom: "12px"
              }} />
            <p>Loading tickets</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="ticketPortalWrapper">
          <div className="errorContainer">
            <MdErrorOutline size={48} style={
              {
                color: "#ef4444",
                marginBottom: "16px"
              }} />
            <p>Error: {error}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="ticketPortalWrapper">
        <div className="portalHeader">
          <div className="headerContent">
            <div className="headerTop">
              <div className="headerInfo">
                <h1>
                  <MdConfirmationNumber size={22} style={
                    {
                      marginRight: 8, verticalAlign: 'middle', display: 'inline-block', backgroundColor: '#0f766e', color: '#fff', borderRadius: '4px', padding: '2px'
                    }} />
                  Admin Tickets
                </h1>
              </div>
            </div>
          </div>
        </div>

        <div className="filtersSection">
          <div className="searchContainer">
            <input
              type="text"
              placeholder="Search tickets by title, description, or category"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="searchInput"
            />
          </div>

          <div className="filterControls">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filterSelect"
            >
              <option value="All">All Status</option>

              <option value="Open">Open</option>

              <option value="In Progress">In Progress</option>

              <option value="Closed">Closed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="filterSelect"
            >
              <option value="All">All Priority</option>

              <option value="Critical">Critical</option>

              <option value="High">High</option>

              <option value="Medium">Medium</option>

              <option value="Low">Low</option>

              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="resultsSummary">
          <p>
            Showing {filteredTickets.length} of {tickets.length} tickets
          </p>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="emptyState">
            <MdConfirmationNumber size={48} color="#94a3b8" style={
              {
                marginBottom: "24px", opacity: 0.5
              }}
            />

            <h3>No matching tickets</h3>
            <p>Change filters or search again</p>
          </div>
        ) : (
          <div className="ticketsGrid">
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.ticket_id}
                className="supportTicketCard"
                onClick={() => navigate(`/tickets/${ticket.ticket_id}`)}
                style={{ cursor: "pointer" }}
              >
                <div className="cardHeader">
                  <div className="ticketInfo">

                    <h3>{ticket.ticket_id}</h3>

                    <h4>{ticket.title}</h4>
                  </div>


                  <button
                    className="DeleteButton"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTicket(ticket.ticket_id);
                    }}
                    title="Delete ticket"
                    aria-label="Delete ticket"
                  >
                    <MdDelete />
                  </button>

                </div>

                <div className="ticketMetadata">
                  <div className="metaRow">
                    <div className="metaGroup">
                      <span className="metaLabel">Category</span>
                      <span className="metaValue">{ticket.category}</span>
                    </div>
                    <div className="metaGroup">
                      <span className="metaLabel">Created</span>
                      <span className="metaValue">{new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="badgeRow">
                    <span className={`statusBadge status-${ticket.status.toLowerCase().replace(" ", "-")}`}>
                      {ticket.status}
                    </span>
                    <span className={`priorityBadge priority-${ticket.priority.toLowerCase()}`}>
                      {ticket.priority}
                    </span>
                  </div>
                </div>

                <div className="cardFooter">
                  <span className="createdBy">
                    <MdPerson size={16} />
                    User ID: {ticket.created_by}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="adminTicketsView ticketPageLayout">
      <AdminSideBar />
      <main className="ticketPageMain">{view()}</main>
    </div>
  );
}
