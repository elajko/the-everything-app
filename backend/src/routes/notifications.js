import { Router } from "express";
import { prisma } from "../db.js";

export const notificationsRouter = Router();

// GET /api/notifications — everything for the current user, newest first
notificationsRouter.get("/", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { recipientId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      actor: true,
      post: { include: { author: true } },
    },
  });

  res.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt,
      actor: { name: n.actor.name, handle: n.actor.handle, avatar: n.actor.avatarUrl },
      post: { id: n.post.id, body: n.post.body },
    }))
  );
});

// POST /api/notifications/:id/read
notificationsRouter.post("/:id/read", async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.recipientId !== req.user.id) {
    return res.status(404).json({ error: "Notification not found" });
  }
  await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  res.json({ ok: true });
});
