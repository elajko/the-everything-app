// Builds a Prisma `include` clause that follows the repost chain (embed of
// an embed of an embed...) down to `depth` levels, and a matching
// serializer that turns the raw Prisma rows into the JSON shape the
// frontend already expects (see the `post` objects in the HTML prototype).

import { videoEmbedInclude, serializeVideoEmbed } from "./videoSerializer.js";

const MAX_EMBED_DEPTH = 4;

export function postInclude(userId, depth = MAX_EMBED_DEPTH) {
  if (depth <= 0) return undefined;
  return {
    author: true,
    tags: { include: { tag: true } },
    likes: { where: { userId } }, // just to check if *this* user liked it
    _count: { select: { likes: true, repostedBy: true, replies: true } },
    repostOf: { include: postInclude(userId, depth - 1) },
    repostOfVideo: { include: videoEmbedInclude },
    // the single post/video this one is a reply to, if any — same one
    // level of context X shows above a reply, not the whole thread chain
    parent: { include: postInclude(userId, depth - 1) },
    parentVideo: { include: videoEmbedInclude },
  };
}

export function serializePost(post) {
  if (!post) return null;
  return {
    id: post.id,
    section: post.section,
    createdAt: post.createdAt,
    body: post.body,
    image: post.imageUrl || null,
    video: post.videoUrl || null,
    author: {
      name: post.author.name,
      handle: post.author.handle,
      avatar: post.author.avatarUrl,
    },
    tags: post.tags.map((pt) => pt.tag.name),
    likes: post._count.likes,
    reposts: post._count.repostedBy,
    replies: post._count.replies,
    liked: post.likes.length > 0,
    // a post embeds either another post (repost of a post) or a video
    // (repost of a streaming video) — never both
    embed: post.repostOf ? serializePost(post.repostOf) : null,
    embedVideo: post.repostOfVideo ? serializeVideoEmbed(post.repostOfVideo) : null,
    // a comment is a post with parent/parentVideo set — the thing it's
    // replying to, shown above it on its own detail page
    parent: post.parent ? serializePost(post.parent) : null,
    parentVideo: post.parentVideo ? serializeVideoEmbed(post.parentVideo) : null,
  };
}
