import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makePdf } from "../helpers/pdf";

const BASE = (process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const NOT_FOUND = "I couldn't find this information in your uploaded documents.";
const RUN = randomUUID().slice(0, 8);

/** Minimal cookie-carrying HTTP client for one user. */
class Client {
  private cookie = "";

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0]!;
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text);
    } catch {
      // HTML or empty response
    }
    return { status: res.status, body: body as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  get = (path: string) => this.request(path);
  post = (path: string, data: unknown = {}) =>
    this.request(path, { method: "POST", body: JSON.stringify(data) });
  del = (path: string) => this.request(path, { method: "DELETE" });

  async upload(fileName: string, content: Uint8Array | string, type = "") {
    const form = new FormData();
    const part = typeof content === "string" ? content : new Uint8Array(content);
    form.append("file", new Blob([part], { type }), fileName);
    return this.request("/api/documents", { method: "POST", body: form });
  }

  async signup(label: string) {
    const res = await this.post("/api/auth/signup", {
      email: `it-${label}-${RUN}@example.test`,
      password: "integration-pass-123",
      organizationName: `IT ${label} ${RUN}`,
    });
    expect(res.status).toBe(201);
  }

  async ask(conversationId: string, question: string) {
    const res = await this.post(`/api/chat/conversations/${conversationId}/messages`, { question });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.message as { content: string; sources: { ref: number; documentName: string; pages?: number[] }[] };
  }

  async newConversation() {
    const res = await this.post("/api/chat/conversations");
    expect(res.status).toBe(201);
    return res.body.conversation.id as string;
  }

  async waitUntilReady(documentId: string, timeoutMs = 240_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await this.get(`/api/documents/${documentId}`);
      const status = res.body.document?.status;
      if (status === "ready") return res.body.document;
      if (status === "failed") throw new Error(`Processing failed: ${res.body.document.error_message}`);
      if (Date.now() > deadline) throw new Error(`Timed out waiting for document (status ${status})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

const POLICY = `# Northwind Leave Policy (${RUN})

Annual Leave: 24 days per year.
Sick Leave: 12 days per year.
Casual Leave: 6 days per year.

All leave requests must be submitted through the HR portal at least 3 business days in advance.`;

describe("Plabix Nexus end-to-end", () => {
  const alice = new Client(); // organization A
  const bob = new Client(); // organization B
  let policyId: string;
  let pdfId: string;
  let aliceConversation: string;

  beforeAll(async () => {
    const health = await fetch(`${BASE}/api/health`).catch(() => null);
    if (!health) throw new Error(`App is not running at ${BASE}. Start it with \`npm run dev\`.`);
    await alice.signup("alice");
    await bob.signup("bob");
  });

  describe("health and authentication", () => {
    it("reports database, pgvector, Ollama and models as healthy", async () => {
      const res = await new Client().get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ database: "ok", vector: "ok", ollama: "ok", status: "ok" });
    });

    it("rejects unauthenticated access to protected APIs", async () => {
      const anon = new Client();
      for (const path of ["/api/documents", "/api/chat/conversations", "/api/dashboard/stats", "/api/usage", "/api/organization"]) {
        expect((await anon.get(path)).status, path).toBe(401);
      }
    });

    it("redirects unauthenticated page visits to login", async () => {
      const res = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
      expect([303, 307, 308]).toContain(res.status);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("rejects a wrong password with a generic message", async () => {
      const res = await new Client().post("/api/auth/login", {
        email: `it-alice-${RUN}@example.test`,
        password: "wrong-password",
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid email or password.");
    });

    it("rejects duplicate sign-up", async () => {
      const res = await new Client().post("/api/auth/signup", {
        email: `IT-ALICE-${RUN}@example.test`,
        password: "integration-pass-123",
        organizationName: "Dup",
      });
      expect(res.status).toBe(409);
    });

    it("rejects cross-origin state-changing requests", async () => {
      const res = await alice.request("/api/chat/conversations", {
        method: "POST",
        body: "{}",
        headers: { origin: "https://evil.example" },
      });
      expect(res.status).toBe(403);
    });

    it("sends security headers", async () => {
      const res = await fetch(`${BASE}/login`);
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    });
  });

  describe("document ingestion", () => {
    it("uploads Markdown without a browser MIME type and indexes it", async () => {
      const res = await alice.upload("northwind-leave-policy.md", POLICY);
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      policyId = res.body.documentId;
      const doc = await alice.waitUntilReady(policyId);
      expect(doc.chunk_count).toBeGreaterThan(0);
    });

    it("uploads a multi-page PDF and indexes every page", async () => {
      const pdf = makePdf([
        [`Northwind Travel Policy ${RUN}`, "Economy class is required for flights under 6 hours."],
        ["Hotel stays are reimbursed up to 150 dollars per night."],
      ]);
      const res = await alice.upload("northwind-travel-policy.pdf", pdf, "application/pdf");
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      pdfId = res.body.documentId;
      const doc = await alice.waitUntilReady(pdfId);
      expect(doc.chunk_count).toBe(2);
    });

    it("rejects duplicates, fake PDFs, unsupported and empty files", async () => {
      expect((await alice.upload("copy.md", POLICY)).status).toBe(409);
      expect((await alice.upload("fake.pdf", "just text", "application/pdf")).status).toBe(400);
      expect((await alice.upload("tool.exe", "MZ binary")).status).toBe(400);
      expect((await alice.upload("empty.txt", "")).status).toBe(400);
    });

    it("searches the document library", async () => {
      const res = await alice.get("/api/documents?q=travel");
      expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([pdfId]);
    });
  });

  describe("grounded answers with citations", () => {
    beforeAll(async () => {
      aliceConversation = await alice.newConversation();
    });

    it("answers the annual leave question and cites the policy", async () => {
      const message = await alice.ask(aliceConversation, "How many annual leave days does an employee receive?");
      expect(message.content).toMatch(/\b24\b/);
      expect(message.content.toLowerCase()).toContain("annual leave");
      expect(message.sources.map((s) => s.documentName)).toContain("northwind-leave-policy.md");
    });

    it("cites the correct PDF page", async () => {
      const message = await alice.ask(aliceConversation, "What is the hotel reimbursement limit per night?");
      expect(message.content).toMatch(/150/);
      const source = message.sources.find((s) => s.documentName === "northwind-travel-policy.pdf");
      expect(source?.pages).toEqual([2]);
    });

    it.each([
      "What is the capital of France?",
      "What is the parental leave policy?",
      "What is the CEO's salary?",
    ])("refuses to answer unrelated question: %s", async (question) => {
      const message = await alice.ask(aliceConversation, question);
      expect(message.content).toBe(NOT_FOUND);
      expect(message.sources).toEqual([]);
    });

    it("keeps chat history", async () => {
      const res = await alice.get(`/api/chat/conversations/${aliceConversation}`);
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(10); // 5 questions + 5 answers
      expect(res.body.conversation.title).toContain("annual leave");
    });
  });

  describe("organization isolation", () => {
    it("never retrieves another organization's documents", async () => {
      const conversation = await bob.newConversation();
      const message = await bob.ask(conversation, "How many annual leave days does an employee receive?");
      expect(message.content).toBe(NOT_FOUND);
      expect(message.sources).toEqual([]);
    });

    it("hides another organization's documents", async () => {
      expect((await bob.get("/api/documents")).body.documents).toEqual([]);
      expect((await bob.get(`/api/documents/${policyId}`)).status).toBe(404);
      expect((await bob.post(`/api/documents/${policyId}/retry`)).status).toBe(404);
      expect((await bob.del(`/api/documents/${policyId}`)).status).toBe(404);
      expect((await alice.get(`/api/documents/${policyId}`)).status).toBe(200); // still there
    });

    it("hides another organization's conversations", async () => {
      expect((await bob.get(`/api/chat/conversations/${aliceConversation}`)).status).toBe(404);
      expect((await bob.post(`/api/chat/conversations/${aliceConversation}/messages`, { question: "hi" })).status).toBe(404);
      expect((await bob.del(`/api/chat/conversations/${aliceConversation}`)).status).toBe(404);
      const list = await bob.get("/api/chat/conversations");
      expect(list.body.conversations.map((c: { id: string }) => c.id)).not.toContain(aliceConversation);
    });

    it("keeps dashboards and usage separate", async () => {
      const stats = await bob.get("/api/dashboard/stats");
      expect(stats.body.documents.total).toBe("0");
      expect(stats.body.recentQuestions.every((q: { content: string }) => !q.content.includes("hotel"))).toBe(true);
      const usage = await bob.get("/api/usage");
      expect(usage.body.events.filter((e: { event_type: string }) => e.event_type === "embedding")).toEqual([]);
    });

    it("treats malformed ids as not found", async () => {
      expect((await alice.get("/api/documents/not-a-uuid")).status).toBe(404);
      expect((await alice.get("/api/chat/conversations/1%20OR%201=1")).status).toBe(404);
    });
  });

  describe("cleanup and sessions", () => {
    it("deletes a document and its knowledge", async () => {
      expect((await alice.del(`/api/documents/${pdfId}`)).status).toBe(200);
      expect((await alice.get(`/api/documents/${pdfId}`)).status).toBe(404);
    });

    it("invalidates the session on logout", async () => {
      const carol = new Client();
      await carol.signup("carol");
      expect((await carol.get("/api/documents")).status).toBe(200);
      const savedCookie = (carol as unknown as { cookie: string }).cookie;
      await carol.post("/api/auth/logout");
      const replay = new Client();
      (replay as unknown as { cookie: string }).cookie = savedCookie;
      expect((await replay.get("/api/documents")).status).toBe(401);
    });
  });
});
