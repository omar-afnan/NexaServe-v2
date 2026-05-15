import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getAuth } from "./utils/auth";

import Login from "./pages/Login";
import SupportDashboard from "./pages/SupportDashboard";
import ViewTickets from "./pages/ViewTickets";
import TicketDetail from "./pages/TicketDetail";
import AdminViewTicket from "./pages/AdminViewTicket";
import UserNotifications from "./pages/Users/userNotification";
import UserDashboard from "./pages/Users/UserDashBoard";
import UserViewTicket from "./pages/Users/ViewTicket";
import UserProfile from "./pages/Users/userProfile";
import AdminDashboard from "./pages/AdminDashBoard";
import ChatWithBot from "./pages/Users/ChatWithBot";
import SupporterReports from "./pages/SupporterReports";
import SupportProfile from "./pages/SupportProfile";
import AdminReports from "./pages/AdminReports";
import AuditLogs from "./pages/Audit_Logs";
import AdminProfilePage from "./pages/adminProfilePage";
import AgentPerformance from "./pages/AgentPerformance";
import MyPerformance from "./pages/MyPerformance";


const RequireAuth = ({ allowed, children }) => {
  const { token, role } = getAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={location.state} />;
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default function App() {
  return (
    <Router>
      <Routes>

        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Support routes */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth allowed={['support', 'admin']}>
              <SupportDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/supporter-reports"
          element={
            <RequireAuth allowed={['support', 'admin']}>
              <SupporterReports />
            </RequireAuth>
          }
        />

        <Route
          path="/tickets"
          element={
            <RequireAuth allowed={['support']}>
              <ViewTickets />
            </RequireAuth>
          }
        />
        <Route
          path="/tickets/:ticketId"
          element={
            <RequireAuth allowed={['support', 'admin']}>
              <TicketDetail />
            </RequireAuth>
          }
        />

        <Route
          path="/support-profile"
          element={
            <RequireAuth allowed={['support', 'admin']}>
              <SupportProfile />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/performance"
          element={
            <RequireAuth allowed={['admin']}>
              <AgentPerformance />
            </RequireAuth>
          }
        />

        <Route
          path="/performance"
          element={
            <RequireAuth allowed={['support']}>
              <MyPerformance />
            </RequireAuth>
          }
        />

        {/* User routes*/}
        <Route
          path="/UserDashboard"
          element={
            <RequireAuth allowed={['user']}>
              <UserDashboard />
            </RequireAuth>
          }
        />

        <Route
          path="/user/notifications"
          element={
            <RequireAuth allowed={['user']}>
              <UserNotifications />
            </RequireAuth>
          }
        />

        <Route
          path="/user/ticket/:ticketId"
          element={
            <RequireAuth allowed={['user']}>
              <TicketDetail />
            </RequireAuth>
          }
        />

        <Route
          path="/chat"
          element={
            <RequireAuth allowed={['user']}>
              <ChatWithBot />
            </RequireAuth>
          }
        />
        <Route
          path="/user/view-ticket"
          element={
            <RequireAuth allowed={['user']}>
              <UserViewTicket />
            </RequireAuth>
          }
        />
        <Route
          path="/user/profile"
          element={
            <RequireAuth allowed={['user']}>
              <UserProfile />
            </RequireAuth>
          }
        />

        {/* Admin routes */}
        <Route
          path="/AdminDashboard"
          element={
            <RequireAuth allowed={['admin']}>
              <AdminDashboard />
            </RequireAuth>
          }
        />


        <Route
          path="/admin/profile"
          element={
            <RequireAuth allowed={['admin']}>
              <AdminProfilePage />
            </RequireAuth>
          }
        />


        <Route
          path="/admin/audit-logs"
          element={
            <RequireAuth allowed={["admin"]} >
              <AuditLogs />

            </RequireAuth>}
        />




        <Route
          path="/admin/tickets"
          element={
            <RequireAuth allowed={['admin']}>
              <AdminViewTicket />
            </RequireAuth>
          }
        />
        <Route
          path="/admin-reports"
          element={
            <RequireAuth allowed={['admin']}>
              <AdminReports />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
