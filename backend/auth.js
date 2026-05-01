import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

export const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET is not defined");
}


// authenticating JWT tokens in incoming requests
export function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

 const token = authHeader?.startsWith("Bearer ")
  ? authHeader.split(" ")[1]
  : null;

if (!token) {
  return res.status(401).json(
    {
      error: "Invalid authorization header"
    });
}

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.error("JWT verification failed");
      return res.status(403).json(
        {
        error: "Invalid or expired token"
      });
    }

    // Attach decoded user info id + role 
    req.user = user;
    next();
  });
}

//  checking the user role and authorizing access based on that role
export function authorizeRoles(...rolesAllowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (rolesAllowed.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json(
      {
        error: "Forbidden insufficient role"
      });
  };
}

// generates JWT tokens for authenticated users 
export function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id || user.userId,
      email: user.email,
      role: user.role,
      name: user.name
    },
    SECRET_KEY,
    {
      expiresIn: "9h" // token is only valid for the 9 hours agter it will expire 
    }
  );
}
