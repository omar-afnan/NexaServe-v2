import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import UserSideBar from "../../components/userSideBar";
import "../CSS/userNotification.css";
import fetchWithAuth from "../../api/fetchWithAuth";
import {
  MdNotifications,
  MdMarkEmailRead,
  MdRefresh,
  MdNotificationsOff,
  MdComment,
  MdAssignment,
  MdCheckCircle,
  MdInfo,
  MdDelete,
  MdWarning
} from "react-icons/md";

function UserNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchNotifications();
  }, []);

  // grabs notifs from backend, redirects if token is gone
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = sessionStorage.getItem("token");

      if (!token) {
        navigate("/login", { state: { reason: "session_expired" } });
        return;
      }

      const response = await fetchWithAuth("http://localhost:5000/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get notifications");
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setNotifications(data);
      } else {
        setNotifications([]);
      }

      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // flips one notif to read then refreshes
  const markAsRead = async (notificationId) => {
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetchWithAuth(`http://localhost:5000/notifications/${notificationId}/read`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        setError("Failed to mark notification as read. Please try again.");
        return;
      }
      fetchNotifications();
    } catch (err) {
      setError("Failed to mark notification as read. Please try again.");
    }
  };

  //  marks everything as read
  const markAllRead = async () => {
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetchWithAuth("http://localhost:5000/notifications/mark-all-read", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        setError("Failed to mark all notifications as read. Please try again.");
        return;
      }
      fetchNotifications();
    } catch (err) {
      setError("Failed to mark all notifications as read. Please try again.");
    }
  };

  // sends delete request then reloads the list
  const handleDelete = async (notificationId) => {
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetchWithAuth(`http://localhost:5000/notifications/${notificationId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        setError("Failed to delete notification. Please try again.");
        return;
      }
      fetchNotifications();
    } catch (err) {
      setError("Failed to delete notification. Please try again.");
    }
  };

  // handles the icon per notification type
  const getNotificationIcon = (type) => {
    if (type === "comment") {
      return <MdComment size={20} />;
    }
    if (type === "assignment") {
      return <MdAssignment size={20} />;
    }
    if (type === "status_change") {
      return <MdCheckCircle size={20} />;
    }
    if (type === "priority_alert") {
      return <MdWarning size={20} />;
    }
    return <MdInfo size={20} />;
  };

  // sqlite stores dates weird so gotta manually parse
  const calculateTime = (dateString) => {
    const now = new Date();

    let date;
    if (dateString.includes("T") || dateString.includes("Z")) {
      date = new Date(dateString);
    } else {
      date = new Date(dateString.replace(" ", "T") + "Z");
    }

    const timePassed = now - date;
    const minutes = Math.floor(timePassed / 60000);
    const hours = Math.floor(timePassed / 3600000);
    const days = Math.floor(timePassed / 86400000);

    if (minutes < 1) {
      return "Just now";
    }
    if (minutes < 60) {
      return minutes + " min ago";
    }
    if (hours < 24) {
      if (hours === 1) {
        return "1 hr ago";
      }
      return hours + " hrs ago";
    }
    if (days < 7) {
      if (days === 1) {
        return "1 day ago";
      }
      return days + " days ago";
    }
    return date.toLocaleDateString();
  };

  // returns subset based on which tab is active
  const getFilteredNotifications = () => {
    if (filter === "unread") {
      return notifications.filter((n) => !n.is_read);
    }
    if (filter === "read") {
      return notifications.filter((n) => n.is_read);
    }
    return notifications;
  };

  // quick count of how many still unread
  const getUnreadCount = () => {
    return notifications.filter(n => !n.is_read).length;
  };

  const filteredNotifications = getFilteredNotifications();
  const unreadMessages = getUnreadCount();

  // unread cards get a different style
  const getCardClass = (notification) => {
    if (notification.is_read) {
      return "notifCard";
    }
    return "unreadCard";
  };

  // handles the badge colour per type
  const getIconClass = (type) => {
    if (type === "comment") {
      return "commentIcon";
    }
    if (type === "assignment") {
      return "assignmentIcon";
    }
    if (type === "status_change") {
      return "statusIcon";
    }
    if (type === "priority_alert") {
      return "priorityIcon";
    }
    return "infoIcon";
  };

  // spinner while waiting on fetch
  const renderLoading = () => {
    return (
      <div className="loadingBox">
        <div className="spinner"></div>
        <p>Loading notifications</p>
      </div>
    );
  };

  // something went wrong, show retry
  const renderError = () => {
    return (
      <div className="errorBox">
        <p>Something went wrong: {error}</p>
        <button onClick={fetchNotifications} className="retryButton">
          Try Again
        </button>
      </div>
    );
  };

  // nothing to show, message depends on active filter
  const renderEmpty = () => {
    let message = "You don't have any notifications yet.";
    if (filter === "unread") {
      message = "You've read all your notifications!";
    }
    if (filter === "read") {
      message = "No read notifications.";
    }

    return (
      <div className="emptyBox">
        <MdNotificationsOff size={56} />
        <h3>No Notifications</h3>
        <p>{message}</p>
      </div>
    );
  };

  // builds a single notif card with actions
  const renderNotificationCard = (notification) => {
    let displayMessage = notification.message || "";

    if (notification.type === "comment") {
      displayMessage = `Support: ${displayMessage}`;
    }

    return (
      <div key={notification.notification_id} className={getCardClass(notification)}>
        <div className={getIconClass(notification.type)}>
          {getNotificationIcon(notification.type)}
        </div>

        <div className="notificationBody">
          <p className="notificationMessage">{displayMessage}</p>
          <div className="notificationMeta">
            <span className="notificationTime">{calculateTime(notification.created_at)}</span>
            {notification.ticket_id && (
              <span className="notificationTicket">Ticket #{notification.ticket_id}</span>
            )}
          </div>
        </div>
        <div className="notificationActions">
          <button
            className="deleteButton"
            onClick={() => handleDelete(notification.notification_id)}
            title="Delete notification"
          >
            <MdDelete size={18} />
          </button>
        </div>

      </div>
    );
  };

  // maps over filtered notifs or shows empty state
  const renderNotificationsList = () => {
    if (filteredNotifications.length === 0) {
      return renderEmpty();
    }

    const cards = [];
    for (let i = 0; i < filteredNotifications.length; i++) {
      cards.push(renderNotificationCard(filteredNotifications[i]));
    }
    return <div className="notifList">{cards}</div>;
  };

  // picks which state to render  loading, error, or list
  const renderContent = () => {
    if (loading) {
      return renderLoading();
    }
    if (error) {
      return renderError();
    }
    return renderNotificationsList();
  };

  // active tab gets different class so it looks selected
  const getTabClass = (tabName) => {
    if (filter === tabName) {
      return "activeTab";
    }
    return "filterTab";
  };

  return (
    <div className="notificationLayout">
      <UserSideBar />

      <main className="notificationMain">
        <div className="notificationHeader">
          <div className="headerInfo">
            <div className="headerIconBox">
              <MdNotifications size={28} />
            </div>
            <div className="headerText">
              <h1>Notifications</h1>
              {unreadMessages > 0 ? (
                <p>You have {unreadMessages} unread notification{unreadMessages > 1 ? "s" : ""}</p>
              ) : (
                <p>You are  all caught up!</p>
              )}
            </div>
          </div>

          <div className="headerButtons">
            <button className="refreshButton" onClick={fetchNotifications}>
              <MdRefresh size={18} />
              <span>Refresh</span>
            </button>
            {unreadMessages > 0 && (
              <button className="markAllButton" onClick={markAllRead}>
                <MdMarkEmailRead size={18} />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        <div className="filterBox">
          <button className={getTabClass("all")} onClick={() => setFilter("all")}>
            All ({notifications.length})
          </button>
          <button className={getTabClass("unread")} onClick={() => setFilter("unread")}>
            Unread ({unreadMessages})
          </button>
          <button className={getTabClass("read")} onClick={() => setFilter("read")}>
            Read ({notifications.length - unreadMessages})
          </button>
        </div>

        <div className="notificationContent">{renderContent()}</div>
      </main>
    </div>
  );
}

export default UserNotifications;
