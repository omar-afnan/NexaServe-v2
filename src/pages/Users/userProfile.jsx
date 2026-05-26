import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import UserSideBar from "../../components/userSideBar";
import "../CSS/userProfile.css";

import {
  MdEdit,
  MdSave,
  MdCancel,
  MdLock,
  MdVisibility,
  MdVisibilityOff
} from "react-icons/md";


export default function UserProfile() {
  const navigate = useNavigate();

  const [userData, setUserData] = useState({
    name: "",
    email: "",
    role: "user"
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", email: "" });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [notifPrefs, setNotifPrefs] = useState({
    ticketUpdates: true,
    statusChanges: true,
    supportReplies: true
  });
  const toastTimer = useRef(null);

  const showToast = (msg, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadUserData();

  }, []);

  const loadUserData = () => {
    const token = sessionStorage.getItem("token");

    // Fetch  user data from backend
    if (token) {
      fetch("http://localhost:5000/users/me", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
        .then(res => {
          if (res.status === 401 || res.status === 403) {
            sessionStorage.clear();
            navigate("/login", { state: { reason: "session_expired" } });
            return null;
          }
          return res.json();
        })
        .then(data => {
          if (!data) return;
          const name = data.name || sessionStorage.getItem("userName") || "User";
          const email = data.email || sessionStorage.getItem("userEmail") || "user@nexaserve.com";

          setUserData({ name, email, role: data.role || "user" });
          setEditData({ name, email });
          setLoading(false);
          sessionStorage.setItem("userName", name);
          sessionStorage.setItem("userEmail", email);
        })
        .catch(() => {
          // Fallback to sessionStorage if API fails
          const name = sessionStorage.getItem("userName") || "User";

          const email = sessionStorage.getItem("userEmail") || "user@nexaserve.com";
          const role = sessionStorage.getItem("role") || "user";
          setUserData({ name, email, role });
          setEditData({ name, email });
          setLoading(false);
        });
    } else {

      const name = sessionStorage.getItem("userName") || "User";
      const email = sessionStorage.getItem("userEmail") || "user@nexaserve.com";
      const role = sessionStorage.getItem("role") || "user";
      setUserData({ name, email, role });
      setEditData({ name, email });
      setLoading(false);
    }
  };



  const handleEditToggle = () => {
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

      if (response.status === 401 || response.status === 403) {
        sessionStorage.clear();
        navigate("/login", { state: { reason: "session_expired" } });
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || "Failed to update profile", "error");
        return;
      }

      // Update sessionStorage and state
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

      if (response.status === 401 || response.status === 403) {
        sessionStorage.clear();
        navigate("/login", { state: { reason: "session_expired" } });
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || "Failed to change password", "error");
        return;
      }

      showToast("Password changed successfully!");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setShowPasswordChange(false);
    } catch (error) {
      showToast("Failed to change password. Please try again.", "error");
    }
  };



  const initials = useMemo(() => {
    return userData.name
      ? userData.name.split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2)
      : "U";
  }, [userData.name]);

  const lastLoginLabel = useMemo(() => {
    const stored = sessionStorage.getItem("lastLogin");
    const date = stored ? new Date(stored) : new Date();

    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }, []);



  if (loading) {
    return (
      <div className="profileLayout">
        <UserSideBar />
        <div className="profileMain">

          <div className="loadingState">

            <div className="spinner"></div>

            <p>Loading profile</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profileLayout">
      <UserSideBar />

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
            <div className="leftColumn">
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>User Profile</h2>
                  <button onClick={handleEditToggle} className="editBtn">
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
                    <p className="agentName">{userData.name || "User"}</p>
                    <p className="agentEmail">{userData.email}</p>
                    <span className="roleBadge">USER</span>
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
                    {isEditing ? (
                      <input
                        type="email"
                        value={editData.email}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        className="input"
                        placeholder="Enter your email"
                      />
                    ) : (
                      <input className="input" value={userData.email} readOnly />
                    )}
                  </div>

                  {isEditing && (
                    <button onClick={handleSaveProfile} className="saveButton">
                      <MdSave size={16} />
                      Save Changes
                    </button>
                  )}
                </div>
              </section>

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
                    <span className="metaLabel">Account Role</span>
                    <span className="metaValue">User</span>
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

            <div className="rightColumn">
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Notifications</h2>
                </div>

                <div className="cardBody">
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.ticketUpdates}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, ticketUpdates: e.target.checked })}
                    />
                    <span>Email me about my ticket updates</span>
                  </label>
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.statusChanges}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, statusChanges: e.target.checked })}
                    />
                    <span>Notify me when a ticket status changes</span>
                  </label>
                  <label className="notifRow">
                    <input
                      type="checkbox"
                      checked={notifPrefs.supportReplies}
                      onChange={(e) => setNotifPrefs({ ...notifPrefs, supportReplies: e.target.checked })}
                    />
                    <span>Notify me when support replies</span>
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
