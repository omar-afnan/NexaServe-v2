
import request from "supertest";
import app from "../app.js";

let userToken = "";
let adminToken = "";
let supportToken = "";

const user = {
  userName: "user",
  userEmail: `user_${Date.now()}@test.com`,
  userPassword: "password123",
};

const admin = {
  userName: "Admin",
  userEmail: `admin_${Date.now()}@test.com`,
  userPassword: "adminpass123",
  role: "admin",
};

const support = {
  userName: "Support",
  userEmail: `support_${Date.now()}@test.com`,
  userPassword: "supportpass123",
  role: "support",
};

describe("Authentication Tests", () => {

  describe("Signup", () => {
    test("creates a new user account", async () => {
      const res = await request(app)
        .post("/auth/signup")
        .send(user);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("userId");
      expect(res.body.role).toBe("user");
      expect(res.body.userName).toBe(user.userName);
      userToken = res.body.token;
    });

    test("creates admin account", async () => {
      const res = await request(app)
        .post("/auth/signup")
        .send(admin);

      expect(res.statusCode).toBe(201);
      expect(res.body.role).toBe("admin");
      adminToken = res.body.token;
    });

    test("creates support account", async () => {
      const res = await request(app)
        .post("/auth/signup")
        .send(support);

      expect(res.statusCode).toBe(201);
      expect(res.body.role).toBe("support");
      supportToken = res.body.token;
    });

    test("rejects signup with missing fields", async () => {
      const res = await request(app)
        .post("/auth/signup")
        .send({ userName: "Incomplete" });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    test("blocks duplicate email", async () => {
      const res = await request(app)
        .post("/auth/signup")
        .send(user);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });
  });

  describe("Login", () => {
    test("logs in with valid credentials", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          userEmail: user.userEmail,
          userPassword: user.userPassword,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body.role).toBe("user");
      expect(res.body.userName).toBe(user.userName);
      userToken = res.body.token;
    });

    test("rejects wrong password", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          userEmail: user.userEmail,
          userPassword: "wrongpassword",
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    test("rejects unknown email", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          userEmail: "nobody@test.com",
          userPassword: "password123",
        });

      expect(res.statusCode).toBe(401);
    });

    test("rejects missing fields", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({ userEmail: user.userEmail });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("JWT Authentication", () => {
    test("rejects requests with no token", async () => {
      const res = await request(app).get("/tickets");

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/no token/i);
    });

    test("rejects invalid token", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", "Bearer invalidtoken123");

      expect(res.statusCode).toBe(403);
    });

    test("accepts valid token", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("Role-Based Access Control", () => {
    test("regular users cannot update ticket priority", async () => {
      const res = await request(app)
        .put("/tickets/FAKE123/priority")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ priority: "High" });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/forbidden/i);
    });

    test("support staff can access all tickets", async () => {
      const loginRes = await request(app)
        .post("/auth/login")
        .send({
          userEmail: support.userEmail,
          userPassword: support.userPassword,
        });

      supportToken = loginRes.body.token;

      const res = await request(app)
        .get("/tickets")
        .set("Authorization", `Bearer ${supportToken}`);

      expect(res.statusCode).toBe(200);
    });
  });
});
