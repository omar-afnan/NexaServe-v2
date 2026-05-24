import { useNavigate, useLocation } from "react-router-dom";
import "../pages/CSS/AdminSideBar.css";
import {
  MdDashboard,
  MdConfirmationNumber,
  MdBarChart,
  MdLogout,
  MdHistory,
  MdPerson,
  MdHeadset,
  MdAnalytics,
  MdNotifications,
} from "react-icons/md";

function AdminSideBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  const isActive = (path) => {
    try {
      return location.pathname === path || location.pathname.startsWith(path);
    } catch (e) {
      return false;
    }
  };

  return (
    <div className="adminSideBar">
      <div className="adminSideTop">
        <div className="sidebarLogo">
          <div className="sidebarLogoIcon">
            <MdHeadset size={18} color="#fff" />
          </div>
          <div className="sidebarLogoText">
            <span className="sidebarBrand">NexaServe</span>
            <span className="sidebarPortal">Admin Panel</span>
          </div>
        </div>

        <ul>
          <li>
            <a href="/AdminDashboard" className={isActive("/AdminDashboard") ? "active" : ""}>
              <MdDashboard size={18} />
              Dashboard
            </a>
          </li>
          <li>
            <a href="/admin/notifications" className={isActive("/admin/notifications") ? "active" : ""}>
              <MdNotifications size={18} />
              Notifications
            </a>
          </li>

          <li>
            <a href="/admin/tickets" className={isActive("/admin/tickets") ? "active" : ""}>
              <MdConfirmationNumber size={18} />
              All Tickets
            </a>
          </li>
          <li>
            <a href="/admin-reports" className={isActive("/admin-reports") ? "active" : ""}>
              <MdBarChart size={18} />
              Reports
            </a>
          </li>
          <li>
            <a href="/admin/performance" className={isActive("/admin/performance") ? "active" : ""}>
              <MdAnalytics size={18} />
              Performance
            </a>
          </li>
          <li>
            <a href="/admin/audit-logs" className={isActive("/admin/audit-logs") ? "active" : ""}>
              <MdHistory size={18} />
              Audit Logs
            </a>
          </li>
          <li>
            <a href="/admin/profile" className={isActive("/admin/profile") ? "active" : ""}>
              <MdPerson size={18} />
              Profile
            </a>
          </li>
        </ul>
      </div>

      <div className="adminSideBottom">
        <ul>
          <li>
            <button onClick={handleLogout} className="adminLogoutButton">
              <MdLogout size={18} />
              Logout
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default AdminSideBar;
