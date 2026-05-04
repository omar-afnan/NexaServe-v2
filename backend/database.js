import sqlite3 from "sqlite3";

const database = new sqlite3.Database("./backend/tickets.db");
database.run("PRAGMA foreign_keys = ON;")
database.run("PRAGMA journal_mode=WAL;");

database.serialize(() => {
  // users
  database.run(`CREATE TABLE IF NOT EXISTS users(
    userId INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
    function (error) {
    if (error) {
      console.log("Error creating users table:", error.message);
    } else {
      console.log("Users table ready");
    }
  });

  // tickets
  database.run(`CREATE TABLE IF NOT EXISTS tickets(
    ticket_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    created_by INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    assigned_to INTEGER DEFAULT NULL,
    solution TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, function(error) {
    if (error) {
      console.log("Error creating tickets table:", error.message);
    } else {
      console.log("Tickets table ready");

database.all("PRAGMA table_info(tickets)", [], (err, columns) => {
  const hasAssignedTo = columns.some(col => col.name === 'assigned_to');
  const hasUpdatedAt = columns.some(col => col.name === "updated_at");
  const hasSolution = columns.some(col => col.name === 'solution');
  const hasCategoryConfidence = columns.some(col => col.name === 'category_confidence');
  const hasPriorityConfidence = columns.some(col => col.name === 'priority_confidence');

  if (!hasAssignedTo) {
    database.run(`ALTER TABLE tickets ADD COLUMN assigned_to INTEGER DEFAULT NULL`, function(alterError) {
      if (alterError) {
        console.log("Error adding column:", alterError.message);
      } else {
        console.log("Added assigned_to column to tickets");
      }
    });
  }


if (!hasUpdatedAt) {
  // SQLite may reject this, fallback handles it below
  database.run(`ALTER TABLE tickets ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, function(alterError) {
    if (alterError) {
      const msg = String(alterError.message || '').toLowerCase();
      console.log("Error adding updated_at with default:", alterError.message);

      //the sqlite some times reject default on new columns so retry without it
      //if the column already exists or has a name error retry without default
      
      if (msg.includes('cannot add a column with non-constant') || msg.includes('duplicate column name') || msg.includes('has no column named')) {
        database.run(`ALTER TABLE tickets ADD COLUMN updated_at DATETIME`, function(fallbackErr) {
          if (fallbackErr) {
            if (String(fallbackErr.message || '').toLowerCase().includes('duplicate column name')) {
              console.log("Column 'updated_at' already exists; skipping add.");
            } else {
              console.log("Fallback error adding updated_at column:", fallbackErr.message);
            }
            return;
          }
          console.log("Fallback: Added updated_at column to tickets (no default).");


          // Populate updated_at for existing closed/resolved tickets


          database.run(`UPDATE tickets SET updated_at = created_at WHERE status IN ('Closed','Resolved')`, function(updErr) {
            if (updErr) console.log('Error populating updated_at for existing rows:', updErr.message);
            else console.log('Populated updated_at = created_at for closed/resolved tickets');
          });
        });
      }
    } else {
      console.log("Added updated_at column to tickets (with DEFAULT CURRENT_TIMESTAMP).");

 
// still update existing rows just in case

      database.run(`UPDATE tickets SET updated_at = created_at WHERE status IN ('Closed','Resolved')`, function(updErr) {
        if (updErr) console.log('Error populating updated_at for existing rows:', updErr.message);
        else console.log('Populated updated_at = created_at for closed/resolved tickets');
      });
    }
  });
}



  if (!hasSolution) {
    database.run(`ALTER TABLE tickets ADD COLUMN solution TEXT DEFAULT NULL`, function(alterError) {
      if (alterError) {
        console.log("Error adding solution column:", alterError.message);
      } else {
        console.log("Added solution column to tickets");
      }
    });
  }

  if (!hasCategoryConfidence) {
    database.run(`ALTER TABLE tickets ADD COLUMN category_confidence REAL DEFAULT NULL`, function(alterError) {
      if (alterError) {
        console.log("Error adding category_confidence column:", alterError.message);
      } else {
        console.log("Added category_confidence column to tickets");
      }
    });
  }

  if (!hasPriorityConfidence) {
    database.run(`ALTER TABLE tickets ADD COLUMN priority_confidence REAL DEFAULT NULL`, function(alterError) {
      if (alterError) {
        console.log("Error adding priority_confidence column:", alterError.message);
      } else {
        console.log("Added priority_confidence column to tickets");
      }
    });
  }
});
    }
  });

  // backfill updated_at for seeded tickets
  database.run(`
    UPDATE tickets
    SET updated_at = datetime(created_at, '+' || (1800 + ABS(RANDOM()) % 169200) || ' seconds')
    WHERE status IN ('Closed', 'Resolved')
      AND (updated_at = created_at OR updated_at IS NULL)
  `, function(err) {
    if (err) console.log('Backfill updated_at error:', err.message);
    else if (this.changes > 0) console.log('Backfilled updated_at for', this.changes, 'seeded closed tickets');
  });

  // comments
  database.run(`CREATE TABLE IF NOT EXISTS comments(
    comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(userId) ON DELETE CASCADE
  )`, function(error) {
    if (error) {
      console.log("Error creating comments table:", error.message);
    } else {
      console.log("Comments table ready");
    }
  });

  // notifications
database.run(`CREATE TABLE IF NOT EXISTS notifications(
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ticket_id TEXT DEFAULT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(userId) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
)`, function(error) {
  if (error) {
    console.log("Error creating notifications table:", error.message);
  } else {
    console.log("Notifications table ready");

    database.all("PRAGMA table_info(notifications)", [], (err, columns) => {
      const hasTicketId = columns.some(col => col.name === 'ticket_id');
      const hasIsRead = columns.some(col => col.name === 'is_read');

      if (!hasTicketId) {
        database.run(`ALTER TABLE notifications ADD COLUMN ticket_id TEXT DEFAULT NULL`, function(alterError) {
          if (alterError) {
            console.log("Error adding ticket_id column:", alterError.message);
          } else {
            console.log("Added ticket_id column to notifications");
          }
        });
      }

      if (!hasIsRead) {
        database.run(`ALTER TABLE notifications ADD COLUMN is_read BOOLEAN DEFAULT 0`, function(alterError) {
          if (alterError) {
            console.log("Error adding is_read column:", alterError.message);
          } else {
            console.log("Added is_read column to notifications");
          }
        });
      }
    });
  }
});

  // llama logs
  database.run(`CREATE TABLE IF NOT EXISTS llama_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ticket_id TEXT DEFAULT NULL,
    user_message TEXT NOT NULL,
    chatterbot_response TEXT,
    llama_response TEXT NOT NULL,
    was_resolved INTEGER NOT NULL DEFAULT 0,
    trigger_reason TEXT NOT NULL CHECK(trigger_reason IN ('validation_failed', 'user_dissatisfied')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(userId) ON DELETE CASCADE,
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE SET NULL
  )`, function(error) {
    if (error) {
      console.log("Error creating llama_logs table:", error.message);
    } else {
      console.log("llama_logs table ready");
    }
  });

  // audit logs
  database.run(`CREATE TABLE IF NOT EXISTS auditLogs(
  logId INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  userName TEXT NOT NULL,
  userRole TEXT NOT NULL,
  action TEXT NOT NULL,
  ticket_id TEXT DEFAULT NULL,
  details TEXT,
  ipAddress TEXT,
  userAgent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(userId) ON DELETE SET NULL
)`, function(error) {
  if (error) {
    console.log("Error occurred while creating audit log table:", error.message);
  } else {
    console.log("Audit logs table ready");
  }
});


});

export default database;
