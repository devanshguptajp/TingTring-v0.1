import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";

const app = express();
const port = Number(process.env.PORT || 3000);
const webOrigin = process.env.WEB_ORIGIN || "*";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: webOrigin === "*" ? true : webOrigin.split(",").map((value) => value.trim()),
  credentials: webOrigin !== "*"
}));
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);
const supabaseAdmin = supabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "tingtring-talk-backend",
    status: "ok",
    version: "0.1.0",
    environment: process.env.NODE_ENV || "development",
    supabaseConfigured
  });
});

app.get("/api/v1", (_req, res) => {
  res.status(200).json({
    name: "TingTring Talk API",
    version: "v1",
    status: "online"
  });
});

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    database: "foundation-ready",
    supabaseConfigured
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`TingTring Talk backend listening on port ${port}`);
});