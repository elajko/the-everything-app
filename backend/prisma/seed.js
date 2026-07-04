// Populates the local SQLite DB with the same flavor of data used in the
// frontend prototype: a handful of users, the ~20 tag categories, a spread
// of social/news posts — including a repost thread so you can see the embed
// chain working end to end — and a couple of streaming videos, one of which
// is reposted into the social feed so you can see the video-embed card too.
//
// Run with: npm run seed

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { MAX_BIO_LENGTH } from "../src/constants.js";
import { processAvatarImage } from "../src/avatarImage.js";
import { uploadsDir } from "../src/routes/uploads.js";
const prisma = new PrismaClient();

// seed.js has no incoming request to read a host from (unlike the avatar
// upload route), so this assumes local dev — matches how the rest of the
// backend's README/Makefile setup already assumes localhost.
const LOCAL_BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

// Downloads a source image (e.g. the nekos.best URLs below) and runs it
// through the exact same resize/crop/convert-to-JPEG pipeline a real
// avatar upload goes through (see avatarImage.js), so seeded avatars are
// stored the same way — self-hosted, square, JPEG — as anything a user
// uploads later, rather than just linking out to wherever the demo image
// happened to come from.
async function seedAvatarFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch avatar source ${url}: ${res.status}`);
  const inputBuffer = Buffer.from(await res.arrayBuffer());
  const jpeg = await processAvatarImage(inputBuffer);
  const name = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, name), jpeg);
  return `${LOCAL_BASE_URL}/uploads/${name}`;
}

const TAGS = [
  "Food", "Politics", "Media", "Celebrity", "Adult", "Technology", "Gaming",
  "Art", "Sports", "Music", "Science", "Business", "Finance", "Travel",
  "Fashion", "Health", "Movies", "Books", "Nature", "Comedy",
];

// Wide header images shown above the hero on each profile page — real
// Unsplash photos picked to loosely match each account's theme, thrown in
// mostly for visual variety in the demo data (not user-uploaded).
const UNSPLASH = (id) =>
  `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;

// Avatar sources — anime character art, one fixed image per seeded user
// (except priyanotes, deliberately), fetched from nekos.best and run
// through seedAvatarFromUrl() below before being stored. Each URL is a
// specific image id, not the random-each-request endpoint, so it's the
// same picture on every reseed.
const AVATAR_SOURCES = {
  you: "https://nekos.best/api/v2/waifu/7cdaf516-5718-46ca-9856-7feae74e18b6.png",
  marencole: "https://nekos.best/api/v2/waifu/e33158c6-a177-4e69-ac0e-9f6b0bf0dbd4.png",
  dok_writes: "https://nekos.best/api/v2/waifu/6b8a9ef1-a43e-47f0-9023-f11bd096484f.png",
  jweir: "https://nekos.best/api/v2/waifu/58bac9cd-feaa-49d0-ba82-755f4eb8e10b.png",
  harborwire: "https://nekos.best/api/v2/waifu/624666a9-4d85-47e9-aeb2-bd46e87257f7.png",
  latekitchen: "https://nekos.best/api/v2/waifu/f138051f-bb7b-4cfb-bfc2-98606aad1265.png",
  overclocked: "https://nekos.best/api/v2/waifu/a8c671d8-f9ea-402c-ad48-cebb48ecda51.png",
  // priyanotes deliberately has no entry — the one seeded account with no
  // picture, to test the default silhouette fallback
};

const USERS = [
  {
    handle: "you",
    name: "You",
    bio: "Just poking around every corner of this app — the news, the streams, the socials. If you're reading this, hi. I probably reposted something you made at some point.",
    bannerUrl: UNSPLASH("1519681393784-d120267933ba"), // starfield/galaxy
  },
  {
    handle: "marencole",
    name: "Maren Cole",
    bio: "Home baker chasing the perfect crumb. I measure in grams, not cups, and will absolutely talk your ear off about hydration percentages if you let me. Currently obsessed with laminated dough.",
    bannerUrl: UNSPLASH("1509440159596-0249088772ff"), // fresh bread
  },
  {
    handle: "dok_writes",
    name: "D. Okafor",
    bio: "I read things so you don't have to, then repost them anyway so you do it yourself. Mostly nonfiction, the occasional deep-dive thread, and whatever my group chat is arguing about that week.",
    bannerUrl: UNSPLASH("1495446815901-a7297e633e8d"), // library shelves
  },
  {
    handle: "priyanotes",
    name: "Priya N.",
    bio: "Professional thread-follower. I save the good stuff so it doesn't disappear into the feed — recipes, receipts, receipts about recipes. Ask me about my bookmarks folder. Actually, don't.",
    bannerUrl: UNSPLASH("1517971053567-8bde93bc6a58"), // notebook/desk
  },
  {
    handle: "jweir",
    name: "Jonas Weir",
    bio: "Here for the videos mostly. I will absolutely repost something before finishing it, then feel guilty about it later. Currently trying (and failing) to replicate a dumpling recipe from a video.",
    bannerUrl: UNSPLASH("1496116218417-1a781b1c416c"), // dumplings
  },
  {
    handle: "harborwire",
    name: "Harbor Wire",
    bio: "City council, zoning fights, school board meetings nobody else shows up to — we're there, we're taking notes, and we're not exaggerating the headline just to get clicks.",
    verifiedNewsProvider: true, // the only seeded account that gets the "Verified news provider" badge
    bannerUrl: UNSPLASH("1477959858617-67f85cf4f1df"), // city skyline
  },
  {
    handle: "latekitchen",
    name: "Late Kitchen",
    bio: "Recipes that take longer than they should, on purpose. New upload most Sundays. I will not be doing a 5-minute version of anything — if a dish takes three days, you're getting all three.",
    bannerUrl: UNSPLASH("1556910103-1c02745aae4d"), // kitchen
  },
  {
    handle: "overclocked",
    name: "Overclocked",
    bio: "Benchmarks, teardowns, and the occasional very bad idea involving liquid nitrogen. If a part has a rated limit, my job is finding out what happens past it. Warranty voided so you don't have to.",
    bannerUrl: UNSPLASH("1591799264318-7e6ef8ddb7ea"), // PC hardware
  },
];

