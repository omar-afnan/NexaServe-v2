import { useState, useEffect, useMemo } from "react";
import "./CSS/SupportDashboard.css";
import SideBar from "../components/sideBar";
import fetchWithAuth from "../api/fetchWithAuth";

import {
  MdPendingActions,
  MdCheckCircle,
  MdDelete,
  MdAccessTime,
  MdTrendingDown,
  MdConfirmationNumber
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
          <div className="dashboardTopBar">
            <div className="topBarLeft">
              <h1>Triage Queue</h1>
              <p>Manage and resolve assigned tickets</p>
            </div>
          </div>


          <div className="statsWrapper">
            <section className="statsGrid">
              <div className="statCard statOpen">
                <div className="statIconSquare"><HiClock /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.open}</div>
                  <div className="statLabel">Open</div>
                </div>
              </div>

              <div className="statCard statProgress">
                <div className="statIconSquare"><MdPendingActions /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.inProgress}</div>
                  <div className="statLabel">In Progress</div>
                </div>
              </div>

              <div className="statCard statClosed">
                <div className="statIconSquare"><IoCheckmarkDone /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.closed}</div>
                  <div className="statLabel">Closed</div>
                </div>
              </div>

              <div className="statCard statCritical">
                <div className="statIconSquare"><IoWarning /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.critical}</div>
                  <div className="statLabel">Critical</div>
                </div>
              </div>

              <div className="statCard statHigh">
                <div className="statIconSquare"><IoWarning /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.highPriority}</div>
                  <div className="statLabel">High Priority</div>
                </div>
              </div>

              <div className="statCard statMedium">
                <div className="statIconSquare"><MdPendingActions /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.mediumPriority}</div>
                  <div className="statLabel">Medium Priority</div>
                </div>
              </div>

              <div className="statCard statLow">
                <div className="statIconSquare"><MdTrendingDown /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.lowPriority}</div>
                  <div className="statLabel">Low Priority</div>
                </div>
              </div>

              <div className="statCard statTotal">
                <div className="statIconSquare"><MdConfirmationNumber /></div>
                <div className="statCardText">
                  <div className="statNumber">{loading ? "..." : stats.total}</div>
                  <div className="statLabel">Total</div>
                </div>
              </div>
            </section>
          </div>

          {/* ticket table  */}
          <section className="ticketsSection">
            <div className="sectionHeader">
              <div className="sectionHeaderLeft">
                <h2>Recent Assigned Tickets</h2>
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
