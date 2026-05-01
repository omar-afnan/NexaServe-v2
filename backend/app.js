
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import db from "./database.js";
import AuthController from "./AuthController.js";

import {
  authenticateJWT,
  authorizeRoles
} from "./auth.js";
import {
  customAlphabet
} from "nanoid";

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

const validStatus = ["Open", "In Progress", "Closed"];
const validPriority = ["Low", "Medium", "High", "Critical"];
  

const authController = new AuthController();
app.use("/auth", authController.getRouter());

// ticket id
const generateTicketId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 10);

app.post("/tickets", authenticateJWT, async (req, res) => {
  const { title, description } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: "Title and description required" });
  }

  const created_by = req.user.user_id;
  const ticket_id = generateTicketId();

  let category = req.body.category;
  let priority = req.body.priority;
  let category_confidence = null;
  let priority_confidence = null;

  try {
    const mlResponse = await fetch("http://localhost:5006/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    if (mlResponse.ok) {
      const mlData = await mlResponse.json();
      category = mlData.category || category;
      priority = mlData.priority || priority;
      category_confidence = mlData.category_confidence ?? null;
      priority_confidence = mlData.priority_confidence ?? null;
    }
  } catch (_) {
    // ML service unavailable — fall back to client-supplied values
  }

  const query = `INSERT INTO tickets (ticket_id, title, description, category, priority, status, created_by, category_confidence, priority_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(query, [ticket_id, title, description, category, priority, "Open", created_by, category_confidence, priority_confidence], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      message: "Ticket created",
      ticket_id,
      category,
      priority,
      category_confidence,
      priority_confidence,
    });
  });
});

app.get("/tickets", authenticateJWT, (req, res) => {
  if (req.user.role === "admin" || req.user.role === "support") {
    db.all("SELECT * FROM tickets ORDER BY created_at DESC", [], (err, rows) => {
      if (err) {
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }
      res.json(rows);
    });
  } else {
    db.all("SELECT * FROM tickets WHERE created_by = ? ORDER BY created_at DESC", [req.user.user_id], (err, rows) => {
      if (err) {
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }
      res.json(rows);
    });
  }
});

app.put("/tickets/:id", authenticateJWT, authorizeRoles("support", "admin"), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  

  if (!validStatus.includes(status)) {
    return res.status(400).json(
      {
        error: "Invalid status value"
      }
    );
  }

  db.run("UPDATE tickets SET status = ? WHERE ticket_id = ?", [status, id], function (err) {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    if (this.changes === 0) {
      return res.status(404).json(
        {
          error: "Ticket not found"
        }
      );
    }
    res.json(
      {
        message: "Ticket status updated successfully"
      }
    );
  });
});

app.delete("/tickets/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;
  const userRole = req.user.role;

  db.get("SELECT created_by FROM tickets WHERE ticket_id = ?", [id], (err, ticket) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    if (!ticket) {
      return res.status(404).json(
        {
          error: "Ticket not found"
        });
    }
    // non-owners can't delete
    if (userRole !== "admin" && userRole !== "support" && ticket.created_by !== userId) {
      return res.status(403).json(
        {
          error: "You can only delete your own tickets"
        }
      );
    }

    db.run("DELETE FROM tickets WHERE ticket_id = ?", [id], function (error) {
      if (error) {
        return res.status(500).json(
          {
            error: error.message
          }
        );
      }
      res.json(
        {
          message: "Ticket has been deleted"
        }
      );
    });
  });
});

app.put("/tickets/:id/priority", authenticateJWT, authorizeRoles("admin", "support"), (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;


  if (!validPriority.includes(priority)) {
    return res.status(400).json(
      {
        error: "Invalid priority value"
      }
    );
  }

  db.run("UPDATE tickets SET priority = ? WHERE ticket_id = ?", [priority, id], function (err) {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    if (this.changes === 0) {
      return res.status(404).json(
        {
          error: "Ticket not found"
        });
    }
    res.json(
      {
        message: "Priority updated"
      }
    );
  });
});

app.get("/users/me", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  db.get("SELECT userId, name, email, role, created_at FROM users WHERE userId = ?", [userId], (err, row) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    if (!row) {
      return res.status(404).json(
        { error: "User not found" });
    }
    res.json(row);
  });
});

app.put("/users/me", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json(
      {
        error: "Name and email are required"
      }
    );
  }

  db.get("SELECT userId FROM users WHERE email = ? AND userId != ?", [email, userId], (err, existing) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    if (existing) {
      return res.status(400).json(
        {
          error: "Email is already in use by another account"
        }
      );
    }

    db.run("UPDATE users SET name = ?, email = ? WHERE userId = ?", [name, email, userId], function (err) {
      if (err) {
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }
      if (this.changes === 0) {
        return res.status(404).json(
          {
            error: "User not found"
          }
        );
      }
      res.json(
        {
          message: "Profile updated", name, email
        }
      );
    });
  });
});

app.put("/users/me/password", authenticateJWT, async (req, res) => {
  const userId = req.user.user_id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json(
      {
        error: "Current password and new password are required"
      });
  }

  if (newPassword.length < 6) {
    return res.status(400).json(
      {
        error: "New password must be at least 6 characters"
      }
    );
  }

  db.get("SELECT password FROM users WHERE userId = ?", [userId], async (err, user) => {
    if (err) return res.status(500).json(
      {
        error: err.message
      });
    
    if (!user) return res.status(404).json(
      {
        error: "User not found"
      }
    );

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json(
        {
          error: "Current password is incorrect"
        }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    db.run("UPDATE users SET password = ? WHERE userId = ?", [hashed, userId], function (err) {
      if (err) return res.status(500).json(
        {
          error: err.message
        }
      );
      res.json(
        {
          message: "Password changed"
        }
      );
    });
  });
});

export default app;
