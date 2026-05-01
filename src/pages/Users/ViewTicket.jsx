import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import UserSideBar from "../../components/userSideBar";
import "../CSS/UserTickets.css";
import fetchWithAuth from "../../api/fetchWithAuth";

import {
  MdConfirmationNumber,
} from "react-icons/md";


export default function UserViewTicket() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      if (!response.ok) {
        throw new Error("Failed to fetch tickets");
      }

      const data = await response.json();
      setTickets(Array.isArray(data) ? data : []);
      setLoading(false);
    }
    catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getPriorityLabel = (priority) => {
    if (!priority) {
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

  const toClassName = (str) => {
    return str
      .toLowerCase()
      .split(/[\s-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join("_");
  };

  return (
    <div className="layout">
      <UserSideBar />
      <main className="ticketContent">
        <div className="ticketHeader">
          <div style={{ display: "flex", alignItems: "center" }}>
            <MdConfirmationNumber size={28} style={
              {
                marginRight: 10,
                verticalAlign: 'middle',
                color: "white"
              }
            } />
            <h2>My Tickets</h2>
          </div>
          <button className="backBtn" onClick={() => navigate("/UserDashboard")}>
            Back to Dashboard
          </button>
        </div>

        {loading && <p className="loading">
          Load tickets
        </p>}

        {error && <p className="error">{error}</p>}

        {!loading && !error && (
          <div className="ticketsTableContainer">
            {tickets.length === 0 ? (
              <p className="noTickets">No tickets found. Create a ticket first</p>
            ) : (
              <table className="ticketsTable">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Category</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets
                    .slice()
                    .sort((a, b) => {
                      const priorityOrder = {
                        "critical": 0,
                        "high": 1,
                        "medium": 2,
                        "low": 3
                      };

                      const aPriority = String(a.priority || "medium").toLowerCase();
                      const bPriority = String(b.priority || "medium").toLowerCase();

                      return (priorityOrder[aPriority] ?? 4) - (priorityOrder[bPriority] ?? 4);
                    })
                    .map((ticket) => (
                      <tr key={ticket.ticket_id}>
                        <td>{ticket.ticket_id || "N/A"}</td>
                        <td>{ticket.title}</td>
                        <td>
                          <span className={`statusBadge status${toClassName(ticket.status)}`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td>
                          <span className={`priorityBadge priority${toClassName(String(ticket.priority || 'medium'))}`}>
                            {getPriorityLabel(ticket.priority)}
                          </span>
                        </td>
                        <td>{ticket.category}</td>
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
