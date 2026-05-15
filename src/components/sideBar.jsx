import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "../pages/CSS/sideBar.css";

import {
  MdDashboard,
  MdConfirmationNumber,
  MdBarChart,
  MdPerson,
  MdLogout,
  MdHeadset,
  MdInsights,
} from "react-icons/md";

function SideBar() {
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
    <div className="sideBar">
      <div className="sideTop">
        <div className="sidebarLogo">
          <div className="sidebarLogoIcon">
            <MdHeadset size={18} color="#fff" />
          </div>
          <div className="sidebarLogoText">
            <span className="sidebarBrand">NexaServe</span>
            <span className="sidebarPortal">Support Portal</span>
          </div>
        </div>

        <ul>
          <li>
            <Link to="/dashboard" className={isActive("/dashboard") ? "active" : ""}>
              <MdDashboard size={18} />
              Dashboard
            </Link>
          </li>

          <li>
            <Link to="/tickets" className={isActive("/tickets") ? "active" : ""}>
              <MdConfirmationNumber size={18} />
              Tickets
            </Link>
          </li>

          <li>
            <Link to="/supporter-reports" className={isActive("/supporter-reports") ? "active" : ""}>
              <MdBarChart size={18} />
              Reports
            </Link>
          </li>

          <li>
            <Link to="/performance" className={isActive("/performance") ? "active" : ""}>
              <MdInsights size={18} />
              My Performance
            </Link>
          </li>

          <li>
            <Link to="/support-profile" className={isActive("/support-profile") ? "active" : ""}>
              <MdPerson size={18} />
              Profile
            </Link>
          </li>
        </ul>
      </div>

      <div className="sideBottom">
        <ul>
          <li>
            <button onClick={handleLogout} className="logoutButton">
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
