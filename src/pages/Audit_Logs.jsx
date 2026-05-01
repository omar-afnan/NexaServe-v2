import React, { useState, useEffect } from "react";
import "./CSS/Audit_Logs.css";
import AdminSideBar from "../components/AdminSideBar";
import fetchWithAuth from "../api/fetchWithAuth";
import {
  MdHistory,
  MdFilterList,
  MdRefresh,
  MdSearch,
  MdPerson,
  MdConfirmationNumber,
  MdLogin,
  MdLogout,
  MdEdit,
  MdAdd,
  MdDelete,
  MdAssignment,
  MdComment,
  MdDownload,
  MdExpandMore,
  MdExpandLess,
  MdSchedule
} from "react-icons/md";

import { HiClipboardDocumentList } from "react-icons/hi2";

function AuditLogs() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [users, setUsers] = useState([]);
  const [expandedLog, setExpandedLog] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 20;

  useEffect(() => {
    fetchAuditLogs();
    fetchUsers();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = sessionStorage.getItem("token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetchWithAuth("http://localhost:5000/audit-logs", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data = await response.json();
      setAuditLogs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth("http://localhost:5000/users/all", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
    }
  };

  const getActionIcon = (action) => {
    const icons = {
      login: <MdLogin size={18} />,
      logout: <MdLogout size={18} />,
      signup: <MdPerson size={18} />,
      ticketCreate: <MdAdd size={18} />,
      ticketUpdate: <MdEdit size={18} />,
      ticketDelete: <MdDelete size={18} />,
      ticketAssign: <MdAssignment size={18} />,
      statusChange: <MdAssignment size={18} />,
      priorityChange: <MdFilterList size={18} />,
      commentAdd: <MdComment size={18} />,
      profileUpdate: <MdPerson size={18} />,
      passwordChange: <MdPerson size={18} />,
    };

    return icons[action] || <MdHistory size={18} />;
  };

  const getActionColor = (action) => {
    const colors = {
      login: "actionLogin",
      logout: "actionLogout",
      signup: "actionSignup",
      ticketCreate: "actionCreate",
      ticketUpdate: "actionUpdate",
      ticketDelete: "actionDelete",
      ticketAssign: "actionAssign",
      statusChange: "actionStatus",
      priorityChange: "actionPriority",
      commentAdd: "actionComment",
      profileUpdate: "actionProfile",
      passwordChange: "actionPassword",
    };

    return colors[action] || "actionDefault";
  };

  const formatAction = (action) => {
    const labels = {
      login: "User Login",
      logout: "User Logout",
      signup: "New Registration",

      ticketCreate: "Ticket Created",
      ticketUpdate: "Ticket Updated",
      ticketDelete: "Ticket Deleted",

      ticketAssign: "Ticket Assigned",
      statusChange: "Status Changed",
      priorityChange: "Priority Changed",

      commentAdd: "Comment Added",
      profileUpdate: "Profile Updated",
      passwordChange: "Password Changed",
    };
    return labels[action] || (action ? action.replace(/([A-Z])/g, " $1") : "Unknown");
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),



      time: date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      searchTerm === "" ||
      log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.ticket_id || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = filterAction === "all" || log.action === filterAction;

    const matchesUser =
      filterUser === "all" || log.user_id === parseInt(filterUser);

    const logDate = new Date(log.created_at);
    const matchesDateFrom = !dateFrom || logDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || logDate <= new Date(dateTo + "T23:59:59");

    return (
      matchesSearch &&
      matchesAction &&
      matchesUser &&
      matchesDateFrom &&
      matchesDateTo
    );
  });

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * logsPerPage,
    currentPage * logsPerPage
  );

  const uniqueActions = [...new Set(auditLogs.map((log) => log.action))];

  const exportToCSV = () => {
    const headers = [
      "Timestamp",
      "User",
      "Role",
      "Action",
      "Ticket ID",
      "Details",
      "IP Address",
    ];
    const rows = filteredLogs.map((log) => [
      log.created_at,
      log.userName || "Unknown",
      log.userRole || "N/A",
      formatAction(log.action),
      log.ticket_id || "N/A",
      log.details ? `"${log.details.replace(/"/g, '""')}"` : "",
      log.ipAddress || "N/A",
    ]);

    const csvContent =
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `audit_logs_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterAction("all");
    setFilterUser("all");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  return (
    <div className="auditLogsLayout">
      <AdminSideBar />

      <div className="auditLogsMain">

        <div className="auditHero">
          <div className="heroContent">

            <HiClipboardDocumentList size={28} style={
              {
                color: "white"
              }} />

            <h1>Audit Logs</h1>
          </div>
          <div className="heroActions">
            <button className="exportBtn" onClick={exportToCSV}>
              <MdDownload size={18} />
              Export CSV
            </button>
            <button className="refreshBtn" onClick={fetchAuditLogs}>
              <MdRefresh size={18} />
              Refresh
            </button>
          </div>
        </div>

        <div className="filtersCard">
          <div className="filtersHeader">
            <MdFilterList size={20} />
            <span>Filters</span>
          </div>

          <div className="filtersGrid">
            <div className="filterGroup">
              <label>Search</label>
              <div className="searchInput">
                <MdSearch size={18} />
                <input
                  type="text"
                  placeholder="Search logs"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="filterGroup">
              <label>Action Type</label>
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Actions</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {formatAction(action)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filterGroup">
              <label>User</label>
              <select
                value={filterUser}
                onChange={(e) => {
                  setFilterUser(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Users</option>
                {users.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="filterGroup">
              <label>Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="filterGroup">
              <label>Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="filterGroup filterActions">
              <button className="clearFiltersBtn" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
          </div>
        </div>

       
        <div className="statsRow">
          <div className="statChip">
            <span className="statLabel">Total Logs</span>
            <span className="statValue">{auditLogs.length}</span>
          </div>
          <div className="statChip">
            <span className="statLabel">Filtered Results</span>
            <span className="statValue">{filteredLogs.length}</span>
          </div>
          <div className="statChip">
            <span className="statLabel">Today's Activity</span>
            <span className="statValue">
              {
                auditLogs.filter((log) => {
                  const today = new Date().toDateString();
                  return new Date(log.created_at).toDateString() === today;
                }).length
              }
            </span>
          </div>
        </div>


        <div className="logsCard">
          {loading ? (
            <div className="loadingState">
              <div className="spinner"></div>

              <p>Loading audit logs</p>
            </div>
          ) : error ? (
            <div className="errorState">
              <p>Error: {error}</p>
              <button onClick={fetchAuditLogs}>Retry</button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="emptyState">
              <MdHistory size={48} />

              <p>No logs match current filters</p>

              <span>Change filters or refresh data</span>
            </div>
          ) : (
            <>
              <div className="logsTable">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Details</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.map((log) => {
                      const timestamp = formatTimestamp(log.created_at);
                      const isExpanded = expandedLog === log.logId;

                      return (
                        <React.Fragment key={log.logId}>
                          <tr className="logRow">
                            <td className="timestampCell">
                              <div className="timestampWrapper">
                                <MdSchedule size={14} />
                                <div>
                                  <span className="logDate">
                                    {timestamp.date}
                                  </span>
                                  <span className="logTime">
                                    {timestamp.time}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="userCell">
                              <div className="userInfo">
                                <div className="userAvatar">
                                  {log.userName?.charAt(0).toUpperCase() || "?"}
                                </div>
                                <div>
                                  <span className="userName">
                                    {log.userName || "Unknown"}
                                  </span>
                                  <span className="userRole">
                                    {log.userRole || "N/A"}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`actionBadge ${getActionColor(log.action)}`}
                              >
                                {getActionIcon(log.action)}
                                {formatAction(log.action)}
                              </span>
                            </td>
                            <td>
                              {log.ticket_id ? (
                                <span className="targetTicket">
                                  <MdConfirmationNumber size={14} />
                                  {log.ticket_id}
                                </span>
                              ) : (
                                <span className="noTarget">—</span>
                              )}
                            </td>
                            <td className="detailsCell">
                              <span className="detailsPreview">
                                {log.details
                                  ? log.details.length > 50
                                    ? log.details.substring(0, 50) + "..."
                                    : log.details
                                  : "—"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="expandBtn"
                                onClick={() =>
                                  setExpandedLog(isExpanded ? null : log.logId)
                                }
                              >
                                {isExpanded ? (
                                  <MdExpandLess size={20} />
                                ) : (
                                  <MdExpandMore size={20} />
                                )}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="expandedRow">
                              <td colSpan="6">
                                <div className="expandedContent">
                                  <div className="expandedGrid">
                                    <div className="expandedItem">
                                      <label>Full Details</label>
                                      <p>{log.details || "No details available"}</p>
                                    </div>
                                    <div className="expandedItem">
                                      <label>IP Address</label>
                                      <p>{log.ipAddress || "Not recorded"}</p>
                                    </div>
                                    <div className="expandedItem">
                                      <label>User Agent</label>
                                      <p className="userAgent">
                                        {log.userAgent || "Not recorded"}
                                      </p>
                                    </div>
                                    <div className="expandedItem">
                                      <label>Log ID</label>
                                      <p className="logId">#{log.logId}</p>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="pageBtn"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    First
                  </button>
                  <button
                    className="pageBtn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span className="pageInfo">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className="pageBtn"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                  <button
                    className="pageBtn"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuditLogs;
