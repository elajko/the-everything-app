# The Everything App

A web platform that extends X's philosophy, acting as a news outlet, a
streaming service, a social media platform, an art hosting site, and more —
all of it organized under a concise, unified, fixed set of tags.

Three tabs (Social, News, Streaming) share one underlying Post model: posts
carry 1–3 category tags, an optional image *or* video, likes, and reposts. A
repost is its own post that embeds the original by reference — reposting
never modifies the original, but it does notify the original author. Embeds
can nest arbitrarily deep, forming threads. Streaming videos are a separate
model with their own titled, YouTube-style detail page — reposting one
embeds a compact "watch streaming video" card instead of a normal post
embed.

```
everything-app/
├── frontend/         static HTML/JS prototype (currently talks to no backend —
│                     see "Wiring the frontend to the API" below)
└── backend/          Node/Express API + Prisma/SQLite
```

## Quick start (Makefile)

```bash
make start   # builds (if needed) and runs backend + frontend, detached
make stop    # gracefully stops them — works from a different terminal too
make status  # is anything running right now?
make logs    # tail both server logs
```

`make start` doesn't hold your terminal — it backgrounds both processes and
returns immediately, saving their PIDs to `.run/*.pid` (gitignored). `make
stop` reads those PIDs to shut things down, so it works even from a
completely different terminal session than the one that started them. First
run also creates `backend/.env` from `.env.example` if it's missing.

The first `make start` in a fresh checkout still needs the database created —
run `make migrate` then `make seed` once before (or after) your first start.

Prefer to run things by hand, or want to know what the Makefile is actually
doing? See the manual steps below.

## Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:migrate   # creates dev.db and the schema
npm run seed              # populates users, tags, and sample posts
npm run dev                # http://localhost:4000
```

Check it's alive: `curl http://localhost:4000/api/health`

### Data model

- **User** — handle, name, avatar. No real auth yet (see below).
- **Post** — author, section (`social`/`news`/`streaming`), body, optional
  `imageUrl`, optional `videoUrl` + `videoTitle` (title is required
  whenever a video is set, enforced in `routes/posts.js`), and an optional
  `repostOfId` self-reference for reposts.
- **Tag** / **PostTag** — many-to-many, 1–3 tags per post enforced in the API.
- **Like** — one row per (user, post), unique constraint prevents double-likes.
- **Notification** — created whenever a post is reposted, sent to the
  original author.

See `backend/prisma/schema.prisma` for the full schema.

### API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/posts?section=&tag=&q=&cursor=` | Paginated feed for one section, optional single-tag filter + keyword search |
| GET | `/api/posts/:id` | Permalink / detail view — same shape as list items, used for both Social/News rows and Streaming cards |
| POST | `/api/posts` | Create a post. Body: `{ section, body, tags: string[1-3], imageUrl?, videoUrl?, videoTitle? }` |
| POST | `/api/posts/:id/like` | Toggle like for the current user |
| POST | `/api/posts/:id/repost` | Wrap a post in a new repost, copy its tags, notify the original author |
| GET | `/api/tags` | Full tag list for the search dropdown |
| GET | `/api/notifications` | Current user's notifications, newest first |
| POST | `/api/notifications/:id/read` | Mark one as read |

Every response for a post includes an `embed` field, which is either `null`
or another fully-serialized post — recursed up to 4 levels, matching however
deep the repost chain actually goes.

### About auth (important)

There's no real login system yet. Every request is treated as coming from a
single seeded user (`backend/src/currentUser.js`), configurable via
`CURRENT_USER_HANDLE` in `.env`. This was the fastest way to get a working
backend end-to-end; swapping in real auth (sessions or JWT) later only
requires changing that one file — every route already reads `req.user`.

### Wiring the frontend to the API

`frontend/index.html` right now still generates its own fake data client-side
(the original proof-of-concept). Pointing it at this API means replacing the
in-memory `posts` array and the seed-data generators with `fetch()` calls to
the endpoints above. That's the natural next step once the backend is
running and seeded.

## Planned, not started yet

The Streaming tab has a sub-tab row — **Vids / Livestreams / Shows/Movies /
Music** — but only **Vids** (the `Video` model) is actually built. The other
three render a "coming soon" placeholder; picking one hides the upload
composer and tag/search bar since there's nothing behind them yet.

These are on the roadmap for "The Everything App" but no work has begun on
them:

- **Livestreaming** — live broadcast, distinct from the uploaded-video
  support that already exists.
- **Shows/Movies**
- **Music streaming**
- **Instant messaging / calling / FaceTiming**

## Deploying later

Nothing here is cloud-specific yet. When you're ready:
1. Switch `datasource db { provider = "sqlite" }` to `"postgresql"` in
   `schema.prisma` and point `DATABASE_URL` at a real Postgres instance.
2. Add real authentication.
3. Move image/video uploads to object storage (S3/R2/etc.) instead of
   trusting arbitrary `imageUrl`/`videoUrl` strings.
