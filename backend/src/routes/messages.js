import { Router } from "express";
import { prisma } from "../db.js";

export const messagesRouter = Router();

// GET /api/messages/conversations — one preview row per person the current
// user has ever exchanged messages with, newest activity first. There's no
// Conversation table (see schema.prisma) — this derives the list in
// application code from the flat Message rows, which is fine at this
// scale (a single user's DMs, not a message-search index).
messagesRouter.get("/conversations", async (req, res) => {
  const meId = req.user.id;

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: meId }, { recipientId: meId }] },
    orderBy: { createdAt: "desc" },
    include: { sender: true, recipient: true },
  });

  // messages is already newest-first, so the first row seen per counterparty
  // is that conversation's most recent message — and Map preserves
  // insertion order, so the values() below come out sorted for free.
  const byCounterparty = new Map();
  for (const m of messages) {
    const other = m.senderId === meId ? m.recipient : m.sender;
    if (!byCounterparty.has(other.id)) {
      byCounterparty.set(other.id, {
        user: { handle: other.handle, name: other.name, avatar: other.avatarUrl },
        lastMessage: { body: m.body, createdAt: m.createdAt, fromMe: m.senderId === meId },
        unreadCount: 0,
      });
    }
    if (m.recipientId === meId && !m.read) {
      byCounterparty.get(other.id).unreadCount += 1;
    }
  }

  res.json({ conversations: [...byCounterparty.values()] });
});

// GET /api/messages/:handle — full thread with one other user, oldest
// first. Opening a thread is also how messages get marked read, same as
// opening a chat app's conversation view — there's no separate "mark read"
// endpoint.
messagesRouter.get("/:handle", async (req, res) => {
  const other = await prisma.user.findUnique({ where: { handle: req.params.handle } });
  if (!other) return res.status(404).json({ error: "User not found" });

  const meId = req.user.id;
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: meId, recipientId: other.id },
        { senderId: other.id, recipientId: meId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: { senderId: other.id, recipientId: meId, read: false },
    data: { read: true },
  });

  res.json({
    user: { handle: other.handle, name: other.name, avatar: other.avatarUrl },
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      fromMe: m.senderId === meId,
    })),
  });
});

// POST /api/messages/:handle — send a message to that user.
messagesRouter.post("/:handle", async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: "Message body is required" });
  }

  const other = await prisma.user.findUnique({ where: { handle: req.params.handle } });
  if (!other) return res.status(404).json({ error: "User not found" });
  if (other.id === req.user.id) {
    return res.status(400).json({ error: "Can't message yourself" });
  }

  const message = await prisma.message.create({
    data: { senderId: req.user.id, recipientId: other.id, body: body.trim() },
  });

  res.status(201).json({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    fromMe: true,
  });
});
