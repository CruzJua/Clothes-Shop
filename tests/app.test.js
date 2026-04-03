const request = require("supertest");
const app = require("../frontend/app");

describe("Frontend Routes", () => {
    test("GET / should return 200 OK", async () => {
        const response = await request(app).get("/");
        expect(response.status).toBe(200);
    });

    test("GET /contact-us should return 200 OK", async () => {
        const response = await request(app).get("/contact-us");
        expect(response.status).toBe(200);
    });

    test("GET /login should return 200 OK", async () => {
        const response = await request(app).get("/login");
        expect(response.status).toBe(200);
    });
});
