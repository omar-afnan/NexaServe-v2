import { useNavigate } from "react-router-dom";
import "../pages/CSS/AdminSideBar.css";
import {
  MdDashboard,
  MdConfirmationNumber,
  MdBarChart,
  MdLogout,
  MdHistory,
  MdPerson
} from "react-icons/md";

function AdminSideBar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  return (
    <div className="adminSideBar">
      <div className="adminSideTop">
        <h3>ADMIN PANEL</h3>

        <ul>
          <li>
            <a href="/AdminDashboard">
              <MdDashboard size={20} />
              Dashboard
            </a>
          </li>
          <li>
            <a href="/admin/tickets">
              <MdConfirmationNumber size={20} />
              All Tickets
            </a>
          </li>
          <li>
            <a href="/admin-reports">
              <MdBarChart size={20} />
              Reports
            </a>
          </li>
          <li>
            <a href="/admin/audit-logs">
              <MdHistory size={20} />
              Audit Logs
            </a>
          </li>
          <li>
            <a href="/admin/profile">
              <MdPerson size={20} />
              Profile
            </a>
          </li>
        </ul>
      </div>

      <div className="adminSideBottom">
        <ul>
          <li>
            <button onClick={handleLogout} className="adminLogoutButton">
              <MdLogout size={20} />
              Logout
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default AdminSideBar;
