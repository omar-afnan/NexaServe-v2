
import request from "supertest";
import app from "../app.js";

let userToken = "";
let adminToken = "";
let supportToken = "";
let userId = "";
let ticketId = "";

const user = {
  userName: "Ticket Test user",
  userEmail: `ticketuser_${Date.now()}@test.com`,
  userPassword: "password123",
};

const admin = {
  userName: "Ticket Test admin",
  userEmail: `ticketadmin_${Date.now()}@test.com`,
  userPassword: "adminpass123",
  role: "admin",
};

const support = {
  userName: "Ticket Test support",
  userEmail: `ticketsupport_${Date.now()}@test.com`,
  userPassword: "supportpass123",
  role: "support",
};

describe("Tickets Tests", () => {

  beforeAll(async () => {
    let res = await request(app)
      .post("/auth/signup")
      .send(user);
    userToken = res.body.token;
    userId = res.body.userId;

    res = await request(app)
      .post("/auth/signup")
      .send(admin);
    adminToken = res.body.token;

    res = await request(app)
      .post("/auth/signup")
      .send(support);
    supportToken = res.body.token;
  });

  describe("creating tickets", () => {
    test("basic create", async () => {
      const res = await request(app)
        .post("/tickets")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          title: "Test Bug Report",
          description: "This is a test bug that needs fixing",
          category: "Bug",
          priority: "High",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("ticket_id");
      expect(res.body.message).toBe("Ticket created");
      ticketId = res.body.ticket_id;
    });

    test("no token → 401", async () => {
      const res = await request(app)
        .post("/tickets")
        .send({
          title: "Unauthorized Ticket",
          description: "This should fail",
          category: "Bug",
          priority: "High",
        });

      expect(res.statusCode).toBe(401);
    });

    test("missing fields → 500", async () => {
      const res = await request(app)
        .post("/tickets")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          title: "Incomplete Ticket",
        });

      expect(res.statusCode).toBe(500);
    });

    test("all priorities", async () => {
      const priorities = ["Low", "Medium", "High", "Critical"];

      for (const priority of priorities) {
        const res = await request(app)
          .post("/tickets")
          .set("Authorization", `Bearer ${userToken}`)
          .send({
            title: `Priority ${priority} Ticket`,
            description: `This is a ${priority} priority ticket`,
            category: "Feature Request",
            priority: priority,
          });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("ticket_id");
      }
    });

    test(" all categories", async () => {
      const categories = ["Bug", "Feature Request", "Issue", "Inquiry"];

      for (const category of categories) {
        const res = await request(app)
          .post("/tickets")
          .set("Authorization", `Bearer ${userToken}`)
          .send({
            title: `${category} Ticket`,
            description: `This is a ${category} ticket`,
            category: category,
            priority: "Medium",
          });

        expect(res.statusCode).toBe(200);
      }
    });
  });
  

  describe("fetching tickets", () => {
    test("user scope check", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      res.body.forEach((ticket) => {
        expect(ticket.created_by).toBe(userId);
      });
    });

    test("admin access to all tickets", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("support access to all tickets", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", `Bearer ${supportToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("no token → 401", async () => {
      const res = await request(app)
        .get("/tickets");

      expect(res.statusCode).toBe(401);
    });

    test("tickets have created_at field", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      if (res.body.length > 1) {
        for (let i = 0; i < res.body.length; i++) {
          expect(res.body[i]).toHaveProperty("created_at");
        }
      }
    });
  });

  describe("status changes", () => {
    test("support  updates status", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}`)
        .set("Authorization", `Bearer ${supportToken}`)
        .send({ status: "In Progress" });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Ticket status updated successfully");
    });

    test("admin update status", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "Pending" });

      expect(res.statusCode).toBe(200);
    });

    test("user cannot update status", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ status: "Closed" });

      expect(res.statusCode).toBe(403);
    });

    test("bad status", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}`)
        .set("Authorization", `Bearer ${supportToken}`)
        .send({ status: "InvalidStatus" });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid status/i);
    });

    test("accepts all valid statuses", async () => {
      const statuses = ["Open", "In Progress", "Closed"];

      for (const status of statuses) {
        const res = await request(app)
          .put(`/tickets/${ticketId}`)
          .set("Authorization", `Bearer ${supportToken}`)
          .send({ status });

        expect(res.statusCode).toBe(200);
      }
    });

    test("returns 404 for missing ticket", async () => {
      const res = await request(app)
        .put("/tickets/NONEXISTENT123")
        .set("Authorization", `Bearer ${supportToken}`)
        .send({ status: "Closed" });

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/Ticket not found/i);
    });

    test("no token 401", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}`)
        .send({ status: "Closed" });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("priority changes", () => {
    test("support can update priority", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}/priority`)
        .set("Authorization", `Bearer ${supportToken}`)
        .send({ priority: "Critical" });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Priority updated");
    });

    test("admin can update priority", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}/priority`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ priority: "Low" });

      expect(res.statusCode).toBe(200);
    });

    test("user cannot update priority", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}/priority`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ priority: "High" });

      expect(res.statusCode).toBe(403);
    });

    test("bad priority", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}/priority`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ priority: "InvalidPriority" });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid priority/i);
    });

    test("accepts all valid priorities", async () => {
      const priorities = ["Low", "Medium", "High", "Critical"];

      for (const priority of priorities) {
        const res = await request(app)
          .put(`/tickets/${ticketId}/priority`)
          .set("Authorization", `Bearer ${supportToken}`)
          .send({ priority });

        expect(res.statusCode).toBe(200);
      }
    });

    test("returns 404 for missing ticket", async () => {
      const res = await request(app)
        .put("/tickets/NONEXISTENT123/priority")
        .set("Authorization", `Bearer ${supportToken}`)
        .send({ priority: "High" });

      expect(res.statusCode).toBe(404);
    });

    test("no token → 401", async () => {
      const res = await request(app)
        .put(`/tickets/${ticketId}/priority`)
        .send({ priority: "Low" });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("deleting tickets", () => {
    let userTicketId = "";
    let theirTicket = "";
    let secondToken = "";

    beforeAll(async () => {
      const otheruser = {
        userName: "Other user",
        userEmail: `otheruser_${Date.now()}@test.com`,
        userPassword: "password123",
      };

      const res = await request(app)
        .post("/auth/signup")
        .send(otheruser);

      secondToken = res.body.token;

      const ticketRes = await request(app)
        .post("/tickets")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          title: "Ticket to Delete",
          description: "Test deletion",
          category: "Bug",
          priority: "Low",
        });
      userTicketId = ticketRes.body.ticket_id;

      const otherTicketRes = await request(app)
        .post("/tickets")
        .set("Authorization", `Bearer ${secondToken}`)
        .send({
          title: "Other user Ticket",
          description: "Should not be deletable by first user",
          category: "Bug",
          priority: "Low",
        });
      theirTicket = otherTicketRes.body.ticket_id;
    });

    test("user can delete their own ticket", async () => {
      const res = await request(app)
        .delete(`/tickets/${userTicketId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
    });

    test("user cannot delete someone else's ticket", async () => {
      const res = await request(app)
        .delete(`/tickets/${theirTicket}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/own tickets/i);
    });

    test("admin can delete any ticket", async () => {
      const ticketRes = await request(app)
        .post("/tickets")
        .set("Authorization", `Bearer ${secondToken}`)
        .send({
          title: "admin Delete Test",
          description: "admin should be able to delete this",
          category: "Bug",
          priority: "Low",
        });

      const res = await request(app)
        .delete(`/tickets/${ticketRes.body.ticket_id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });

    test("support can delete any ticket", async () => {
      const ticketRes = await request(app)
        .post("/tickets")
        .set("Authorization", `Bearer ${secondToken}`)
        .send({
          title: "support Delete Test",
          description: "support should be able to delete this",
          category: "Bug",
          priority: "Low",
        });

      const res = await request(app)
        .delete(`/tickets/${ticketRes.body.ticket_id}`)
        .set("Authorization", `Bearer ${supportToken}`);

      expect(res.statusCode).toBe(200);
    });

    test("returns 404 for missing ticket on delete", async () => {
      const res = await request(app)
        .delete("/tickets/NONEXISTENT123")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/Ticket not found/i);
    });

    test("no token → 401", async () => {
      const res = await request(app)
        .delete(`/tickets/${theirTicket}`);

      expect(res.statusCode).toBe(401);
    });
  });
});
