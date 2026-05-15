import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../CSS/UserDashboard.css";
import UserSideBar from "../../components/userSideBar";
import TicketSummary from "../../components/TicketSummary";
import { MdAdd } from "react-icons/md";
import fetchWithAuth from "../../api/fetchWithAuth";

const STATUS_FILTERS = ["All", "Open", "In Progress", "Closed"];

function UserDashboard() {
  const navigate = useNavigate();
  const [userTickets, setUserTickets] = useState([]);
  const [userName, setUserName] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    const role = sessionStorage.getItem("role");
    const token = sessionStorage.getItem("token");
    const name = sessionStorage.getItem("userName");

    setUserName(name || "User");

    if (!token) {
      navigate("/login", { state: { reason: "session_expired" } });
      return;
    }

    if (role !== "user") {
      if (role === "admin") {
        navigate("/AdminDashboard");
      } else if (role === "support") {
        navigate("/dashboard");
      } else {
        navigate("/login", { state: { reason: "session_expired" } });
      }
      return;
    }

    fetchUserTickets();
  }, []);

  const fetchUserTickets = async () => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const response = await fetchWithAuth("http://localhost:5000/tickets", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      setUserTickets(data);
    } catch (error) {}
  };

  const filteredTickets =
    activeFilter === "All"
      ? userTickets
      : userTickets.filter((t) => t.status === activeFilter);

  return (
    <div className="userDashboardContainer">
      <UserSideBar />
      <div className="mainContent">
        {/* Top bar */}
        <div className="dashTopBar">
          <div className="dashTopBarLeft">
            <h2 className="dashTitle">My Tickets</h2>
            <p className="dashSubtitle">Welcome back, {userName}</p>
          </div>
          <button className="newTicketBtn" onClick={() => navigate("/chat")}>
            <MdAdd size={18} style={{ marginRight: 6 }} />
            New Ticket
          </button>
        </div>

        {/* Filter pills */}
        <div className="filterPills">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              className={`filterPill ${activeFilter === f ? "active" : ""}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Ticket table card */}
        <div className="ticketTableCard">
          <TicketSummary tickets={filteredTickets} />
        </div>
      </div>
    </div>
  );
}

export default UserDashboard;
