import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { postInclude, serializePost } from "../postSerializer.js";
import { videoInclude, serializeVideo } from "../videoSerializer.js";
import { processAvatarImage } from "../avatarImage.js";
import { uploadsDir } from "./uploads.js";
import { MAX_BIO_LENGTH } from "../constants.js";

export const usersRouter = Router();

function serializeUserProfile(user) {
  return {
    handle: user.handle,
    name: user.name,
    avatar: user.avatarUrl,
    banner: user.bannerUrl || null,
    bio: user.bio || null,
    verifiedNewsProvider: user.verifiedNewsProvider,
    links: user.links.map((l) => ({
      id: l.id,
      platform: l.platform || null,
      label: l.label,
      url: l.url,
      description: l.description || null,
    })),
  };
}

// GET /api/users/me — just enough for the frontend to know which seeded
// account it's "logged in" as (see currentUser.js — there's no real auth),
// so it can decide whether to show owner-only UI like the profile edit
// icon. Must be registered before GET /:handle, or "me" gets swallowed as
// a handle param.
usersRouter.get("/me", (req, res) => {
  res.json({ handle: req.user.handle });
});

// POST /api/users/me/avatar — body: { dataBase64 } (any image format sharp
// reads; the frontend always sends a JPEG canvas export from its crop UI,
// but this doesn't assume that). Every avatar, seeded or uploaded, goes
// through the same resize+convert pipeline (see avatarImage.js) — this is
// a separate, narrower path from the general /api/uploads route, which
// stores post images/videos untouched on purpose.
usersRouter.post("/me/avatar", async (req, res) => {
  const { dataBase64 } = req.body;
  if (!dataBase64) {
    return res.status(400).json({ error: "dataBase64 is required" });
  }

  let jpeg;
  try {
    jpeg = await processAvatarImage(Buffer.from(dataBase64, "base64"));
  } catch (e) {
    return res.status(400).json({ error: "Could not read that as an image" });
  }

  const name = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, name), jpeg);
  const avatarUrl = `${req.protocol}://${req.get("host")}/uploads/${name}`;

  await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } });
  res.json({ avatar: avatarUrl });
});

// PUT /api/users/me — body: { name, bio, links: [{platform,label,url,description}] }.
// Links are replaced wholesale (delete + recreate) rather than diffed —
// simpler, and the profile edit form always submits the full list anyway.
usersRouter.put("/me", async (req, res) => {
  const { name, bio, links } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (bio && bio.length > MAX_BIO_LENGTH) {
    return res.status(400).json({ error: `Bio must be ${MAX_BIO_LENGTH} characters or fewer` });
  }
  if (links && !Array.isArray(links)) {
    return res.status(400).json({ error: "links must be an array" });
  }
  for (const l of links || []) {
    if (!l.label || !l.label.trim() || !l.url || !l.url.trim()) {
      return res.status(400).json({ error: "Each link needs a label and a url" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: req.user.id },
      data: { name: name.trim(), bio: bio ? bio.trim() : null },
    });
    await tx.profileLink.deleteMany({ where: { userId: req.user.id } });
    if (links && links.length) {
      await tx.profileLink.createMany({
        data: links.map((l, i) => ({
          userId: req.user.id,
          platform: l.platform || null,
          label: l.label.trim(),
          url: l.url.trim(),
          description: l.description ? l.description.trim() : null,
          sortOrder: i,
        })),
      });
    }
  });

  const updated = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { links: { orderBy: { sortOrder: "asc" } } },
  });
  res.json(serializeUserProfile(updated));
});

// GET /api/users/:handle — profile page data. Posts are a separate
// endpoint — see GET /:handle/posts below.
usersRouter.get("/:handle", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { handle: req.params.handle },
    include: { links: { orderBy: { sortOrder: "asc" } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json(serializeUserProfile(user));
});

// GET /api/users/:handle/posts?types=social,news,video&tag=Food&q=dough&sort=likes&offset=0
//
// The profile's own search: filters across BOTH this user's Posts (social/
// news, including their reposts — those are just Posts with repostOfId
// set) and their streaming Videos, merged into one sorted, paginated list.
// `types` is any subset of social/news/video (default: all three).
//
// This merges two separate Prisma models in application code rather than
// a SQL UNION, then sorts/paginates with plain offset+limit instead of a
// cursor — a real cursor would need to encode "which table + which row"
// and compare across two independently-ordered result sets, which isn't
// worth the complexity for a single author's post history (always a small
// N). Each underlying query is capped at MAX_ITEMS_PER_TYPE as a sanity
// bound, not a real pagination mechanism.
const CONTENT_TYPES = ["social", "news", "video"];
const PAGE_SIZE = 12;
const MAX_ITEMS_PER_TYPE = 500;

usersRouter.get("/:handle/posts", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { handle: req.params.handle } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const { tag, q, sort } = req.query;
  const types = req.query.types
    ? req.query.types.split(",").filter((t) => CONTENT_TYPES.includes(t))
    : CONTENT_TYPES;
  const sortByLikes = sort === "likes";
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const postSections = types.filter((t) => t === "social" || t === "news");
  const wantVideos = types.includes("video");

  const [posts, videos] = await Promise.all([
    postSections.length
      ? prisma.post.findMany({
          where: {
            authorId: user.id,
            section: { in: postSections },
            // replies live under their parent's own page, not as top-level
            // items in a profile's post list — same exclusion as the main
            // feed listing in routes/posts.js
            parentId: null,
            parentVideoId: null,
            ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
            ...(q ? { body: { contains: q } } : {}),
          },
          take: MAX_ITEMS_PER_TYPE,
          include: postInclude(req.user.id),
        })
      : [],
    wantVideos
      ? prisma.video.findMany({
          where: {
            channelId: user.id,
            ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
            ...(q
              ? { OR: [{ videoTitle: { contains: q } }, { description: { contains: q } }] }
              : {}),
          },
          take: MAX_ITEMS_PER_TYPE,
          include: videoInclude(req.user.id),
        })
      : [],
  ]);

  const items = [
    ...posts.map((p) => ({ type: "post", ...serializePost(p) })),
    ...videos.map((v) => ({ type: "video", ...serializeVideo(v) })),
  ];

  items.sort((a, b) => {
    if (sortByLikes && b.likes !== a.likes) return b.likes - a.likes;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const page = items.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE < items.length ? offset + PAGE_SIZE : null;

  res.json({ items: page, nextOffset, total: items.length });
});
