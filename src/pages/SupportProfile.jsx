import React, {
  useState,
  useEffect,
  useRef
} from "react";
import "./CSS/SupportProfile.css";
import SideBar from "../components/sideBar";

import {
  MdPerson,
  MdEmail,
  MdEdit,
  MdSave,
  MdCancel,
  MdLock,
  MdBadge,
  MdVisibility,
  MdVisibilityOff,
  MdCheckCircle,
  MdAssignment,
  MdAccessTime
} from "react-icons/md";


function SupportProfile() {
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    role: "support"
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

  const loadUserData = () => {
    // handle missing session
    const name = sessionStorage.getItem("userName") || "";
    const email = sessionStorage.getItem("userEmail") || "";
    const role = sessionStorage.getItem("role") || "support";

    setUserData({ name, email, role });
    setEditData({ name, email });
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

      // update sessionStorage and state
      sessionStorage.setItem("userName", editData.name);
      sessionStorage.setItem("userEmail", editData.email);
      setUserData({ ...userData, name: editData.name, email: editData.email });
      setIsEditing(false);
      showToast("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
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
      console.error("Error changing password:", error);
      showToast("Failed to change password. Try again.", "error");
    }
  };

  const initials = userData.name
    ? userData.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "SA";

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

            {/* Left — Agent Profile */}
            <section className="profileCard">
              <div className="cardHeader">
                <h2>Agent Profile</h2>
                <button onClick={toggleEdit} className="editBtn">
                  {isEditing ? (
                    <><MdCancel size={16} /><span>Cancel</span></>
                  ) : (
                    <><MdEdit size={16} /><span>Edit</span></>
                  )}
                </button>
              </div>

              <div className="cardBody">
                <div className="agentAvatarBlock">
                  <div className="agentAvatar">{initials}</div>
                  <p className="agentName">{userData.name || "Support Agent"}</p>
                  <p className="agentEmail">{userData.email}</p>
                  <span className="roleBadge">Support Agent</span>
                </div>

                <div className="inputGroup">
                  <label><MdPerson size={14} />Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="input"
                      placeholder="Enter your name"
                    />
                  ) : (
                    <div className="inputDisplay">{userData.name}</div>
                  )}
                </div>

                <div className="inputGroup">
                  <label><MdEmail size={14} />Email Address</label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="input"
                      placeholder="Enter your email"
                    />
                  ) : (
                    <div className="inputDisplay">{userData.email}</div>
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

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Performance card */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Performance</h2>
                </div>
                <div className="cardBody">
                  <div className="perfStatsList">
                    <div className="perfStatItem">
                      <div className="perfIconSquare teal"><MdCheckCircle size={20} /></div>
                      <div className="perfStatText">
                        <div className="perfStatValue">—</div>
                        <div className="perfStatLabel">Tickets Resolved</div>
                      </div>
                    </div>
                    <div className="perfStatItem">
                      <div className="perfIconSquare amber"><MdAssignment size={20} /></div>
                      <div className="perfStatText">
                        <div className="perfStatValue">—</div>
                        <div className="perfStatLabel">Currently Assigned</div>
                      </div>
                    </div>
                    <div className="perfStatItem">
                      <div className="perfIconSquare blue"><MdAccessTime size={20} /></div>
                      <div className="perfStatText">
                        <div className="perfStatValue">—</div>
                        <div className="perfStatLabel">Avg Resolution Time</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Security card */}
              <section className="profileCard">
                <div className="cardHeader">
                  <h2>Security</h2>
                </div>
                <div className="cardBody">
                  <button
                    onClick={() => setShowPasswordChange(!showPasswordChange)}
                    className="passwordToggleBtn"
                  >
                    <MdLock size={18} />
                    {showPasswordChange ? "Hide Password Change" : "Change Password"}
                  </button>
                  {showPasswordChange && (
                    <form onSubmit={handlePasswordChange} className="passwordForm">
                      <div className="inputGroup">
                        <label>Current Password</label>
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
                        <label>New Password</label>
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
                        <label>Confirm New Password</label>
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

                      <button type="submit" className="submitButton">
                        Update Password
                      </button>
                    </form>
                  )}
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
