import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MdNotifications, MdMarkEmailRead, MdDelete } from "react-icons/md";
import Sidebar from "../components/sideBar";
import "./CSS/SupportNotifications.css";

function SupportNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const getToken = () => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      navigate("/login", { state: { reason: "session_expired" } });
      return null;
    }
    return token;
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      if (!token) return;

      const res = await fetch("http://localhost:5000/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:5000/notifications/${id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === id ? { ...n, is_read: 1 } : n))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const markAllRead = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("http://localhost:5000/notifications/mark-all-read", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to mark all as read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (err) {
      setError(err.message);
    }
  };

  const clearAll = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("http://localhost:5000/notifications/delete-all", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to clear notifications");
      setNotifications([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  return (
    <div className="notifLayout">
      <Sidebar />
      <main className="notifMain">
        <div className="notifHeader">
          <div className="notifTitleGroup">
            <div className="notifTitleIcon">
              <MdNotifications size={22} />
            </div>
            <div>
              <h1 className="notifTitle">Notifications</h1>
              <p className="notifSubtitle">Updates assigned to your account</p>
            </div>
          </div>
          <div className="notifActions">
            <button
              type="button"
              className="notifBtn notifBtnPrimary"
              onClick={markAllRead}
              disabled={notifications.length === 0}
            >
              <MdMarkEmailRead size={16} />
              Mark All Read
            </button>
            <button
              type="button"
              className="notifBtn notifBtnDanger"
              onClick={clearAll}
              disabled={notifications.length === 0}
            >
              <MdDelete size={16} />
              Clear All
            </button>
          </div>
        </div>

        {error && <div className="notifError">{error}</div>}

        {loading ? (
          <div className="notifLoading">Loading notifications…</div>
        ) : notifications.length === 0 ? (
          <div className="notifEmpty">You have no notifications.</div>
        ) : (
          <div className="notifList">
            {notifications.map((n) => {
              const unread = !n.is_read || n.is_read === 0;
              return (
                <div
                  key={n.notification_id}
                  className={`notifItem ${unread ? "notifItemUnread" : ""}`}
                  onClick={() => unread && markAsRead(n.notification_id)}
                >
                  <div className={`notifDot ${unread ? "" : "notifDotRead"}`} />
                  <div className="notifItemBody">
                    <p className="notifItemMessage">{n.message}</p>
                    <div className="notifItemMeta">
                      {n.type && <span className="notifBadge">{n.type}</span>}
                      <span>{formatDate(n.created_at)}</span>
                      <span>{unread ? "Unread" : "Read"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default SupportNotifications;
