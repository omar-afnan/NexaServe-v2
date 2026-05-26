import React, { useEffect, useState, useMemo } from "react";
import AdminSideBar from "../components/AdminSideBar";
import { MdAnalytics, MdRefresh, MdPlayArrow } from "react-icons/md";
import "./CSS/AgentPerformance.css";

const API_BASE = "http://localhost:5000";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function StatusBadge({ flag }) {
  const cls = `apBadge apBadge-${flag}`;
  const label = flag ? flag.charAt(0).toUpperCase() + flag.slice(1) : "—";
  return <span className={cls}>{label}</span>;
}

export default function AgentPerformance() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchLogs = async () => {
    try {
      setError("");
      const token = sessionStorage.getItem("token");
      const res = await fetch(`${API_BASE}/supervisor-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load supervisor logs");
    } finally {
      setLoading(false);
    }
  };

  const runSupervisor = async () => {
    try {
      setRunning(true);
      setMessage("");
      setError("");
      const token = sessionStorage.getItem("token");
      const res = await fetch(`${API_BASE}/supervisor-run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setMessage("Supervisor cycle completed");
      await fetchLogs();
    } catch (err) {
      setError(err.message || "Failed to run supervisor");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Deduplicate: latest log per agent
  const latestPerAgent = useMemo(() => {
    const map = new Map();
    for (const log of logs) {
      const existing = map.get(log.agent_id);
      if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
        map.set(log.agent_id, log);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.agent_name.localeCompare(b.agent_name)
    );
  }, [logs]);

  const stats = useMemo(() => {
    const total = latestPerAgent.length;
    let overloaded = 0;
    let underperforming = 0;
    let normal = 0;
    for (const l of latestPerAgent) {
      if (l.flag === "overloaded") overloaded++;
      else if (l.flag === "underperforming") underperforming++;
      else if (l.flag === "normal") normal++;
    }
    return { total, overloaded, underperforming, normal };
  }, [latestPerAgent]);

  const recentDecisions = useMemo(() => logs.slice(0, 10), [logs]);

  return (
    <div className="apLayout">
      <AdminSideBar />
      <main className="apMain">
        <div className="apContainer">
          <div className="apTopBar">
            <div>
              <h1>
                <MdAnalytics size={22} style={
                  {
                    marginRight: 8, verticalAlign: 'middle', backgroundColor: '#0f766e', color: "white"
                  }} />
                Agent Performance
              </h1>
              <p>AI-powered workload supervision</p>
            </div>
            <div className="apTopBarRight">
              <button
                className="apBtn apBtnSecondary"
                onClick={fetchLogs}
                disabled={loading || running}
                type="button"
              >
                <MdRefresh size={16} />
                Refresh
              </button>
              <button
                className="apBtn apBtnPrimary"
                onClick={runSupervisor}
                disabled={running}
                type="button"
              >
                <MdPlayArrow size={16} />
                {running ? "Running…" : "Run Supervisor"}
              </button>
            </div>
          </div>

          {error && <div className="apAlert apAlertError">{error}</div>}
          {message && <div className="apAlert apAlertSuccess">{message}</div>}

          <div className="apStatsRow">
            <div className="apStatCard">
              <div className="apStatLabel">Total Agents</div>
              <div className="apStatValue">{stats.total}</div>
            </div>
            <div className="apStatCard">
              <div className="apStatLabel">Overloaded Agents</div>
              <div className="apStatValue apStatValue-overloaded">
                {stats.overloaded}
              </div>
            </div>
            <div className="apStatCard">
              <div className="apStatLabel">Underperforming</div>
              <div className="apStatValue apStatValue-underperforming">
                {stats.underperforming}
              </div>
            </div>
            <div className="apStatCard">
              <div className="apStatLabel">Normal</div>
              <div className="apStatValue apStatValue-normal">{stats.normal}</div>
            </div>
          </div>

          <div className="apCard">
            <div className="apCardHeader">
              <MdAnalytics size={18} color="#0D9488" />
              <h2>Agent Status</h2>
            </div>
            <div className="apTableWrap">
              <table className="apTable">
                <thead>
                  <tr>
                    <th>Agent Name</th>
                    <th>Assigned Tickets</th>
                    <th>Resolved Last Hour</th>
                    <th>Avg Resolution Time</th>
                    <th>Status</th>
                    <th>Last Action</th>
                    <th>Logged At</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="apEmpty">
                        Loading…
                      </td>
                    </tr>
                  ) : latestPerAgent.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="apEmpty">
                        No supervisor data yet. Click "Run Supervisor" to start.
                      </td>
                    </tr>
                  ) : (
                    latestPerAgent.map((row) => (
                      <tr key={row.id}>
                        <td>{row.agent_name}</td>
                        <td>{row.tickets_assigned}</td>
                        <td>{row.tickets_resolved_last_hour}</td>
                        <td>
                          {Number(row.avg_resolution_hours || 0).toFixed(2)} h
                        </td>
                        <td>
                          <StatusBadge flag={row.flag} />
                        </td>
                        <td className="apActionCell">
                          {row.action_taken || "—"}
                        </td>
                        <td>{formatDate(row.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="apCard">
            <div className="apCardHeader">
              <MdAnalytics size={18} color="#0D9488" />
              <h2>AI Supervisor Decisions</h2>
            </div>
            <div className="apDecisionsList">
              {recentDecisions.length === 0 ? (
                <div className="apEmpty">No decisions logged yet.</div>
              ) : (
                recentDecisions.map((d) => (
                  <div key={d.id} className="apDecisionItem">
                    <div className="apDecisionTop">
                      <span className="apDecisionAgent">{d.agent_name}</span>
                      <StatusBadge flag={d.flag} />
                      <span className="apDecisionTime">
                        {formatDate(d.created_at)}
                      </span>
                    </div>
                    <div className="apDecisionReason">
                      {d.ollama_reasoning || "No reasoning provided."}
                    </div>
                    {d.action_taken && (
                      <div className="apDecisionAction">
                        <strong>Action:</strong> {d.action_taken}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
