import "dotenv/config";
import express from "express";
import cors from "cors";
import { attachCurrentUser } from "./currentUser.js";
import { postsRouter } from "./routes/posts.js";
import { videosRouter } from "./routes/videos.js";
import { tagsRouter } from "./routes/tags.js";
import { notificationsRouter } from "./routes/notifications.js";
import { uploadsRouter, uploadsDir } from "./routes/uploads.js";
import { usersRouter } from "./routes/users.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" })); // raised so base64 image/video uploads fit
app.use("/uploads", express.static(uploadsDir));
app.use(attachCurrentUser); // stands in for real auth — see currentUser.js

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/posts", postsRouter);
app.use("/api/videos", videosRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/users", usersRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Everything App API listening on http://localhost:${port}`);
});
