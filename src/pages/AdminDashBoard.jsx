
import { useNavigate } from "react-router-dom";
import "../pages/CSS/AdminDashboard.css";
import AdminSideBar from '../components/AdminSideBar';
import AdminNotification from '../components/AdminNotification';
import fetchWithAuth from '../api/fetchWithAuth';
import { useState, useEffect, useMemo } from "react";
import {
  MdDashboard,
  MdConfirmationNumber,
  MdCheckCircle,
  MdPendingActions,
  MdRefresh,
  MdAccessTime,
  MdList,
  MdBarChart,
  MdGroup,
  MdDelete,
} from "react-icons/md";

import {
  IoTicketSharp,
  IoWarning,
  IoCheckmarkDone,
} from "react-icons/io5";

import { HiClock } from "react-icons/hi2";

function AdminDashboard() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [stats, setStats] = useState({
    totalTickets: 0,
    totalUsers: 0,
    openTickets: 0,
    closedTickets: 0,
    criticalPriorityTickets: 0,
    highPriorityTickets: 0,
    mediumPriorityTickets: 0,
    lowPriorityTickets: 0,
  });

  useEffect(() => {

    const name = sessionStorage.getItem("userName");

    setUserName(name || "Admin");

    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);

      // verify token  auth before fetching tickets
      const token = sessionStorage.getItem('token');
      if (!token) {
        alert('Please login first');
        window.location.href = '/login';
        return;
      }

      // fetch tickets from backend
      const ticketsResponse = await fetchWithAuth('http://localhost:5000/tickets', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      //update state
      if (!ticketsResponse.ok) {
        throw new Error('Failed to fetch tickets');
      }

      const ticketsData = await ticketsResponse.json();

      //  VALIDATE ARRAY
      if (Array.isArray(ticketsData)) {
        setTickets(ticketsData);
        calculateStats(ticketsData);
      } else {

        setTickets([]);
        calculateStats([]);
      }

      setLoading(false);
    } catch (error) {

      setTickets([]);
      setLoading(false);
    }
  };

  const changeStatus = async (ticketId, newStatus) => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/tickets/${ticketId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchAdminData();
      } else {
        const err = await response.json();
        alert(`Failed to update status: ${err.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert("Network error updating status.");
    }
  };



  const calculateStats = (ticketsData) => {
    const stats =
    {
      totalTickets: ticketsData.length,

      totalUsers: new Set(ticketsData.map(t => t.created_by)).size,

      openTickets: ticketsData.filter(t => t.status === "Open").length,

      closedTickets: ticketsData.filter(t => t.status === "Closed").length,
      criticalPriorityTickets: ticketsData.filter(t => t.priority === "Critical").length,

      highPriorityTickets: ticketsData.filter(t => t.priority === 'High' || t.priority === 'Critical').length,

      mediumPriorityTickets: ticketsData.filter(t => t.priority === 'Medium').length,

      lowPriorityTickets: ticketsData.filter(t => t.priority === 'Low').length
    };
    setStats(stats);
  };


  const handleDelete = async (ticketId) => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetchWithAuth(`http://localhost:5000/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        fetchAdminData();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(`Failed to delete ticket: ${err.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert("Network error. Could not delete ticket.");
    }
  };

  const sortedTickets = useMemo(() => {
    return tickets
      .slice()
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const aPriority = String(a.priority || "medium").toLowerCase();
        const bPriority = String(b.priority || "medium").toLowerCase();
        return (priorityOrder[aPriority] ?? 4) - (priorityOrder[bPriority] ?? 4);
      })
      .slice(0, 10);
  }, [tickets]);

  return (
    <div className="adminLayout">
      <AdminSideBar />

      <main className="mainContent">
        <div className="dashboardContainer">
          <header className="headerPanel">
            <div className="headerInner">
              <div className="heroText">
                <div>
                  <h1>Dashboard</h1>
                  <p className="heroSubtitle">System overview</p>
                </div>
              </div>
              <div className="heroActions">
                <AdminNotification />
                <button onClick={fetchAdminData} className="refreshButton">
                  <MdRefresh size={16} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </header>

     
          <div className="statsSection">
            <section className="statsGrid">
              <div className="statCard statTotal">
                <div className="statHead">
                  <div className="iconBox">
                    <IoTicketSharp />
                  </div>
                </div>

                <div className="statCardBody">
                  <h3>Total Tickets</h3>
                  <p className="statNumber">{loading ? "..." : stats.totalTickets}</p>
                  <span className="statLabel">All time</span>
                </div>
              </div>

              <div className="statCard statUsers">
                <div className="statHead">
                  <div className="iconBox">
                    <MdGroup />
                  </div>
                </div>

                <div className="statCardBody">
                  <h3>Total Users</h3>
                  <p className="statNumber">
                    {loading ? "..." : stats.totalUsers}
                  </p>

                  <span className="statLabel">
                    Registered
                  </span>

                </div>
              </div>

              <div className="statCard statOpen">
                <div className="statHead">
                  <div className="iconBox"><HiClock /></div>
                </div>

                <div className="statCardBody">
                  <h3>Open Tickets</h3>
                  <p className="statNumber">
                    {loading ? "..." : stats.openTickets}
                  </p>
                  <span className="statLabel">Awaiting response</span>
                </div>
              </div>

              <div className="statCard statClosed">
                <div className="statHead">
                  <div className="iconBox"><IoCheckmarkDone /></div>
                </div>

                <div className="statCardBody">
                  <h3>Closed</h3>
                  <p className="statNumber">
                    {loading ? "..." : stats.closedTickets}
                  </p>

                  <span className="statLabel">Resolved</span>
                </div>
              </div>

              <div className="statCard statCritical">
                <div className="statHead">
                  <div className="iconBox"><IoWarning /></div>
                </div>

                <div className="statCardBody">
                  <h3>Critical</h3>
                  <p className="statNumber">
                    {loading ? "..." : stats.criticalPriorityTickets}
                  </p>

                  <span className="statLabel">
                    Urgent attention
                  </span>
                </div>
              </div>

              <div className="statCard statHighPriority">
                <div className="statHead">

                  <div className="iconBox">
                    <IoWarning />
                  </div>
                </div>
                <div className="statCardBody">
                  <h3>High Priority</h3>

                  <p className="statNumber">
                    {loading ? "..." : stats.highPriorityTickets}
                  </p>

                  <span className="statLabel">Urgent tickets</span>
                </div>
              </div>

              <div className="statCard statMediumPriority">
                <div className="statHead">
                  <div className="iconBox"><MdPendingActions /></div>
                </div>
                <div className="statCardBody">
                  <h3>Medium Priority</h3>
                  <p className="statNumber">{loading ? "..." : stats.mediumPriorityTickets}</p>
                  <span className="statLabel">Normal tickets</span>
                </div>
              </div>

              <div className="statCard statLowPriority">
                <div className="statHead">
                  <div className="iconBox"><MdCheckCircle /></div>
                </div>

                <div className="statCardBody">
                  <h3>Low Priority</h3>
                  <p className="statNumber">
                    {loading ? "..." : stats.lowPriorityTickets}
                  </p>

                  <span className="statLabel">
                    Low urgency
                  </span>

                </div>
              </div>
            </section>
          </div>

          {/* TICKETS TABLE */}
          <section className="ticketsSection">
            <div className="sectionHeader">
              <div className="sectionHeaderLeft">
                <h2>Recent Tickets</h2>
              </div>
            </div>

            {loading ? (
              <div className="loadingState">
                <div className="spinner"></div>
                <p>Loading tickets...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="emptyState">
                <IoTicketSharp size={64} />
                <p>No tickets found</p>
              </div>
            ) : (
              <div className="tableBox">
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

                      <th>
                        <div className="thContent">
                          <span>Actions</span>
                        </div>
                      </th>
                    </tr>
                  </thead>



                  <tbody>
                    {sortedTickets.map((ticket) => (
                      <tr key={ticket.ticket_id}>

                        <td>

                          <span className="ticketId">
                            {ticket.ticket_id}
                          </span>
                        </td>


                        <td>
                          <div className="ticketTitle">
                            {ticket.title}
                          </div>
                        </td>


                        <td>
                          <span className="categoryBadge">
                            {ticket.category}
                          </span>
                        </td>

                        <td>
                          <span className={`priorityBadge priority-${String(ticket.priority || "low").toLowerCase()}`}>
                            {ticket.priority === 0 || ticket.priority === "0" ? "Not Set" : ticket.priority}
                          </span>
                        </td>

                        <td>
                          <select
                            value={ticket.status}
                            onChange={(e) => changeStatus(ticket.ticket_id, e.target.value)}
                            className={`statusSelect status-${ticket.status.toLowerCase().replace(" ", "-")}`}>
                            
                            <option value="Open">Open</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Closed">Closed</option>
                           
                          </select>
                        </td>

                        <td>
                          <span className="ticketDate">
                            {new Date(ticket.created_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                            <br />

                            {/* Time */}
                            <span className="ticketTime">
                              {new Date(ticket.created_at).toLocaleTimeString("en-US", {
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </td>

                        <td>
                          <button onClick={() => handleDelete(ticket.ticket_id)} className="deleteButton">
                            <MdDelete size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* QUICK ACTIONS */}
          <section className="quickActionsSection">
            <h2>Quick Actions</h2>

            <div className="quickActionsButtons">
              <a href="/admin/tickets" className="actionButtonPrimary">
                <MdList size={20} />
                View All Tickets
              </a>
              <a href="/admin-reports" className="actionButtonSecondary">
                <MdBarChart size={20} />
                Generate Reports
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
