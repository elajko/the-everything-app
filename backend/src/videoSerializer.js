// Streaming videos are a separate resource from Post — see schema.prisma.
// Two serializations: the full shape for the Streaming feed/detail page,
// and a compact "embed" shape used when a Post reposts a video (just enough
// to render the small watch-card, no likes/reposts of its own).

export function videoInclude(userId) {
  return {
    channel: true,
    tags: { include: { tag: true } },
    likes: { where: { userId } },
    _count: { select: { likes: true, repostedBy: true, replies: true } },
  };
}

export function serializeVideo(video) {
  if (!video) return null;
  return {
    id: video.id,
    videoTitle: video.videoTitle,
    description: video.description,
    thumbnail: video.thumbnailUrl || null,
    video: video.videoUrl,
    createdAt: video.createdAt,
    channel: {
      name: video.channel.name,
      handle: video.channel.handle,
      avatar: video.channel.avatarUrl,
    },
    tags: video.tags.map((vt) => vt.tag.name),
    likes: video._count.likes,
    reposts: video._count.repostedBy,
    replies: video._count.replies,
    liked: video.likes.length > 0,
  };
}

export const videoEmbedInclude = { channel: true };

export function serializeVideoEmbed(video) {
  if (!video) return null;
  return {
    id: video.id,
    videoTitle: video.videoTitle,
    thumbnail: video.thumbnailUrl || null,
    createdAt: video.createdAt,
    channel: {
      name: video.channel.name,
      handle: video.channel.handle,
      avatar: video.channel.avatarUrl,
    },
  };
}
