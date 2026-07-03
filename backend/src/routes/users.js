import { Router } from "express";
import { prisma } from "../db.js";
import { postInclude, serializePost } from "../postSerializer.js";
import { videoInclude, serializeVideo } from "../videoSerializer.js";

export const usersRouter = Router();

// GET /api/users/:handle — profile page data. Read-only for now: no edit
// endpoint until real auth exists to gate who can update what (see
// User.bio and ProfileLink in schema.prisma). Posts are a separate
// endpoint — see GET /:handle/posts below.
usersRouter.get("/:handle", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { handle: req.params.handle },
    include: { links: { orderBy: { sortOrder: "asc" } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
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
  });
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
