import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const uploadsRouter = Router();

// POST /api/uploads — body: { mimeType, dataBase64 }. There's no object
// storage yet (see README), so this just decodes the base64 payload the
// composer sends and writes it to backend/uploads/, served statically at
// /uploads/<name>. Swap for real object storage later without touching
// callers — they only care about the returned url.
uploadsRouter.post("/", (req, res) => {
  const { mimeType, dataBase64 } = req.body;
  const ext = EXT_BY_MIME[mimeType];
  if (!ext) {
    return res.status(400).json({ error: `Unsupported file type: ${mimeType}` });
  }
  if (!dataBase64) {
    return res.status(400).json({ error: "dataBase64 is required" });
  }

  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(dataBase64, "base64"));
  res.status(201).json({ url: `${req.protocol}://${req.get("host")}/uploads/${name}` });
});
