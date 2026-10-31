import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { all, get, ROOT, rules } from "./db.js";
import { attachUser, PERMISSIONS, sessionToken } from "./auth.js";
import { audit } from "./audit.js";
import { subscribe } from "./live.js";
import { CATALOGUE, national } from "./validate.js";
import { FIELDS } from "./fields.js";
import { seedAll } from "./seed.js";
import { institution } from "./routes/institution.js";
import { nationalRoutes } from "./routes/national.js";
import { DISCLOSABLE, publicRoutes, studentRoutes, verifierRoutes } from "./routes/people.js";
import { v1 } from "./routes/v1.js";

if (!get("SELECT 1 FROM institutions LIMIT 1")) {
  const r = seedAll();
  console.log(`Seeded sandbox data: ${r.institutions} institutions, ${r.students} records.`);
}
const t = Date.now();
national();
console.log(`Checks warmed in ${Date.now() - t} ms.`);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "25mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use("/api", attachUser);

// ---- Session

app.get("/api/accounts", (_req, res) => {
  res.json(all<any>(`SELECT u.id, u.name, u.title, u.role, i.name AS institution, v.name AS verifier FROM users u
    LEFT JOIN institutions i ON i.id = u.institution_id LEFT JOIN verifiers v ON v.id = u.verifier_id
    ORDER BY CASE u.role WHEN 'aicte' THEN 0 WHEN 'institution' THEN 1 WHEN 'verifier' THEN 2 ELSE 3 END`));
});

app.post("/api/session", (req, res) => {
  const u = get<any>("SELECT * FROM users WHERE id = ?", req.body.userId);
  if (!u) return res.status(404).json({ error: "No such account." });
  audit({ id: u.id, name: u.name, role: u.role, institution_id: u.institution_id }, "session.started", { entity: "user", entityId: u.id });
  res.json({ token: sessionToken(u.id), user: u });
});

app.get("/api/me", (req, res) => (req.user ? res.json(req.user) : res.status(401).json({ error: "Not signed in." })));

app.get("/api/meta", (_req, res) => res.json({ fields: FIELDS, catalogue: CATALOGUE, rules: rules(), permissions: PERMISSIONS, disclosable: DISCLOSABLE }));

app.get("/api/live", (req, res) => {
  if (!req.user) return res.status(401).end();
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  res.write(": connected\n\n");
  subscribe({ res, role: req.user.role, institutionId: req.user.institution_id, apaarId: req.user.apaar_id, verifierId: req.user.verifier_id });
});

app.use("/api/institutions", institution);
app.use("/api/national", nationalRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/verifier", verifierRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/v1", v1);

app.use("/api", (_req, res) => res.status(404).json({ error: "No such endpoint." }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. It's been logged." });
});

const dist = resolve(ROOT, "web/dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

const port = Number(process.env.API_PORT ?? 4100);
app.listen(port, () => console.log(`APAAR registry API on http://localhost:${port}`));
