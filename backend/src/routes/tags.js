import { Router } from "express";
import { prisma } from "../db.js";

export const tagsRouter = Router();

// GET /api/tags — full list of ~20 categories for the search dropdown
tagsRouter.get("/", async (req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  res.json(tags.map((t) => t.name));
});
