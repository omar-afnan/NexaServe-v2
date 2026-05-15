import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "../pages/CSS/userSideBar.css";

import {
  MdDashboard,
  MdConfirmationNumber,
  MdPerson,
  MdLogout,
  MdChat,
  MdNotifications,
  MdHeadset,
} from "react-icons/md";

function SideBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = () => {
    try {
      const userName = sessionStorage.getItem('userName');
      if (userName) {
        const storageKey = `chat_history_${userName}`;
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
        const token = sessionStorage.getItem('token');
        if (token) {
          const tokenKey = `chat_history_token_${token}`;
          localStorage.removeItem(tokenKey);
          sessionStorage.removeItem(tokenKey);
        }
      }
    } catch (e) {
      console.warn('Error clearing chat history on logout', e);
    }

    sessionStorage.clear();
    navigate("/login");
  };

  const isActive = (path) => {
    try {
      return location.pathname === path || location.pathname.startsWith(path);
    }
    catch (e) {
      return false;
    }
  };

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const token = sessionStorage.getItem("token");
        if (!token) return;

        const res = await fetch("http://localhost:5000/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) return;

        const data = await res.json();
        if (Array.isArray(data)) {
          const count = data.reduce((acc, n) => (!n.is_read ? acc + 1 : acc), 0);
          setUnreadCount(count);
        }
      } catch (err) {
      }
    };

    fetchUnread();
  }, []);

  return (
    <div className="userSideBar">
      <div className="userSideTop">
        <div className="sidebarLogo">
          <div className="sidebarLogoIcon">
            <MdHeadset size={18} color="#fff" />
          </div>
          <div className="sidebarLogoText">
            <span className="sidebarBrand">NexaServe</span>
            <span className="sidebarPortal">User Portal</span>
          </div>
        </div>

        <ul>
          <li>
            <Link to="/UserDashboard" className={isActive("/UserDashboard") ? "active" : ""}>
              <MdDashboard size={18} />
              Dashboard
            </Link>
          </li>

          <li>
            <Link
              to="/user/notifications"
              className={`notificationLink ${isActive("/user/notifications") ? "active" : ""}`}
            >
              <MdNotifications size={18} />
              Notifications
              {unreadCount > 0 && (
                <span className="notificationBadge">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </Link>
          </li>

          <li>
            <Link to="/chat" className={isActive("/chat") ? "active" : ""}>
              <MdChat size={18} />
              Chat with AI
            </Link>
          </li>

          <li>
            <Link to="/user/view-ticket" className={isActive("/user/view-ticket") ? "active" : ""}>
              <MdConfirmationNumber size={18} />
              My Tickets
            </Link>
          </li>

          <li>
            <Link to="/user/profile" className={isActive("/user/profile") ? "active" : ""}>
              <MdPerson size={18} />
              Profile
            </Link>
          </li>
        </ul>
      </div>

      <div className="userSideBottom">
        <ul>
          <li>
            <button onClick={handleLogout} className="userLogoutButton">
              <MdLogout size={18} />
              Logout
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default SideBar;
