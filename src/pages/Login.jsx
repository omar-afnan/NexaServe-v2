import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn
} from "lucide-react";
import "./CSS/Login.css";

export default function Login() {
  const location = useLocation();
  const sessionExpired = location.state?.reason === "session_expired";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
     // using session storage to store token adn user info for that specific session
      if (data.token) {
        sessionStorage.setItem("token", data.token);
      }

      if (data.role) {
        sessionStorage.setItem("role", data.role);
      }

      if (data.userName) {
        sessionStorage.setItem("userName", data.userName);
      }

      if (data.userId) {
        sessionStorage.setItem("userId", data.userId);
      }

      if (data.email) {
        sessionStorage.setItem("userEmail", data.email);
      }

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
    <div className="authPage">


      <div className="loginContainer">
        <div className="loginCard">
          <div className="loginHeader">

            <h1 className="brandTitle">Welcome Back</h1>
            <p className="brandSubtitle">Sign in to continue to Nexa Serve</p>
          </div>

          {sessionExpired && (
            <p className="errorText" style={{ textAlign: "center", marginBottom: "12px" }}>
              Your session has expired, please log in again.
            </p>
          )}

          <form className="formContainer" onSubmit={handleLogin}>
            <div className="formField">
              <label>Email Address</label>
              <div className="inputWrapper">
                <Mail className="inputIcon" />
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="formInput"
                />
              </div>
              {errors.email && <p className="errorText">{errors.email}</p>}
            </div>

            <div className="formField">
              <label>Password</label>
              <div className="inputWrapper">
                <Lock className="inputIcon" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="formInput passwordInput"
                />
                <button
                  type="button"
                  className="togglePassword"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="errorText">{errors.password}</p>}
            </div>

            <div className="formOptions">
              <label className="checkboxLabel">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                  className="checkbox"
                />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgotLink">
                Forgot Password?
              </a>
            </div>

            <button type="submit" className="submitBtn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Signing In...
                </>
              ) : (
                <>
                  Sign In
                  <LogIn size={18} />
                </>
              )}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
