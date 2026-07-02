import { prisma } from "./db.js";

// PLACEHOLDER AUTH: there is no login yet. Every request is treated as
// coming from a single seeded user (see prisma/seed.js). Swap this out for
// real session/JWT auth later — every route below reads `req.user`, so
// that's the only place you'll need to change.
export async function attachCurrentUser(req, res, next) {
  const handle = process.env.CURRENT_USER_HANDLE || "you";
  const user = await prisma.user.findUnique({ where: { handle } });
  if (!user) {
    return res.status(500).json({
      error: `Seeded current user "@${handle}" not found. Did you run "npm run seed"?`,
    });
  }
  req.user = user;
  next();
}
