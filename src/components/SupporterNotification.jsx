import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../api/fetchWithAuth';
import {
  MdNotifications,
  MdClose,
  MdCheckCircle,
  MdWarning,
  MdComment,
  MdAssignment,
  MdDelete,
  MdDeleteSweep
} from 'react-icons/md';
import '../pages/CSS/SupporterNotification.css';

function SupporterNotification() {
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const token = sessionStorage.getItem('token');
      if (!token) return;
      const res = await fetchWithAuth('http://localhost:5000/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      }
    } catch (err) {
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = sessionStorage.getItem('token');
      await fetchWithAuth(`http://localhost:5000/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (err) {
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = sessionStorage.getItem('token');
      await fetchWithAuth('http://localhost:5000/notifications/mark-all-read', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (err) {
    }
  };

  const deleteNotification = async (notificationId, e) => {
    e.stopPropagation();
    setDeletingId(notificationId);

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth(`http://localhost:5000/notifications/${notificationId}`, {
        method: "DELETE",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
          setDeletingId(null);
        }, 300);
      } else {
        setDeletingId(null);
      }
    } catch (error) {
      setDeletingId(null);
    }
  };

  const deleteAllNotifications = async () => {
    if (!window.confirm("Delete all notifications?")) return;

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth(`http://localhost:5000/notifications/delete-all`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setNotifications([]);
      }
    } catch (error) {
    }
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification.notification_id);
    setShowNotifications(false);
    navigate(`/ticket/${notification.ticket_id}`);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const hasPriority = notifications.filter(n => !n.is_read && n.type === 'priority_alert').length > 0;

  const getIcon = (type) => {
    if (type === 'priority_alert') return <MdWarning size={16} className="iconPriority" />;
    if (type === 'assignment') return <MdAssignment size={16} className="iconAssignment" />;
    if (type === 'comment') return <MdComment size={16} className="iconDefault" />;
    return <MdNotifications size={16} className="iconDefault" />;
  };

  return (
    <div className="supporterNotificationWrapper" ref={dropdownRef}>
      <button className="supporterNotificationBell" onClick={() => setShowNotifications(!showNotifications)}>
        <MdNotifications size={22} />
        {unreadCount > 0 && (
          <span className={`supporterNotificationBadge ${hasPriority ? 'hasPriority' : ''}`}>
            {unreadCount}
          </span>
        )}
      </button>

      {showNotifications && (
        <div className="supporterNotificationDropdown">
          <div className="supporterNotificationHeader">
            <h4>Notifications</h4>

            <div className="supporterHeaderActions">
              {notifications.length > 0 && (
                <button className="supporterHeaderBtn" onClick={deleteAllNotifications} title="Delete all">
                  <MdDeleteSweep size={18} />
                </button>
              )}

              <button className="supporterHeaderBtn" onClick={() => setShowNotifications(false)}>
                <MdClose size={20} />
              </button>

            </div>
          </div>

          {unreadCount > 0 && (
            <button className="supporterMarkAllRead" onClick={markAllAsRead}>
              <MdCheckCircle size={16} />
              Mark all as read
            </button>
          )}

          <div className="supporterNotificationList">
            {notifications.length === 0 ? (
              <p className="supporterNoNotifications">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.notification_id}
                  className={`supporterNotificationItem ${n.is_read ? 'read' : 'unread'} ${n.type === 'priority_alert' ? 'priorityAlert' : ''} ${deletingId === n.notification_id ? 'deleting' : ''}`}
                >
                  <div className="supporterNotificationIcon">
                    {getIcon(n.type)}
                  </div>

                  <div className="supporterNotificationContent" onClick={() => handleNotificationClick(n)}>
                    <p className="supporterNotificationMessage">
                      {n.message}
                    </p>

                    <span className="supporterNotificationTime">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>

                  <button
                    className="supporterDeleteBtn"
                    onClick={(e) => deleteNotification(n.notification_id, e)}
                    title="Delete"
                  >
                    <MdDelete size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SupporterNotification;
