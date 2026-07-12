import { Router } from "express";
import { prisma } from "../db.js";
import { postInclude, serializePost } from "../postSerializer.js";

export const postsRouter = Router();

// Streaming videos are a separate resource (see routes/videos.js) — a Post
// is only ever social or news.
const VALID_SECTIONS = ["social", "news"];
const PAGE_SIZE = 12;

// GET /api/posts?section=social&tag=Technology&q=budget&cursor=<postId>
// GET /api/posts?parentId=<postId>&cursor=<postId>       — a post's replies
// GET /api/posts?parentVideoId=<videoId>&cursor=<postId> — a video's replies
//
// A comment is just a Post with parentId/parentVideoId set (see the
// /:id/comment routes below) — reusing this same list endpoint to fetch
// them, oldest-first so a thread reads top-to-bottom, is the whole reason
// comments-as-posts pays off: no separate comment-fetching code needed.
// Replies are otherwise excluded from every normal section/tag/search
// listing so they don't clutter the feed as if they were top-level posts.
postsRouter.get("/", async (req, res) => {
  const { section, tag, q, cursor, parentId, parentVideoId } = req.query;
  const fetchingReplies = Boolean(parentId || parentVideoId);

  if (!fetchingReplies && (!section || !VALID_SECTIONS.includes(section))) {
    return res.status(400).json({ error: `section must be one of ${VALID_SECTIONS.join(", ")}` });
  }

  const where = fetchingReplies
    ? { parentId: parentId || null, parentVideoId: parentVideoId || null }
    : {
        section,
        parentId: null,
        parentVideoId: null,
        ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
        ...(q
          ? {
              OR: [
                { body: { contains: q } },
                { author: { name: { contains: q } } },
                { author: { handle: { contains: q } } },
              ],
            }
          : {}),
      };

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: fetchingReplies ? "asc" : "desc" },
    take: PAGE_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: postInclude(req.user.id),
  });

  const nextCursor = posts.length === PAGE_SIZE ? posts[posts.length - 1].id : null;

  res.json({
    posts: posts.map(serializePost),
    nextCursor,
  });
});

// GET /api/posts/:id  (permalink / detail view — same shape as list items)
postsRouter.get("/:id", async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: postInclude(req.user.id),
  });
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json(serializePost(post));
});

// POST /api/posts  — create a new (non-repost) post. A post can attach an
// image or a video as plain media (XOR) — no title, no special treatment;
// a video here renders exactly like an image would. The Streaming tab's
// titled, YouTube-style videos are a completely separate resource.
postsRouter.post("/", async (req, res) => {
  const { body = "", section, tags = [], imageUrl, videoUrl } = req.body;

  if (!VALID_SECTIONS.includes(section)) {
    return res.status(400).json({ error: `section must be one of ${VALID_SECTIONS.join(", ")}` });
  }
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 3) {
    return res.status(400).json({ error: "A post needs 1 to 3 tags" });
  }
  if (imageUrl && videoUrl) {
    return res.status(400).json({ error: "A post can have an image OR a video, not both" });
  }

  const tagRows = await Promise.all(
    tags.map((name) =>
      prisma.tag.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  const post = await prisma.post.create({
    data: {
      authorId: req.user.id,
      section,
      body,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      tags: { create: tagRows.map((t) => ({ tagId: t.id })) },
    },
    include: postInclude(req.user.id),
  });

  res.status(201).json(serializePost(post));
});

// POST /api/posts/:id/like  — toggle like for the current user
postsRouter.post("/:id/like", async (req, res) => {
  const postId = req.params.id;
  const existing = await prisma.like.findUnique({
    where: { userId_postId: { userId: req.user.id, postId } },
  });

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
  } else {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: "Post not found" });
    await prisma.like.create({ data: { userId: req.user.id, postId } });
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: postInclude(req.user.id),
  });
  res.json(serializePost(post));
});

// POST /api/posts/:id/repost  — wrap the given post in a new post authored
// by the current user. The original post is never modified. The original
// author gets a notification. Tags are copied from the original so the
// repost carries the same category pills; nested embeds don't repeat tags
// (that's handled purely in how the frontend renders `embed`, since the
// embedded post object still has its own `tags` array available if needed).
// A repost can carry its own comment and image/video, same XOR rule as a
// regular post — it just skips the tag picker. (Reposting a streaming
// video instead of a post is a different endpoint — see routes/videos.js.)
postsRouter.post("/:id/repost", async (req, res) => {
  const { body = "", imageUrl, videoUrl } = req.body;

  if (imageUrl && videoUrl) {
    return res.status(400).json({ error: "A post can have an image OR a video, not both" });
  }

  const original = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: { tags: { include: { tag: true } }, author: true },
  });
  if (!original) return res.status(404).json({ error: "Post not found" });

  const repost = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId: req.user.id,
        section: original.section,
        body,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null,
        repostOfId: original.id,
        tags: {
          create: original.tags.map((pt) => ({ tagId: pt.tagId })),
        },
      },
      include: postInclude(req.user.id),
    });

    if (original.authorId !== req.user.id) {
      await tx.notification.create({
        data: {
          type: "repost",
          recipientId: original.authorId,
          actorId: req.user.id,
          postId: original.id,
        },
      });
    }

    return created;
  });

  res.status(201).json(serializePost(repost));
});

// POST /api/posts/:id/comment  — body: { body }. A comment is a full Post
// under the hood (parentId set) — same author/likes/reposts/reply
// machinery as any other post, it just skips the normal tag requirement
// since a reply doesn't need its own category. Always section "social",
// even when replying to a News post — only social posts can be comments
// (matches the video-comment endpoint below, which is social-only too
// since videos have no section of their own).
// (Commenting on a streaming Video instead of a post is a different
// endpoint — see routes/videos.js.)
postsRouter.post("/:id/comment", async (req, res) => {
  const { body = "", imageUrl, videoUrl } = req.body;
  if (!body.trim() && !imageUrl && !videoUrl) {
    return res.status(400).json({ error: "A comment needs a body, an image, or a video" });
  }
  if (imageUrl && videoUrl) {
    return res.status(400).json({ error: "A comment can have an image OR a video, not both" });
  }

  const parent = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!parent) return res.status(404).json({ error: "Post not found" });

  const comment = await prisma.post.create({
    data: {
      authorId: req.user.id,
      section: "social",
      body: body.trim(),
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      parentId: parent.id,
    },
    include: postInclude(req.user.id),
  });

  res.status(201).json(serializePost(comment));
});
