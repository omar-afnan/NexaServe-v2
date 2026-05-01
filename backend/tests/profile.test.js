
import request from "supertest";
import app from "../app.js";

let userToken = "";
let userId = "";
const email  = `profileuser_${Date.now()}@test.com`;

beforeAll(async () => {
  const res = await request(app)
    .post("/auth/signup")
    .send({
      userName: "Profile Test User",
      userEmail: email ,
      userPassword: "password123",
    });
  userToken = res.body.token;
  userId = res.body.userId;
});

describe("User Profile Tests", () => {

  //  profile

  describe("GET /users/me", () => {
    test("returns user profile", async () => {
      const res = await request(app)
        .get("/users/me")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("name", "Profile Test User");
      expect(res.body).toHaveProperty("email", email );
      expect(res.body).toHaveProperty("role", "user");
      expect(res.body).not.toHaveProperty("password");
    });

    test("request rejected  without auth", async () => {
      const res = await request(app).get("/users/me");

      expect(res.statusCode).toBe(401);
    });
  });

  // update profile

  describe("PUT /users/me", () => {
    test("update name and email", async () => {
      const emailUpdate = `updated_${Date.now()}@test.com`;
      const res = await request(app)
        .put("/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send({

          name: "Updated Name",
          
          email: emailUpdate,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/updated/i);
      expect(res.body.name).toBe("Updated Name");
    });

    test("blocks an update with missing fields", async () => {
      const res = await request(app)
        .put("/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ name: "Only Name" });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });
  });

  // password

  describe("PUT /users/me/password", () => {
    test("password updated successfully", async () => {
      const res = await request(app)
        .put("/users/me/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          currentPassword: "password123",
          newPassword: "newpassword456",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/changed/i);
    });

    test("login with new password", async () => {
      const profileRes = await request(app)
        .get("/users/me")
        .set("Authorization", `Bearer ${userToken}`);

      const res = await request(app)
        .post("/auth/login")
        .send({
          userEmail: profileRes.body.email,
          userPassword: "newpassword456",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("token");
      userToken = res.body.token;
    });

    test("denies the incorrect password", async () => {
      const res = await request(app)
        .put("/users/me/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          currentPassword: "wrongpassword",
          newPassword: "anotherpass123",
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/incorrect/i);
    });

    test("short password are rejected", async () => {
      const res = await request(app)
        .put("/users/me/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          currentPassword: "newpassword456",
          newPassword: "short",
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/6 characters/i);
    });

    test("missing fields are rejected", async () => {
      const res = await request(app)
        .put("/users/me/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ currentPassword: "newpassword456" });

      expect(res.statusCode).toBe(400);
    });
  });
});
