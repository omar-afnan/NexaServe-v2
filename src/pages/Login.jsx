import { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight
} from "lucide-react";
import "./CSS/Login.css";

const ROLE_TABS = [
  { key: "user", label: "End User", buttonLabel: "User Portal" },
  { key: "support", label: "Support Agent", buttonLabel: "Support Portal" },
  { key: "admin", label: "Admin", buttonLabel: "Admin Panel" }
];

export default function Login() {
  const location = useLocation();
  const sessionExpired = location.state?.reason === "session_expired";

  const [activeRole, setActiveRole] = useState("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const activeTab = useMemo(
    () => ROLE_TABS.find((t) => t.key === activeRole) || ROLE_TABS[0],
    [activeRole]
  );

  const validateForm = () => {
    const newErrors = { email: "", password: "" };
    let valid = true;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      newErrors.email = "Please enter a valid email.";
      valid = false;
    }

    if (!password || password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({ email: "", password: "" });

    try {
      const res = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userEmail: email,
          userPassword: password
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Login failed");
      }

      const data = await res.json();

      if (data.token) sessionStorage.setItem("token", data.token);
      if (data.role) sessionStorage.setItem("role", data.role);
      if (data.userName) sessionStorage.setItem("userName", data.userName);
      if (data.userId) sessionStorage.setItem("userId", data.userId);
      if (data.email) sessionStorage.setItem("userEmail", data.email);

      await new Promise(resolve => setTimeout(resolve, 500));

      const userRole = data.role;

      if (userRole === "admin") {
        window.location.href = "/AdminDashboard";
      } else if (userRole === "support") {
        window.location.href = "/dashboard";
      } else if (userRole === "user") {
        window.location.href = "/UserDashboard";
      } else {
        window.location.href = "/dashboard";
      }

    } catch (error) {
      const errorMessage = error.message || "Unable to connect to server";
      setErrors({
        email: "",
        password: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="authSplit">

      {/* ── Left panel ── */}
      <div className="authLeft">
        <div className="authBrand">
          <div className="brandLogoSquare">N</div>
          <div className="brandLogoText">
            <div className="brandLogoName">Nexa Serve</div>
            <div className="brandLogoMeta">IT SUPPORT · V2.4</div>
          </div>
        </div>

        <div className="authLeftCenter">
          <div className="authFormBlock">
            <h1 className="authTitle">Sign in to your portal</h1>
            <p className="authSubtitle">
              Welcome back. Choose the workspace you want to enter.
            </p>

            <div className="roleTabs" role="tablist">
              {ROLE_TABS.map((tab) => {
                const isActive = activeRole === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    className={`roleTab ${isActive ? "roleTabActive" : ""}`}
                    onClick={() => setActiveRole(tab.key)}
                    style={{
                      opacity: isActive ? 1 : 0.4,
                      transform: isActive ? "scale(1.02)" : "scale(0.96)",
                      transition: "opacity 200ms ease, transform 200ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.opacity = 1;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.opacity = 0.4;
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {sessionExpired && (
              <p className="errorText sessionExpiredText">
                Your session has expired, please log in again.
              </p>
            )}

            <form className="authForm" onSubmit={handleLogin}>
              <div className="formField">
                <label>Email address</label>
                <div className="inputWrapper">
                  <Mail className="inputIcon" size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="formInput"
                  />
                </div>
                {errors.email && <p className="errorText">{errors.email}</p>}
              </div>

              <div className="formField">
                <div className="passwordLabelRow">
                  <label>Password</label>
                  <a href="#" className="forgotLink">Forgot?</a>
                </div>
                <div className="inputWrapper">
                  <Lock className="inputIcon" size={16} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="formInput hasEye"
                  />
                  <button
                    type="button"
                    className="togglePassword"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="errorText">{errors.password}</p>}
              </div>

              <label className="rememberRow">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                />
                <span>Keep me signed in for 30 days</span>
              </label>

              <button type="submit" className="submitBtn" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="loginSpinner"></span>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="authFooter">
          © 2026 Nexa Serve · <a href="#">Status</a> · <a href="#">Privacy</a> · <a href="#">Terms</a>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="authRight">
        <div className="authRightTop">
          <span className="statusPill">
            <span className="statusDotGreen" />
            ALL SYSTEMS OPERATIONAL
          </span>
        </div>

        <div className="authRightCenter">
          <h2 className="marketingTitle">
            One support workspace.
            <br />
            Three views built for the job.
          </h2>
          <p className="marketingSub">
            Users raise tickets and chat with the AI assistant. Agents triage and
            resolve. Admins audit, predict, and report. Nexa Serve keeps every role
            focused on what matters.
          </p>

          <div className="marketingStats">
            <div className="statBox">
              <div className="statBoxLabel">TICKETS RESOLVED THIS MONTH</div>
              <div className="statBoxValue">1,284</div>
              <div className="statBoxDelta">+12% vs last</div>
            </div>
            <div className="statBox">
              <div className="statBoxLabel">AVERAGE FIRST RESPONSE</div>
              <div className="statBoxValue">8.7 min</div>
              <div className="statBoxDelta">−23% vs last</div>
            </div>
            <div className="statBox">
              <div className="statBoxLabel">ACTIVE AGENTS</div>
              <div className="statBoxValue">14</div>
              <div className="statBoxDelta">across 3 timezones</div>
            </div>
            <div className="statBox">
              <div className="statBoxLabel">ML CLASSIFICATION ACCURACY</div>
              <div className="statBoxValue">77.7%</div>
              <div className="statBoxDelta">mBERT model</div>
            </div>
          </div>
        </div>

        <div className="authRightFooter">
          <Lock size={11} /> Secured with JWT · bcrypt password hashing
        </div>
      </div>
    </div>
  );
}
