import React, { useEffect, useMemo, useState } from "react";
import SideBar from "../components/sideBar";
import { MdInsights } from "react-icons/md";
import "./CSS/MyPerformance.css";

const API_BASE = "http://localhost:5000";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function getMyId() {
  const raw = sessionStorage.getItem("userId");
  if (raw) return Number(raw);
  const token = sessionStorage.getItem("token");
  if (!token) return null;
  const payload = decodeJwt(token);
  return payload ? Number(payload.user_id || payload.userId) : null;
}

function StatusBadge({ flag }) {
  const cls = `mpBadge mpBadge-${flag || "normal"}`;
  const label = flag ? flag.charAt(0).toUpperCase() + flag.slice(1) : "—";
  return <span className={cls}>{label}</span>;
}

export default function MyPerformance() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const myId = getMyId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError("");
        const token = sessionStorage.getItem("token");
        const res = await fetch(`${API_BASE}/supervisor-logs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const mine = Array.isArray(data)
          ? data.filter((l) => Number(l.agent_id) === myId)
          : [];
        mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setLogs(mine);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load performance data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [myId]);

  const latest = logs[0] || null;
  const history = useMemo(() => logs.slice(0, 10), [logs]);

  return (
    <div className="mpLayout">
      <SideBar />
      <main className="mpMain">
        <div className="mpContainer">
          <div className="mpTopBar">
            <div>
              <h1>
                <MdInsights size={22} style={
                  {
                    marginRight: 8, verticalAlign: 'middle', backgroundColor: '#0f766e', color: "white", borderRadius: '50%', padding: '2px'
                  }} />
                My Performance
              </h1>
              <p>Your personal workload evaluation</p>
            </div>
          </div>

          {error && <div className="mpAlert mpAlertError">{error}</div>}
          {!loading && !error && !myId && (
            <div className="mpAlert mpAlertError">
              Could not determine your user ID. Please log in again.
            </div>
          )}

          <div className="mpStatsRow">
            <div className="mpStatCard">
              <div className="mpStatLabel">Current Status</div>
              <div className="mpStatBadgeWrap">
                {latest ? <StatusBadge flag={latest.flag} /> : <span className="mpDash">—</span>}
              </div>
            </div>
            <div className="mpStatCard">
              <div className="mpStatLabel">Tickets Assigned</div>
              <div className="mpStatValue">
                {latest ? latest.tickets_assigned : "—"}
              </div>
            </div>
            <div className="mpStatCard">
              <div className="mpStatLabel">Resolved Last Hour</div>
              <div className="mpStatValue">
                {latest ? latest.tickets_resolved_last_hour : "—"}
              </div>
            </div>
            <div className="mpStatCard">
              <div className="mpStatLabel">Avg Resolution Time</div>
              <div className="mpStatValue">
                {latest
                  ? `${Number(latest.avg_resolution_hours || 0).toFixed(2)} h`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="mpCard mpFeedbackCard">
            <div className="mpFeedbackHeader">
              <div className="mpFeedbackTitle">
                <MdInsights size={18} color="#0D9488" />
                <h2>Latest Supervisor Feedback</h2>
              </div>
              {latest && <StatusBadge flag={latest.flag} />}
            </div>
            <div className="mpFeedbackBody">
              {loading ? (
                <div className="mpEmpty">Loading…</div>
              ) : latest ? (
                <>
                  <p className="mpReasoning">
                    {latest.ollama_reasoning || "No reasoning provided."}
                  </p>
                  {latest.action_taken && (
                    <p className="mpAction">
                      <strong>Action:</strong> {latest.action_taken}
                    </p>
                  )}
                  <p className="mpTimestamp">{formatDate(latest.created_at)}</p>
                </>
              ) : (
                <div className="mpEmpty">
                  No supervisor evaluation yet for your account.
                </div>
              )}
            </div>
          </div>

          <div className="mpCard">
            <div className="mpCardHeader">
              <MdInsights size={18} color="#0D9488" />
              <h2>Performance History</h2>
            </div>
            <div className="mpTableWrap">
              <table className="mpTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Assigned</th>
                    <th>Resolved Last Hour</th>
                    <th>Avg Resolution</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="mpEmpty">
                        Loading…
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="mpEmpty">
                        No history yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.tickets_assigned}</td>
                        <td>{row.tickets_resolved_last_hour}</td>
                        <td>
                          {Number(row.avg_resolution_hours || 0).toFixed(2)} h
                        </td>
                        <td>
                          <StatusBadge flag={row.flag} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
