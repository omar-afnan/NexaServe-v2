import React, { useState, useEffect, useRef } from 'react';
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
import '../pages/CSS/AdminNotification.css';

function AdminNotification() {
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const dropdownRef = useRef(null);

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
      const res = await fetch('http://localhost:5000/notifications', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = sessionStorage.getItem('token');
      await fetch(`http://localhost:5000/notifications/${id}/read`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      fetchNotifications();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = sessionStorage.getItem('token');
      await fetch('http://localhost:5000/notifications/mark-all-read',
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      fetchNotifications();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const deleteNotification = async (id, e) => {
    e.stopPropagation();
    setDeletingId(id);

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/notifications/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

      if (response.ok) {
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.notification_id !== id));
          setDeletingId(null);
        }, 300);
      } else {
        setDeletingId(null);
      }
    } catch (err) {
      setDeletingId(null);
      console.error('Error deleting notification:', err);
    }
  };

  const deleteAllNotifications = async () => {
    if (!window.confirm('Delete all notifications?')) return;

    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('http://localhost:5000/notifications/delete-all',
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

      if (response.ok) {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Error in deleting all notifications:', err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  const priorityAlertCount = notifications.filter(n => !n.is_read && n.type === 'priority_alert').length;

  const getIcon = (type) => {
    if (type === 'priority_alert') return <MdWarning size={16} style={{
      color: '#ef4444'
    }} />;
    if (type === 'assignment') return <MdAssignment size={16} style={{
      color: '#f59e0b'
    }
  } />;
    if (type === 'comment') return <MdComment size={16} style={{
      color: '#3b82f6'
    }} />;
    return <MdNotifications size={16} style={{
      color: '#3b82f6'
    }} />;
  };

  const getItemClass = (notification) => {
    let base = 'adminNotificationItem';
    if (notification.is_read) base += ' read';
    else base += ' unread';
    if (notification.type === 'priority_alert') base += ' priorityAlert';
    if (deletingId === notification.notification_id) base += ' deleting';
    return base;
  };

  return (
    <div className="adminNotificationWrapper" ref={dropdownRef}>
      <button className="adminNotificationBell" onClick={() => setShowNotifications(!showNotifications)}>
        <MdNotifications size={24} />
        {unreadCount > 0 && (
          <span className={priorityAlertCount > 0 ? 'adminNotificationBadge hasPriority' : 'adminNotificationBadge'}>
            {unreadCount}
          </span>
        )}
      </button>

      {showNotifications && (
        <div className="adminNotificationDropdown">
          <div className="adminNotificationHeader">
            <h4>Notifications</h4>
            <div className="adminHeaderBtns">
              {notifications.length > 0 && (
                <button className="adminDeleteAllBtn" onClick={deleteAllNotifications} title="Delete all">
                  <MdDeleteSweep size={18} />
                </button>
              )}

              <button className="adminCloseBtn" onClick={() => setShowNotifications(false)}>
                <MdClose size={20} />
              </button>

            </div>
          </div>

          {unreadCount > 0 && (
            <button className="adminMarkAllRead" onClick={markAllAsRead}>
              <MdCheckCircle size={16} /> Mark all as read
            </button>
          )}

          <div className="adminNotificationList">
            {notifications.length === 0 ? (
              <p className="adminNoNotifications">
                No notifications yet
              </p>
            ) : (
              notifications.map(n => (
                <div key={n.notification_id} className={getItemClass(n)}>
                  <div className="adminNotificationIcon">
                    {getIcon(n.type)}
                  </div>
                  {/* notification content */}
                  <div className="adminNotificationContent" onClick={() => markAsRead(n.notification_id)}>
                    <p className="adminNotificationMsg">
                      {n.message}
                    </p>
                    {/* notification time */}
                    <span className="adminNotificationTime">
                      {new Date(n.created_at).toLocaleString()}
                    </span>

                  </div>


                  <button className="adminDeleteBtn" onClick={(e) => deleteNotification(n.notification_id, e)} title="Delete">
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

export default AdminNotification;
