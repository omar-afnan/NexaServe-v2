import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdNotifications } from 'react-icons/md';
import '../pages/CSS/AdminNotification.css';

function AdminNotification() {
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
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

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const priorityAlertCount = notifications.filter(n => !n.is_read && n.type === 'priority_alert').length;

  return (
    <div className="adminNotificationWrapper">
      <button
        className="adminNotificationBell"
        onClick={() => navigate('/admin/notifications')}
        title="View notifications"
      >
        <MdNotifications size={24} />
        {unreadCount > 0 && (
          <span className={priorityAlertCount > 0 ? 'adminNotificationBadge hasPriority' : 'adminNotificationBadge'}>
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default AdminNotification;
