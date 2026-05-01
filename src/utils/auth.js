// Auth helper functions
export const getAuth = () => {
  const token = sessionStorage.getItem("token");
  const role = sessionStorage.getItem("role");
  return {
    token, role
  };
};

export const isAuthenticated = () => {
  const { token } = getAuth();
  return !!token;
};

export const hasRole = (allowedRoles) => {
  const { role } = getAuth();
  return allowedRoles.includes(role);
};
