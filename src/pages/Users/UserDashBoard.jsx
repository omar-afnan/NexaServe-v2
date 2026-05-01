import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../CSS/UserDashboard.css";
import UserSideBar from "../../components/userSideBar";
import TicketSummary from "../../components/TicketSummary";
import { MdPerson, MdConfirmationNumber } from "react-icons/md";
import fetchWithAuth from "../../api/fetchWithAuth";

function UserDashboard() {
  const navigate = useNavigate();
  const [userTickets, setUserTickets] = useState([]);
  const [userName, setUserName] = useState("");

  // Role + token validation
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
    //  the user from other roles so that user doesnt have any sort of access to admin or support pages
    //  Load tickets
    fetchUserTickets();
  }, []);

  const fetchUserTickets = async () => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        return;
      }

      const response = await fetchWithAuth("http://localhost:5000/tickets", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setUserTickets(data);
    } catch (error) {
    }
  };

  return (
    <div className="userDashboardContainer">
      <UserSideBar />
      <div className="mainContent">
        <header className="topBar">
          <div className="topBarContent">
            <h2>User Dashboard</h2>
            <p className="welcomeText">
              <MdPerson size={20} style={
                {
                  marginRight: 8,
                  verticalAlign: 'middle'
                }
              } />
              Welcome back, {userName}
            </p>
          </div>
        </header>

        {/* Ticket section with icon */}
        <div className="ticketSectionWrapper">
          <div className="ticketSectionHeader">
            <MdConfirmationNumber size={24} style={
              {
                marginRight: 8
              }}
            />
            <span>My Tickets</span>
          </div>
          
          <TicketSummary tickets={userTickets} />
        </div>
      </div>
    </div>
  );
}

export default UserDashboard;
