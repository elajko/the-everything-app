import { Router } from "express";
import { prisma } from "../db.js";

export const usersRouter = Router();

// GET /api/users/:handle — profile page data. Read-only for now: no edit
// endpoint until real auth exists to gate who can update what (see
// User.bio and ProfileLink in schema.prisma). Posts aren't included here
// yet either — the profile page reserves space for them but doesn't render
// any, per the frontend's current scope.
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
