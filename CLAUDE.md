# CLAUDE.md

This file is for Claude Code. It exists purely to hand off context from the
chat session where this project originated — the frontend prototype and
backend scaffold were built there, in a sandboxed environment with **no
network access**, so nothing here has actually been run end-to-end. Treat
the backend especially as "should work" rather than "verified working."

## What this project is

"The Everything App" — a Twitter-style feed with three tabs (Social, News,
Streaming) that all share one underlying post model instead of being
separate systems. Posts carry 1–3 tags from a fixed ~20-category list, an
optional image *or* video (not both), likes, and reposts. A repost is its
own post that embeds the original by reference and can itself be embedded,
forming arbitrarily deep threads — the original post is never modified, but
its author gets notified when someone reposts it.

## Current state

- `frontend/index.html` — a single self-contained HTML/CSS/JS file (no
  build step, no framework). **It is NOT wired to any backend.** It
  generates all its own mock data client-side and holds all state in memory
  in an IIFE. This is the single most important thing to fix next.
- `backend/` — Node/Express + Prisma/SQLite API that models the same
  feature set. Built to match the frontend's data shapes so wiring them
  together should mostly be a matter of replacing the frontend's in-memory
  arrays with `fetch()` calls. **Never actually installed or booted** —
  the sandbox had no network access, so only `node --check` syntax
  validation and manual review were done. Run `npm install` and the
  migrate/seed steps yourself as the real first test.

## Frontend: things that aren't obvious from reading the code

- **Search/tag filter**: there is no separate tag filter row. The search
  bar itself is a combobox — clicking it opens a dropdown of all tags;
  picking one drops a pill *inside* the search input (to the left of the
  cursor) and you can keep typing a keyword alongside it. Only **one tag**
  can be selected at a time (picking a new one replaces the old one).
  Backspace at the start of the input deletes the pill without needing to
  hit its × button. This was a deliberate, specific UX request — don't
  reintroduce a separate row of tag chips.
- **Reposts / embeds**: nested embedded posts do **not** show their own tag
  pills (only the outermost post shows tags — reposts copy the original's
  tags onto themselves) and do **not** show a "reposted by ___" label
  inside the embed (the avatar/handle/name in that embed's own header is
  considered sufficient — this was explicitly requested after an earlier
  version had both and it was called out as redundant).
- **Streaming section**: renders as a responsive grid of video cards
  (thumbnail + duration badge + channel avatar + title + tags) instead of
  the vertical list used by Social/News. Clicking a card opens the exact
  same shared post/detail page used everywhere else in the app — that
  page is where the actual `<video>` element with the required title
  renders. Cards and rows must keep opening the *same* detail view; don't
  fork into a separate "video player page."
- **Video posts specifically require a title** (`videoTitle`). This is the
  *only* field that's conditionally required, and only when `video` is
  set. Non-video posts have no such requirement.
- **Avatars**: every post currently uses one single placeholder image,
  stored **once** as a base64 `PLACEHOLDER_AVATAR` JS constant near the top
  of the script and referenced everywhere (not repeated inline). This was
  deliberate — a hosted URL provided by the user didn't render reliably
  (likely hotlink protection), so base64 embedding was chosen specifically
  for reliability, with the explicit constraint of storing the data once
  and referencing it, not duplicating the string per author.
- **Streaming video source**: all streaming posts currently point at one
  hardcoded sample video URL (`VIDEO_SRC` constant) —
  `http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4`.
  Swap this out once real video hosting/upload exists.
- **Dark mode**: toggled via a gear/settings icon in the top bar. Theme is
  applied as a `data-theme` attribute on `<html>` (not on an inner div —
  an earlier version scoped it too narrowly and had light-mode leaks in
  the header/hover states; keep it on `<html>` with `--paper`/`--surface`/etc.
  CSS variables cascading from there). Accent color is a bold blue
  (`#2954FF` light / `#6690FF` dark).
- Infinite scroll uses an `IntersectionObserver` on a sentinel element per
  section and generates more mock posts as needed — this generation logic
  is exactly what should be replaced by cursor-paginated `fetch()` calls
  to `GET /api/posts`.

## Backend: things that aren't obvious from reading the code

- **No real authentication exists.** `backend/src/currentUser.js` is a
  middleware that resolves a single hardcoded seeded user (configurable via
  `CURRENT_USER_HANDLE` in `.env`) and attaches it as `req.user` on every
  request. Every route reads `req.user` rather than anything session-based.
  This was a deliberate shortcut to get a working backend end-to-end
  quickly — real auth should be a drop-in replacement for just this one
  file, not a refactor of the routes.
- **Database is SQLite via Prisma, on purpose**, chosen for zero local
  setup. The schema is written to be portable — switching
  `backend/prisma/schema.prisma`'s `datasource` provider to `"postgresql"`
  and pointing `DATABASE_URL` at a real instance should be close to a
  one-line change when it's time to deploy. Don't assume SQLite is a
  permanent choice.
- **Repost/embed serialization** (`src/postSerializer.js`) recursively
  builds a Prisma `include` for the `repostOf` self-relation up to 4 levels
  deep, and a matching recursive JSON serializer. If the frontend ever
  needs deeper thread nesting, raise `MAX_EMBED_DEPTH` there.
- **Repost tags are copied onto the new repost row** at creation time
  (see `POST /api/posts/:id/repost` in `src/routes/posts.js`) — this
  matches the frontend's assumption that a repost's own tags mirror the
  original's, rather than the frontend re-deriving them from the embed at
  render time.
- Search (`q` param on `GET /api/posts`) uses Prisma's `contains`, which
  on SQLite is case-sensitive (no `mode: "insensitive"` support like
  Postgres has). Worth revisiting once/if this moves to Postgres.
- Validation currently lives inline in the route handlers
  (`routes/posts.js`) — 1–3 tags required, image XOR video, video requires
  a title. If this grows, consider pulling it into a shared validator
  rather than duplicating rules between the create-post and repost routes.

## Suggested next steps, roughly in order

1. **Get the backend actually running** — `npm install`, `npm run
   prisma:migrate`, `npm run seed`, `npm run dev`, hit `/api/health`. This
   has never been tested against a real npm registry / SQLite engine.
2. **Wire `frontend/index.html` to the API.** Replace the in-memory mock
   generators (`newPostFor`, the seed arrays, `generateMorePosts`, etc.)
   with `fetch()` calls to `GET /api/posts`, keeping the same rendering
   functions (`renderPost`, `renderCard`, `renderEmbed`) — they already
   expect the exact JSON shape `postSerializer.js` produces.
3. **Wire up like/repost buttons** to `POST /api/posts/:id/like` and
   `POST /api/posts/:id/repost` instead of mutating local JS objects.
4. **Add real auth**, replacing `currentUser.js`.
5. **Add real image/video upload** (object storage) instead of trusting
   arbitrary URL strings in `imageUrl`/`videoUrl`.
