import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./CSS/SupportDashboard.css";
import SideBar from "../components/sideBar";
import SupporterNotification from "../components/SupporterNotification";
import fetchWithAuth from "../api/fetchWithAuth";

import {
  MdDashboard,
  MdConfirmationNumber,
  MdCheckCircle,
  MdPendingActions,
  MdRefresh,
  MdDelete,
  MdAccessTime
} from "react-icons/md";

import {
  IoTicketSharp,
  IoWarning,
  IoCheckmarkDone
} from "react-icons/io5";

import {
  HiClock
} from "react-icons/hi2";

function Dashboard() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    open: 0,
    closed: 0,
    inProgress: 0,
    total: 0,
    critical: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const name = sessionStorage.getItem("userName");
    setUserName(name || "Support Agent");

    fetchTickets();
    const interval = setInterval(fetchTickets, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth("http://localhost:5000/tickets", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {

        setTickets([]);
        setLoading(false);
        return;
      }

      setTickets(data);
      calculateStats(data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const calculateStats = (ticketsInformation) => {
    const open = ticketsInformation.filter((t) => t.status === "Open").length;

    const closed = ticketsInformation.filter((t) => t.status === "Closed").length;

    const inProgress = ticketsInformation.filter((t) => t.status === "In Progress").length;

    const critical = ticketsInformation.filter((t) => t.priority === "Critical").length;

    const highPriority = ticketsInformation.filter(
      (t) => t.priority === "High" || t.priority === "Critical"
    ).length;
    const mediumPriority = ticketsInformation.filter((t) => t.priority === "Medium").length;
    const lowPriority = ticketsInformation.filter((t) => t.priority === "Low").length;

    setStats({
      open,
      closed,
      inProgress,
      critical,
      highPriority,
      mediumPriority,
      lowPriority,
      total: ticketsInformation.length
    });
  };

  const handleDelete = async (ticketId) => {
    if (!window.confirm("Are you sure you want to delete this ticket?")) {
      return;
    }

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth(`http://localhost:5000/tickets/${ticketId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        fetchTickets();
      }
      else {
        alert("Failed to delete ticket");
      }

    } catch (error) {
      alert("Failed to delete ticket");
    }
  };

  const changeStatus = async (ticketId, newStatus) => {
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth(`http://localhost:5000/tickets/${ticketId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          {
            status: newStatus
          })
      });

      if (response.ok) {
        setTickets((prevTickets) =>
          prevTickets.map((ticket) =>
            ticket.ticket_id === ticketId ? { ...ticket, status: newStatus } : ticket
          )
        );
        fetchTickets();
      } else {
        const errorData = await response.json();
        alert(`Failed to update ticket status: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      alert("Network error updating the ticket status.");
    }
  };

  const topTenTickets = useMemo(() => {
    return tickets
      .slice()
      .sort((a, b) => {
        const priorityOrder = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3
        };
        const aPriority = String(a.priority || "medium").toLowerCase();
        const bPriority = String(b.priority || "medium").toLowerCase();
        return (priorityOrder[aPriority] ?? 4) - (priorityOrder[bPriority] ?? 4);
      })
      .slice(0, 10);
  }, [tickets]);

  return (
    <div className="dashboardLayout">
      <SideBar />

      <main className="dashboardMain">
        <div className="dashboardContainer">
          {/* heros data content  */}
          <header className="dashboardHero">
            <div className="heroContent">
              <div className="heroText">
                <div className="heroIcon">
                  <MdDashboard size={32} />
                </div>

                <div>
                  <h1>Support Dashboard</h1>
                  <p className="heroSubtitle">
                    Welcome back, <strong>{userName}
                    </strong>
                  </p>
                </div>
              </div>


              <div className="heroActions">
                <SupporterNotification />
                <button onClick={fetchTickets} className="refreshButton">
                  <MdRefresh size={20} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </header>


          <div className="statsWrapper">
            <section className="statsGrid">
              <div className="statCard statOpen">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <HiClock />
                  </div>

                </div>
                <div className="statCardBody">
                  <h3>Open Tickets</h3>
                  <p className="statNumber">{loading ? "..." : stats.open}</p>
                  <span className="statLabel">Awaiting response</span>
                </div>
              </div>

              <div className="statCard statProgress">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <MdPendingActions />
                  </div>
                </div>

                <div className="statCardBody">
                  <h3>In Progress</h3>
                  <p className="statNumber">{loading ? "..." : stats.inProgress}</p>
                  <span className="statLabel">Being worked on</span>
                </div>
              </div>

              <div className="statCard statClosed">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <IoCheckmarkDone />
                  </div>
                </div>
                <div className="statCardBody">
                  <h3>Closed</h3>
                  <p className="statNumber">{loading ? "..." : stats.closed}</p>
                  <span className="statLabel">Resolved successfully</span>
                </div>
              </div>

              <div className="statCard statCritical">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <IoWarning />
                  </div>
                </div>
                <div className="statCardBody">
                  <h3>Critical</h3>
                  <p className="statNumber">{loading ? "..." : stats.critical}</p>
                  <span className="statLabel">Urgent attention</span>
                </div>
              </div>

              <div className="statCard statTotal">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <IoTicketSharp />
                  </div>
                </div>


                <div className="statCardBody">
                  <h3>Total Tickets</h3>
                  <p className="statNumber">{loading ? "..." : stats.total}</p>
                  <span className="statLabel">All time</span>
                </div>
              </div>

              <div className="statCard statHighPriority">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <IoWarning />
                  </div>
                </div>
                <div className="statCardBody">
                  <h3>High Priority</h3>
                  <p className="statNumber">{loading ? "..." : stats.highPriority}</p>
                  <span className="statLabel">Urgent tickets</span>
                </div>
              </div>

              <div className="statCard statMediumPriority">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <MdPendingActions />
                  </div>
                </div>


                <div className="statCardBody">
                  <h3>Medium Priority</h3>
                  <p className="statNumber">{loading ? "..." : stats.mediumPriority}</p>
                  <span className="statLabel">Normal tickets</span>
                </div>
              </div>

              <div className="statCard statLowPriority">
                <div className="statCardHeader">
                  <div className="statIconWrapper">
                    <MdCheckCircle />
                  </div>
                </div>


                <div className="statCardBody">
                  <h3>Low Priority</h3>
                  <p className="statNumber">{loading ? "..." : stats.lowPriority}</p>
                  <span className="statLabel">Low urgency</span>
                </div>
              </div>
            </section>
          </div>

          {/* ticket table  */}
          <section className="ticketsSection">
            <div className="sectionHeader">
              <div className="sectionHeaderLeft">
                <MdConfirmationNumber size={24} />
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
              <div className="tableWrapper">
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
                          <span>Subject</span>
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
                    {topTenTickets.map((ticket) => (
                      <tr
                        key={ticket.ticket_id}
                      >
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
                          <select
                            value={ticket.status}
                            onChange={(e) =>
                              changeStatus(ticket.ticket_id, e.target.value)
                            }
                            className={`statusSelect status-${ticket.status
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            <option value="Open">Open</option>

                            <option value="In Progress">In Progress</option>

                            <option value="Closed">Closed</option>
                          </select>
                        </td>
                        <td>
                          <span className="ticketDate">
                            {new Date(ticket.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric"
                              }
                            )}
                            <br />
                            <span className="ticketTime">
                              {new Date(ticket.created_at).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit"
                                }
                              )}
                            </span>
                          </span>
                        </td>
                        <td>
                          <button
                            className="deleteButton"
                            onClick={() => handleDelete(ticket.ticket_id)}
                            title="Delete ticket"
                          >
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
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
