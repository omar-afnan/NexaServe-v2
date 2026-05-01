import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "../pages/CSS/sideBar.css";

import {
  MdDashboard,
  MdConfirmationNumber,
  MdBarChart,
  MdPerson,
  MdLogout
} from "react-icons/md";

function SideBar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  return (
    <div className="sideBar">
      <div className="sideTop">
        <h3>Support Portal</h3>

        <ul>
          <li>
            <Link to="/dashboard">
              <MdDashboard size={20} />
              Dashboard
            </Link>
          </li>

          <li>
            <Link to="/tickets">
              <MdConfirmationNumber size={20} />
              Tickets
            </Link>
          </li>

          <li>
            <Link to="/supporter-reports">
              <MdBarChart size={20} />
              Reports
            </Link>
          </li>

          <li>
            <Link to="/support-profile">
              <MdPerson size={20} />
              Profile
            </Link>
          </li>
        </ul>
      </div>

      <div className="sideBottom">
        <ul>
          <li>
            <button onClick={handleLogout} className="logoutButton">
              <MdLogout size={20} />
              Logout
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default SideBar;
