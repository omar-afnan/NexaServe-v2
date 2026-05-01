import React, { useState, useEffect, useRef } from "react";
import "./CSS/adminProfilePage.css";
import AdminSideBar from "../components/AdminSideBar";

import {
  MdPerson,
  MdEmail,
  MdEdit,
  MdSave,
  MdCancel,
  MdLock,
  MdBadge,
  MdVisibility,
  MdVisibilityOff
} from "react-icons/md";

function AdminProfile() {
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    role: "admin"
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
    const name = sessionStorage.getItem("userName") || "Admin";
    const email = sessionStorage.getItem("userEmail") || "admin@nexaserve.com";
    const role = sessionStorage.getItem("role") || "admin";

    setUserData({ name, email, role });
    setEditData({ name, email });
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
      showToast("Failed to change password. Please try again.", "error");
    }
  };

  return (
    <div className="adminProfileLayout">
      <AdminSideBar />

      <main className="adminProfileMain">
        
        <div className="adminProfileContainer">

          {toast && (
            <div className={`toast toast--${toast.type}`}>{toast.msg}</div>
          )}

          <header className="adminProfileHeader">
            <div>
              <h1>Profile Settings</h1>
              <p>Manage your admin account information</p>
            </div>
          </header>

          <div className="adminProfileGrid">

            <section className="adminProfileCard">
              <div className="adminProfileCardHeader">
                <h2>Profile Information</h2>
                <button onClick={handleEditToggle} className="adminProfileEditBtn">
                  {isEditing ? (
                    <>
                      <MdCancel size={18} />
                      <span>Cancel</span>
                    </>
                  ) : (
                    <>
                      <MdEdit size={18} />
                      <span>Edit</span>
                    </>
                  )}
                </button>
              </div>

              <div className="adminProfileCardBody">
                <div className="adminProfileInputGroup">
                  <label>
                    <MdPerson size={20} />
                    Full Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="adminProfileInput"
                      placeholder="Enter your name"
                    />
                  ) : (
                    <div className="adminProfileInputDisplay">{userData.name}</div>
                  )}
                </div>

                <div className="adminProfileInputGroup">
                  <label>
                    <MdEmail size={20} />
                    Email Address
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="adminProfileInput"
                      placeholder="Enter your email"
                    />
                  ) : (
                    <div className="adminProfileInputDisplay">{userData.email}</div>
                  )}
                </div>

                <div className="adminProfileInputGroup">
                  <label>
                    <MdBadge size={20} />
                    Role
                  </label>

                  <div className="adminProfileRoleBadge">
                    Administrator
                  </div>

                </div>

                {isEditing && (
                  <button onClick={handleSaveProfile} className="adminProfileSaveBtn">
                    <MdSave size={18} />
                    Save Changes
                  </button>
                )}
              </div>
            </section>

            <section className="adminProfileCard">
              <div className="adminProfileCardHeader">
                <h2>Security</h2>
              </div>

              <div className="adminProfileCardBody">
                <button
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="adminProfilePasswordBtn"
                >
                  <MdLock size={20} />
                  {showPasswordChange ? "Hide Password Change" : "Change Password"}
                </button>

                {showPasswordChange && (
                  <form onSubmit={handlePasswordChange} className="adminProfilePasswordForm">
                    <div className="adminProfileInputGroup">
                      <label>Current Password</label>
                      <div className="passwordInputWrapper">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          className="adminProfileInput"
                          placeholder="Enter current password"
                          required
                        />
                        <button
                          type="button"
                          className="eyeToggle"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                        </button>
                      </div>
                    </div>

                    <div className="adminProfileInputGroup">
                      <label>New Password</label>
                      <div className="passwordInputWrapper">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          className="adminProfileInput"
                          placeholder="Enter new password"
                          required
                        />
                        <button
                          type="button"
                          className="eyeToggle"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                        </button>
                      </div>
                    </div>

                    <div className="adminProfileInputGroup">
                      <label>Confirm New Password</label>
                      <div className="passwordInputWrapper">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          className="adminProfileInput"
                          placeholder="Confirm new password"
                          required
                        />
                        <button
                          type="button"
                          className="eyeToggle"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                        </button>
                      </div>
                    </div>

                    <button type="submit" className="adminProfileSubmitBtn">
                      Update Password
                    </button>
                  </form>
                )}
              </div>
            </section>


          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminProfile;
