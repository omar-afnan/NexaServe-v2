import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdDelete,
  MdPerson,
  MdRefresh,
  MdError,
  MdConfirmationNumber
} from "react-icons/md";
import './CSS/ViewTickets.css';
import SideBar from "../components/sideBar";
import fetchWithAuth from "../api/fetchWithAuth";

function ViewTickets() {
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
      const token = sessionStorage.getItem('token');
      const response = await fetchWithAuth("http://localhost:5000/tickets/all", {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch tickets. Please reload the page");
      }
      const data = await response.json();
      setTickets(data);
      setLoading(false);
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // Filter tickets based on search and filters
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = (ticket.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ticket.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ticket.category || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "All" || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === "All" || ticket.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const handleDeleteTicket = async (ticketId) => {
    if (window.confirm("Are you sure you want to delete this ticket?")) {
      try {
        const token = sessionStorage.getItem('token');
        const response = await fetchWithAuth(`http://localhost:5000/tickets/${ticketId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          setTickets(tickets.filter(ticket => ticket.ticket_id !== ticketId));
        } else {
          alert("Failed to delete ticket");
        }
      } catch (error) {
        alert("Error deleting ticket: " + error.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="ticketPageLayout">
        <SideBar />
        <main className="ticketPageMain">

          <div className="ticketPortalWrapper">

            <div className="loadingContainer">

              <MdRefresh size={48} style={
                {
                  color: "#3b82f6",
                  marginBottom: "16px"
                }} />

              <p>Loading tickets</p>

            </div>

          </div>
        </main>

      </div>
    );
  }

  if (error) {
    return (
      <div className="ticketPageLayout">
        <SideBar />
        <main className="ticketPageMain">

          <div className="ticketPortalWrapper">

            <div className="errorContainer">

              <MdError size={48} style={
                {
                  color: "#ef4444",
                  marginBottom: "16px"
                }} />

              <p>Error: {error}</p>

            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="ticketPageLayout">
      <SideBar />
      <main className="ticketPageMain">
        <div className="ticketPortalWrapper">
          {/* Header Section */}
          <div className="portalHeader">
            <div className="headerContent">
              <div className="headerInfo">
                <h1>
                  <MdConfirmationNumber size={22} style={{ marginRight: 8, verticalAlign: 'middle', display: 'inline-block', color: '#0f766e' }} />
                  Support Tickets
                </h1>
                <p>Manage and resolve incoming support requests</p>
              </div>
            </div>
          </div>

          {/* Filters Section */}
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
                <option value="other">Other
                </option>
              </select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="resultsSummary">
            <p>Showing {filteredTickets.length} of {tickets.length} tickets</p>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="emptyState">
              <h3>No tickets found</h3>
              <p>Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            <div className="ticketsGrid">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.ticket_id}
                  className="supportTicketCard"
                  onClick={() => navigate(`/tickets/${ticket.ticket_id}`)}
                  style={
                    {
                      cursor: 'pointer'
                    }
                  }
                >
                  <div className="cardHeader">
                    <div className="ticketInfo">
                      <h3>{ticket.ticket_id}</h3>
                      <h4>{ticket.title}</h4>
                    </div>

                    <div className="cardActions">
                      <button
                        className="DeleteButton"
                        onClick={(e) => {
                          e.stopPropagation(); {/* stop card click firing */ }
                          handleDeleteTicket(ticket.ticket_id);
                        }}
                        title="Delete ticket"
                      >
                        <MdDelete size={18} color="#ffffff" />
                      </button>
                    </div>
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
                      <span className={`statusBadge status-${ticket.status.toLowerCase().replace(' ', '-')}`}>
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
      </main>
    </div>
  );
}

export default ViewTickets;
