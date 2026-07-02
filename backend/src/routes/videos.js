import { Router } from "express";
import { prisma } from "../db.js";
import { videoInclude, serializeVideo } from "../videoSerializer.js";
import { postInclude, serializePost } from "../postSerializer.js";

export const videosRouter = Router();

const PAGE_SIZE = 12;

// GET /api/videos?tag=Technology&q=budget&cursor=<videoId>
// No `section` param — the Streaming tab is the only place videos live.
videosRouter.get("/", async (req, res) => {
  const { tag, q, cursor } = req.query;

  const where = {
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
    ...(q
      ? {
          OR: [
            { videoTitle: { contains: q } },
            { description: { contains: q } },
            { channel: { name: { contains: q } } },
            { channel: { handle: { contains: q } } },
          ],
        }
      : {}),
  };

  const videos = await prisma.video.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: videoInclude(req.user.id),
  });

  const nextCursor = videos.length === PAGE_SIZE ? videos[videos.length - 1].id : null;

  res.json({
    videos: videos.map(serializeVideo),
    nextCursor,
  });
});

// GET /api/videos/:id  (permalink / detail view)
videosRouter.get("/:id", async (req, res) => {
  const video = await prisma.video.findUnique({
    where: { id: req.params.id },
    include: videoInclude(req.user.id),
  });
  if (!video) return res.status(404).json({ error: "Video not found" });
  res.json(serializeVideo(video));
});

// POST /api/videos  — upload a new streaming video. Unlike a post's
// optional media, videoUrl and videoTitle are both required here.
videosRouter.post("/", async (req, res) => {
  const { videoUrl, videoTitle, thumbnailUrl, description = "", tags = [] } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: "videoUrl is required" });
  }
  if (!videoTitle || !videoTitle.trim()) {
    return res.status(400).json({ error: "videoTitle is required" });
  }
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 3) {
    return res.status(400).json({ error: "A video needs 1 to 3 tags" });
  }

  const tagRows = await Promise.all(
    tags.map((name) =>
      prisma.tag.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  const video = await prisma.video.create({
    data: {
      channelId: req.user.id,
      videoUrl,
      videoTitle,
      thumbnailUrl: thumbnailUrl || null,
      description,
      tags: { create: tagRows.map((t) => ({ tagId: t.id })) },
    },
    include: videoInclude(req.user.id),
  });

  res.status(201).json(serializeVideo(video));
});

// POST /api/videos/:id/like  — toggle like for the current user
videosRouter.post("/:id/like", async (req, res) => {
  const videoId = req.params.id;
  const existing = await prisma.videoLike.findUnique({
    where: { userId_videoId: { userId: req.user.id, videoId } },
  });

  if (existing) {
    await prisma.videoLike.delete({ where: { id: existing.id } });
  } else {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) return res.status(404).json({ error: "Video not found" });
    await prisma.videoLike.create({ data: { userId: req.user.id, videoId } });
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: videoInclude(req.user.id),
  });
  res.json(serializeVideo(video));
});

// POST /api/videos/:id/repost  — wrap a video in a new post (always social,
// since Streaming has no repost-target section of its own). No tags to
// copy — the frontend renders this post's embedVideo as a compact "watch
// streaming video" card instead of a normal post embed.
videosRouter.post("/:id/repost", async (req, res) => {
  const { body = "", imageUrl, videoUrl } = req.body;

  if (imageUrl && videoUrl) {
    return res.status(400).json({ error: "A post can have an image OR a video, not both" });
  }

  const original = await prisma.video.findUnique({
    where: { id: req.params.id },
    include: { tags: { include: { tag: true } } },
  });
  if (!original) return res.status(404).json({ error: "Video not found" });

  const repost = await prisma.post.create({
    data: {
      authorId: req.user.id,
      section: "social",
      body,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      repostOfVideoId: original.id,
      tags: {
        create: original.tags.map((vt) => ({ tagId: vt.tagId })),
      },
    },
    include: postInclude(req.user.id),
  });

  res.status(201).json(serializePost(repost));
});
