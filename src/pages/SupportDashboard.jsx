import { useState, useEffect, useMemo } from "react";
import "./CSS/SupportDashboard.css";
import SideBar from "../components/sideBar";
import TicketTable from "../components/TicketTable";
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
  const [activeFilter, setActiveFilter] = useState("All");
  const [isAnimating, setIsAnimating] = useState(false);

  const handleFilterChange = (newFilter) => {
    if (newFilter === activeFilter) return;
    setIsAnimating(true);
    setTimeout(() => {
      setActiveFilter(newFilter);
      setIsAnimating(false);
    }, 150);
  };

  useEffect(() => {
    const name = sessionStorage.getItem("userName");
    setUserName(name || "Support Agent");

    fetchTickets();
    const interval = setInterval(() => fetchTickets(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTickets = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
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
        if (showLoader) setLoading(false);
        return;
      }

      setTickets(data);
      calculateStats(data);
      if (showLoader) setLoading(false);
    } catch (error) {
      if (showLoader) setLoading(false);
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
        setTickets((prevTickets) => {
          const next = prevTickets.filter((t) => t.ticket_id !== ticketId);
          calculateStats(next);
          return next;
        });
        fetchTickets(false);
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
        fetchTickets(false);
      } else {
        const errorData = await response.json();
        alert(`Failed to update ticket status: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      alert("Network error updating the ticket status.");
    }
  };

  const filteredTickets = useMemo(() => {
    return activeFilter === "All"
      ? tickets
      : tickets.filter((t) => t.status === activeFilter);
  }, [tickets, activeFilter]);

  return (
    <div className="dashboardLayout">
      <SideBar />

      <main className="dashboardMain">
        <div className="dashboardContainer">
          <div className="dashboardTopBar">
            <div className="topBarLeft">
              <h1>
                <MdPendingActions size={22} style={{ marginRight: 8, verticalAlign: 'middle', color: '#0f766e' }} />
                Triage Queue
              </h1>
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
                <h2>
                  <IoTicketSharp size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: '#0f766e' }} />
                  Recent Assigned Tickets
                </h2>
              </div>
              <div className="filterPills">
                {["All", "Open", "In Progress", "Closed"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`filterPill ${activeFilter === f ? "filterPillActive" : ""}`}
                    onClick={() => handleFilterChange(f)}
                  >
                    {f}
                  </button>
                ))}
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
              <div className={`tableWrapper ticketTableWrapper ${isAnimating ? "tableAnimating" : ""}`}>
                <TicketTable
                  tickets={filteredTickets}
                  onStatusChange={changeStatus}
                  onDelete={handleDelete}
                  pageSize={10}
                />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