for (const u of USERS) {
  if (u.bio && u.bio.length > MAX_BIO_LENGTH) {
    throw new Error(
      `Seed bio for @${u.handle} is ${u.bio.length} chars, over MAX_BIO_LENGTH (${MAX_BIO_LENGTH})`
    );
  }
}

// Demo external links — grid of Patreon/Twitch/YouTube/etc on the profile
// page. `platform` picks the icon on the frontend; unset/unrecognized
// falls back to a generic link icon.
const PROFILE_LINKS = {
  latekitchen: [
    { platform: "youtube", label: "YouTube", url: "https://youtube.com/@latekitchen", description: "Full recipe videos, weekly." },
    { platform: "twitch", label: "Twitch", url: "https://twitch.tv/latekitchen", description: "Watch my livestreams!" },
    { platform: "patreon", label: "Patreon", url: "https://patreon.com/latekitchen", description: "Early access + recipe cards." },
  ],
  overclocked: [
    { platform: "youtube", label: "YouTube", url: "https://youtube.com/@overclocked", description: "Full teardown videos." },
    { platform: "twitch", label: "Twitch", url: "https://twitch.tv/overclocked", description: "Live benchmarking sessions." },
    { platform: null, label: "Overclocked.gg", url: "https://overclocked.gg", description: "Build logs and part lists." },
  ],
  // real URLs (not made-up domains), spread one-per-user across a few
  // existing accounts that otherwise have no links — tests the single-card
  // grid layout and each platform icon individually rather than only ever
  // seeing a full 3-link grid
  marencole: [
    { platform: "twitch", label: "Twitch", url: "https://www.twitch.tv/jawsh", description: "Occasional livestreams." },
  ],
  dok_writes: [
    { platform: "twitter", label: "X", url: "https://x.com/Its_Jawsh", description: "Where I actually post." },
  ],
  jweir: [
    { platform: "youtube", label: "YouTube", url: "https://www.youtube.com/channel/UCBWmg1cthYintSipSYxb-sw", description: "Video uploads." },
  ],
};

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

  // findUnique+create (not upsert) so a reseed of an already-populated DB
  // doesn't re-fetch/re-process every avatar for no reason — unlike the
  // rest of this seed data, avatars now cost a real network fetch + sharp
  // pass, not just a cheap DB write.
  const userRows = {};
  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { handle: u.handle } });
    if (existing) {
      userRows[u.handle] = existing;
      continue;
    }
    const avatarUrl = AVATAR_SOURCES[u.handle]
      ? await seedAvatarFromUrl(AVATAR_SOURCES[u.handle])
      : null;
    userRows[u.handle] = await prisma.user.create({ data: { ...u, avatarUrl } });
  }

  for (const [handle, links] of Object.entries(PROFILE_LINKS)) {
    for (const [i, link] of links.entries()) {
      await prisma.profileLink.create({
        data: { ...link, userId: userRows[handle].id, sortOrder: i },
      });
    }
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

  // Private messages — a few DM threads with "you" so the sidebar's
  // conversation previews and the messages page have real data. Each
  // create() runs sequentially, so createdAt ordering (and thus which
  // message shows as "most recent") falls out naturally.
  async function sendMessage(from, to, body) {
    return prisma.message.create({
      data: { senderId: userRows[from].id, recipientId: userRows[to].id, body },
    });
  }

  await sendMessage("you", "marencole", "hey! that laminated dough post looked incredible");
  await sendMessage("marencole", "you", "thank you!! took me like 6 tries to get the lamination right");
  await sendMessage("you", "marencole", "worth it though, the layers are unreal");
  await sendMessage(
    "marencole",
    "you",
    "honestly the trick was keeping the butter block cold the whole time, I kept losing it in warm kitchens"
  );
  await sendMessage("marencole", "you", "anyway lmk if you want the full recipe, happy to send it over");

  await sendMessage("you", "jweir", "did you ever get that dumpling recipe working");
  await sendMessage("jweir", "you", "not even close lol, mine fell apart in the pot");
  await prisma.message.updateMany({
    where: { senderId: userRows["jweir"].id, recipientId: userRows["you"].id },
    data: { read: true },
  });

  await sendMessage("harborwire", "you", "thanks for reading, let me know if you ever want to talk to the desk about a tip");

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
