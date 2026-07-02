// Populates the local SQLite DB with the same flavor of data used in the
// frontend prototype: a handful of users, the ~20 tag categories, a spread
// of social/news posts — including a repost thread so you can see the embed
// chain working end to end — and a couple of streaming videos, one of which
// is reposted into the social feed so you can see the video-embed card too.
//
// Run with: npm run seed

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const AVATAR =
  "https://i.pinimg.com/736x/e8/39/ee/e839eecefc3b1541928af356b1b83e70.jpg"; // swap for your own hosted image

const TAGS = [
  "Food", "Politics", "Media", "Celebrity", "Adult", "Technology", "Gaming",
  "Art", "Sports", "Music", "Science", "Business", "Finance", "Travel",
  "Fashion", "Health", "Movies", "Books", "Nature", "Comedy",
];

const USERS = [
  { handle: "you", name: "You" },
  { handle: "marencole", name: "Maren Cole" },
  { handle: "dok_writes", name: "D. Okafor" },
  { handle: "priyanotes", name: "Priya N." },
  { handle: "jweir", name: "Jonas Weir" },
  { handle: "harborwire", name: "Harbor Wire" },
  { handle: "latekitchen", name: "Late Kitchen" },
  { handle: "overclocked", name: "Overclocked" },
];

const VIDEO_SRC =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

async function main() {
  console.log("Seeding…");

  const tagRows = {};
  for (const name of TAGS) {
    tagRows[name] = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const userRows = {};
  for (const u of USERS) {
    userRows[u.handle] = await prisma.user.upsert({
      where: { handle: u.handle },
      update: {},
      create: { ...u, avatarUrl: AVATAR },
    });
  }

  async function createPost({ author, section, body, tags, imageUrl, videoUrl }) {
    return prisma.post.create({
      data: {
        authorId: userRows[author].id,
        section,
        body,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null,
        tags: { create: tags.map((name) => ({ tagId: tagRows[name].id })) },
      },
    });
  }

  async function createVideo({ channel, videoTitle, description, thumbnailUrl, tags }) {
    return prisma.video.create({
      data: {
        channelId: userRows[channel].id,
        videoUrl: VIDEO_SRC,
        videoTitle,
        thumbnailUrl,
        description,
        tags: { create: tags.map((name) => ({ tagId: tagRows[name].id })) },
      },
    });
  }

  const bakery = await createPost({
    author: "marencole",
    section: "social",
    body: "Finally nailed a laminated dough recipe after four failed attempts.",
    tags: ["Food"],
  });

  await createPost({
    author: "harborwire",
    section: "news",
    body: "City council approves the revised waterfront zoning plan by a 5-2 vote.",
    tags: ["Politics", "Business"],
  });

  const dumplingVideo = await createVideo({
    channel: "latekitchen",
    videoTitle: "Rebuilding a 40 year old dumpling recipe from a single index card",
    description: "New upload, full video above.",
    thumbnailUrl: "https://picsum.photos/seed/food1/640/360",
    tags: ["Food"],
  });

  await createVideo({
    channel: "overclocked",
    videoTitle: "We overclocked this budget GPU until it caught up to a card twice the price",
    description: "Full breakdown of the thermal and voltage tuning in the video above.",
    thumbnailUrl: "https://picsum.photos/seed/tech1/640/360",
    tags: ["Technology"],
  });

  // A repost thread: dok_writes reposts Maren's bakery post.
  const repost = await prisma.post.create({
    data: {
      authorId: userRows["dok_writes"].id,
      section: "social",
      body: "This is worth a read, saving it here.",
      repostOfId: bakery.id,
      tags: { create: [{ tagId: tagRows["Food"].id }] }, // copied from the original
    },
  });
  await prisma.notification.create({
    data: {
      type: "repost",
      recipientId: userRows["marencole"].id,
      actorId: userRows["dok_writes"].id,
      postId: bakery.id,
    },
  });

  // priyanotes reposts dok_writes's repost — two levels of embedding.
  await prisma.post.create({
    data: {
      authorId: userRows["priyanotes"].id,
      section: "social",
      body: "Whole thread is worth following.",
      repostOfId: repost.id,
      tags: { create: [{ tagId: tagRows["Food"].id }] },
    },
  });
  await prisma.notification.create({
    data: {
      type: "repost",
      recipientId: userRows["dok_writes"].id,
      actorId: userRows["priyanotes"].id,
      postId: repost.id,
    },
  });

  // jweir reposts the dumpling video — shows the compact video-embed card
  // (distinct from a post-to-post repost embed) in the social feed.
  await prisma.post.create({
    data: {
      authorId: userRows["jweir"].id,
      section: "social",
      body: "This looks so much better than my attempts.",
      repostOfVideoId: dumplingVideo.id,
      tags: { create: [{ tagId: tagRows["Food"].id }] },
    },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
