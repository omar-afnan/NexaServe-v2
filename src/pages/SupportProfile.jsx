import React, {
  useState,
  useEffect,
  useMemo,
  useRef
} from "react";
import "./CSS/SupportProfile.css";
import SideBar from "../components/sideBar";
import fetchWithAuth from "../api/fetchWithAuth";

import {
  MdEdit,
  MdSave,
  MdCancel,
  MdLock,
  MdVisibility,
  MdVisibilityOff
} from "react-icons/md";

function SupportProfile() {
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    role: "support",
    userId: ""
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", email: "" });

  const [agentStatus, setAgentStatus] = useState("Available");

  const [perf, setPerf] = useState({
    resolved: 0,
    assigned: 0,
    avgResolution: "—"
  });

  const [notifPrefs, setNotifPrefs] = useState({
    newTicket: true,
    slaBreach: true,
    dailyDigest: false,
    teamAnnouncements: false
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (userData.userId) fetchPerformance(userData.userId);
  }, [userData.userId]);

  const loadUserData = () => {
    const name = sessionStorage.getItem("userName") || "";
    const email = sessionStorage.getItem("userEmail") || "";
    const role = sessionStorage.getItem("role") || "support";
    const userId =
      sessionStorage.getItem("userId") ||
      sessionStorage.getItem("user_id") ||
      "";

    setUserData({ name, email, role, userId });
    setEditData({ name, email });
  };

  const fetchPerformance = async (userId) => {
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithAuth("http://localhost:5000/tickets", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;

      const mine = data.filter(
        (t) =>
          String(t.assigned_to) === String(userId) ||
          String(t.assignedTo) === String(userId)
      );

      const closed = mine.filter((t) => t.status === "Closed");
      const openOrInProgress = mine.filter(
        (t) => t.status === "Open" || t.status === "In Progress"
      );

      let avgLabel = "—";
      const durations = closed
        .map((t) => {
          const created = t.created_at ? new Date(t.created_at).getTime() : null;
          const updated =
            t.updated_at || t.closed_at || t.resolved_at;
          const closedAt = updated ? new Date(updated).getTime() : null;
          if (!created || !closedAt || closedAt < created) return null;
          return closedAt - created;
        })
        .filter((d) => d !== null);

      if (durations.length > 0) {
        const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
        const hours = avgMs / (1000 * 60 * 60);
        avgLabel = hours < 1
          ? `${Math.round(hours * 60)}m`
          : `${hours.toFixed(1)}h`;
      }

      setPerf({
        resolved: closed.length,
        assigned: openOrInProgress.length,
        avgResolution: avgLabel
      });
    } catch (e) {
      // silent — leave defaults
    }
  };

  const toggleEdit = () => {
    if (isEditing) {
      setEditData({ name: userData.name, email: userData.email });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch("http://localhost:5000/users/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editData.name,
          email: editData.email
        })
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || "Failed to update profile", "error");
        return;
      }

      sessionStorage.setItem("userName", editData.name);
      sessionStorage.setItem("userEmail", editData.email);
      setUserData({ ...userData, name: editData.name, email: editData.email });
      setIsEditing(false);
      showToast("Profile updated successfully!");
    } catch (error) {
      showToast("Failed to update profile. Please try again.", "error");
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast("Passwords do not match!", "error");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      showToast("Password must be at least 6 characters!", "error");
      return;
    }

    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch("http://localhost:5000/users/me/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || "Failed to change password", "error");
        return;
      }

      showToast("Password changed successfully!");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setShowPasswordChange(false);
    } catch (error) {
      showToast("Failed to change password. Try again.", "error");
    }
  };

  const initials = useMemo(() => {
    return userData.name
      ? userData.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
      : "SA";
  }, [userData.name]);

  const lastLoginLabel = useMemo(() => {
    const stored = sessionStorage.getItem("lastLogin");
    const d = stored ? new Date(stored) : new Date();
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }, []);

  return (
    <div className="profileLayout">
      <SideBar />

      <main className="profileMain">
        <div className="profileContainer">

          {toast && (
            <div className={`toast toast--${toast.type}`}>{toast.msg}</div>
          )}

          <header className="pageHeader">
            <div>
              <h1>Profile</h1>
              <p>Manage your account information</p>
            </div>
          </header>

          <div className="contentGrid">

            {/* Left column */}
            <div className="leftColumn">

              {/* Agent Profile */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Agent Profile</h2>
                  <button onClick={toggleEdit} className="editBtn">
                    {isEditing ? (
                      <><MdCancel size={14} /><span>Cancel</span></>
                    ) : (
                      <><MdEdit size={14} /><span>Edit</span></>
                    )}
                  </button>
                </div>

                <div className="cardBody">
                  <div className="agentAvatarBlock">
                    <div className="agentAvatar">{initials}</div>
                    <p className="agentName">{userData.name || "Support Agent"}</p>
                    <p className="agentEmail">{userData.email}</p>
                    <span className="roleBadge">SUPPORT AGENT</span>
                  </div>

                  <div className="statusBlock">
                    <div className="fieldLabel">STATUS</div>
                    <div className="statusToggleRow">
                      <button
                        type="button"
                        className={`statusPill statusAvailable ${agentStatus === "Available" ? "statusActive" : ""}`}
                        onClick={() => setAgentStatus("Available")}
                      >
                        <span className="statusDot dotGreen" />
                        Available
                      </button>
                      <button
                        type="button"
                        className={`statusPill statusBusy ${agentStatus === "Busy" ? "statusActive" : ""}`}
                        onClick={() => setAgentStatus("Busy")}
                      >
                        <span className="statusDot dotAmber" />
                        Busy
                      </button>
                      <button
                        type="button"
                        className={`statusPill statusOffline ${agentStatus === "Offline" ? "statusActive" : ""}`}
                        onClick={() => setAgentStatus("Offline")}
                      >
                        <span className="statusDot dotDark" />
                        Offline
                      </button>
                    </div>
                    <p className="statusHelpText">Auto-assignment disabled when offline</p>
                  </div>

                  <div className="skillsBlock">
                    <div className="fieldLabel">SKILLS & QUEUES</div>
                    <div className="skillPills">
                      <span className="skillPill">Network</span>
                      <span className="skillPill">Hardware</span>
                      <span className="skillPill">Software</span>
                    </div>
                  </div>

                  <div className="inputGroup">
                    <label>FULL NAME</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="input"
                        placeholder="Enter your name"
                      />
                    ) : (
                      <input className="input" value={userData.name} readOnly />
                    )}
                  </div>

                  <div className="inputGroup">
                    <label>EMAIL ADDRESS</label>
                    <input className="input" value={userData.email} readOnly />
                  </div>

                  {isEditing && (
                    <button onClick={handleSaveProfile} className="saveButton">
                      <MdSave size={16} />
                      Save Changes
                    </button>
                  )}
                </div>
              </section>

              {/* Working Hours */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Working Hours</h2>
                </div>
                <div className="cardBody">
                  <div className="metaRow">
                    <span className="metaLabel">Working Hours</span>
                    <span className="metaValue">09:00–17:00</span>
                  </div>
                  <div className="metaRow">
                    <span className="metaLabel">Timezone</span>
                    <span className="metaValue">GMT+4</span>
                  </div>
                </div>
              </section>

              {/* Security */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Security</h2>
                </div>
                <div className="cardBody">
                  <div className="metaRow">
                    <span className="metaLabel">Last Login</span>
                    <span className="metaValue">{lastLoginLabel}</span>
                  </div>
                  <div className="metaRow">
                    <span className="metaLabel">Last Password Change</span>
                    <span className="metaValue">2 days ago</span>
                  </div>

                  <button
                    onClick={() => setShowPasswordChange(!showPasswordChange)}
                    className="darkButton"
                  >
                    <MdLock size={16} />
                    {showPasswordChange ? "Hide Password Change" : "Change Password"}
                  </button>

                  {showPasswordChange && (
                    <form onSubmit={handlePasswordChange} className="passwordForm">
                      <div className="inputGroup">
                        <label>CURRENT PASSWORD</label>
                        <div className="passwordInputWrapper">
                          <input
                            type={showCurrentPassword ? "text" : "password"}
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                            className="input"
                            placeholder="Enter current password"
                            required
                          />
                          <button type="button" className="eyeToggle" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                            {showCurrentPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                          </button>
                        </div>
                      </div>

                      <div className="inputGroup">
                        <label>NEW PASSWORD</label>
                        <div className="passwordInputWrapper">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                            className="input"
                            placeholder="Enter new password"
                            required
                          />
                          <button type="button" className="eyeToggle" onClick={() => setShowNewPassword(!showNewPassword)}>
                            {showNewPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                          </button>
                        </div>
                      </div>

                      <div className="inputGroup">
                        <label>CONFIRM NEW PASSWORD</label>
                        <div className="passwordInputWrapper">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                            className="input"
                            placeholder="Confirm new password"
                            required
                          />
                          <button type="button" className="eyeToggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                            {showConfirmPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                          </button>
                        </div>
                      </div>

                      <button type="submit" className="darkButton">
                        Update Password
                      </button>
                    </form>
                  )}
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className="rightColumn">

              {/* Performance */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Performance</h2>
                </div>
                <div className="cardBody">
                  <div className="perfStatsRow">
                    <div className="perfMiniCard">
                      <div className="perfMiniLabel">TICKETS RESOLVED</div>
                      <div className="perfMiniValue">{perf.resolved}</div>
                    </div>
                    <div className="perfMiniCard">
                      <div className="perfMiniLabel">CURRENTLY ASSIGNED</div>
                      <div className="perfMiniValue">{perf.assigned}</div>
                    </div>
                    <div className="perfMiniCard">
                      <div className="perfMiniLabel">AVG RESOLUTION</div>
                      <div className="perfMiniValue">{perf.avgResolution}</div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Notifications */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Notifications</h2>
                </div>
                <div className="cardBody">
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.newTicket}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, newTicket: e.target.checked })}
                    />
                    <span>Email me when a new ticket is assigned</span>
                  </label>
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.slaBreach}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, slaBreach: e.target.checked })}
                    />
                    <span>Notify me when a ticket is about to breach SLA</span>
                  </label>
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.dailyDigest}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, dailyDigest: e.target.checked })}
                    />
                    <span>Daily digest of resolved tickets</span>
                  </label>
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.teamAnnouncements}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, teamAnnouncements: e.target.checked })}
                    />
                    <span>Notify me of team announcements</span>
                  </label>

                  <button
                    type="button"
                    className="darkButton"
                    onClick={() => showToast("Preferences saved!")}
                  >
                    Save Preferences
                  </button>
                </div>
              </section>

            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

export default SupportProfile;