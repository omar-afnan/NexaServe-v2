import express from "express";
import bcrypt from "bcryptjs";
import db from "./database.js";
import { generateToken } from "./auth.js";

class AuthController {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post("/signup", this.signup.bind(this));
    this.router.post("/login", this.login.bind(this));
  }

  getRouter() {
    return this.router;
  }

  async signup(req, res) {
    try {
      const { userName, userEmail, userPassword, role } = req.body;

     
      if (!userName || !userEmail || !userPassword) {
        return res.status(400).json({
          error: "All fields are required (userName, userEmail, userPassword)",
        });
      }

      // check if user already exists
      db.get(
        "SELECT * FROM users WHERE email = ?",
        [userEmail],
        async (err, existingUser) => {
          if (err) {
            return res.status(500).json(
              {
                error: "Database error"
              });
          }

          if (existingUser) {
            return res.status(409).json({
              error: "User with this email already exists",
            });
          }

          // hash password
          const hashedPassword = await bcrypt.hash(userPassword, 10);

          const allowedRoles = ["user", "support", "admin"];
          const userRole = allowedRoles.includes(role) ? role : "user";

        
          db.run(
            `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
            [userName, userEmail, hashedPassword, userRole],
            function (err) {
              if (err) {
                return res.status(500).json(
                  {
                    error: "Failed to create user"
                  }
                );
              }

              const token = generateToken({
                user_id: this.lastID,
                email: userEmail,
                role: userRole,
                name: userName,
              });

              res.status(201).json({
                token,
                userId: this.lastID,
                role: userRole,
                userName,
              });
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json(
        {
          error: "Server error during signup"
        }
      );
    }
  }

  async login(req, res) {
    try {
      const { userEmail, userPassword } = req.body;

      if (!userEmail || !userPassword) {
        return res.status(400).json(
          {
            error: "Email and password are required"
          }
        );
      }

      // find user
      db.get(
        "SELECT * FROM users WHERE email = ?",
        [userEmail],
        async (err, user) => {
          if (err) {
            return res.status(500).json(
              {
                error: "Database error"
              }
            );
          }

          if (!user) {
            return res.status(401).json(
              {
                error: "Invalid email or password"
              }
            );
          }

          // check password
          const isValidPassword = await bcrypt.compare(userPassword, user.password);

          if (!isValidPassword) {
            return res.status(401).json(
              {
                error: "Invalid email or password"
              }
            );
          }

          // login 
          const token = generateToken({
            user_id: user.userId,
            email: user.email,
            role: user.role,
            name: user.name,
          });

          // return token and user info
          res.json({
            token,
            role: user.role,
            userName: user.name,
            userId: user.userId,
            email: user.email,
          });
        }
      );
    } catch (error) {
      res.status(500).json(
        {
          error: "Server error during login"
        });
    }
  }
}

export default AuthController;
