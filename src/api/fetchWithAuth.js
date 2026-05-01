// handle fetch requests with authentication and session expiration handling
const fetchWithAuth = async (url, options = {}) => {
  const response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    sessionStorage.clear();

    // Show notification before redirecting
    const message = "Your session has expired. Please log in again.";

    // Use a non-blocking toast if available, otherwise fall back to a brief overlay
    showSessionExpiredNotification(message);

    // Small delay so the user can read the notification before redirect
    await new Promise((resolve) => setTimeout(resolve, 1500));

    window.location.href = "/login";
  }

  return response;
};

//  notification for session expiration
function showSessionExpiredNotification(message) {
  // Avoid duplicate banners
  if (document.getElementById("session-expired-banner")) return;

  const banner = document.createElement("div");
  banner.id = "session-expired-banner";
  banner.setAttribute("role", "alert");

  Object.assign(banner.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#c0392b",
    color: "#ffffff",
    padding: "14px 24px",
    borderRadius: "8px",
    fontSize: "15px",
    fontFamily: "DM Sans, sans-serif",
    fontWeight: "500",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    zIndex: "99999",
    textAlign: "center",
    maxWidth: "480px",
    width: "90%",
    pointerEvents: "none",
    opacity: "1",
    transition: "opacity 0.4s ease",
  });

  banner.textContent = message;
  document.body.appendChild(banner);

  // Fade out and remove after 4 s redirect fires after 1.5 s anyway
  setTimeout(() => {
    banner.style.opacity = "0";
    setTimeout(() => banner.remove(), 400);
  }, 4000);
}

export default fetchWithAuth;
