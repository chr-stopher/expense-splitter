import express from "express";
// import type { Expense } from "@expense-splitter/shared"; Test 1
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./lib/prisma";
import cookieParser from "cookie-parser";
import { requireAuth } from "./middleware/auth";
import { computeBalances, computeSettlements } from "@expense-splitter/shared";
import cors from "cors";

const app = express();
app.use(
    cors({
        origin: "http://localhost:3000",
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser()); // cookie-parser middleware


app.get("/health", (_req, res) => {
    res.json({status: "ok"});
});

// Middleware route verification
app.get("/me", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        venmoHandle: true,
        cashappTag: true,
        zellePhone: true,
        acceptsCash: true,
      },
    });
    res.json({ user });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Signup validation
const signup = z.object({
    email: z.email(),
    name: z.string().min(1, "Name is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

// Login
app.post("/auth/signup", async (req, res) => {
    // 1: Validate body
    const parsed = signup.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Invalid input",
            fieldErrors: z.flattenError(parsed.error).fieldErrors,
        });
        return;
    }
    const { email, name, password } = parsed.data;

    try {
        // 2: If user email is in use
        const exists = await prisma.user.findUnique({ where: { email }});
        if (exists) {
            res.status(409).json({ error: "Email already in use"});
            return;
        }

        // 3: Hash user password (cost-12)
        const passwordHash = await bcrypt.hash(password, 12);

        // 4: Create User
        const user = await prisma.user.create({
            data: { email, name, passwordHash },
        });

        // 5: Return safe fields
        res.status(201).json({ id: user.id, email: user.email, name: user.name });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Logout
app.post("/auth/logout", requireAuth, async (req, res) => {
    const sessionId = req.cookies.sessionId;

    try {
        // 1: Delete this session row from the database
        await prisma.session.delete({ where: { id: sessionId } });

        // 2: Clear the cookie
        res.clearCookie("sessionId");

        res.json({ message: "Logged out" });
    } catch (err) {
        console.error("Logout error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1, "Password is required"),
});

app.post("/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Invalid input",
            fieldErrors: z.flattenError(parsed.error).fieldErrors,
        });
        return;
    }
    const { email, password } = parsed.data;

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        // Generate generic invalid response to email or password
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        // Create 7-day valid session
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
        const session = await prisma.session.create({
            data: { userId: user.id, expiresAt },
        });

        // Give browser httpOnly cookie with session id
        res.cookie("sessionId", session.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            expires: expiresAt,
        });

        res.json({ id: user.id, email: user.email, name: user.name });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Create Groups
const createGroupSchema = z.object({
    name: z.string().min(1, "Group name is required"),
});

app.post("/groups", requireAuth, async (req, res) => {
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Invalid input",
            fieldErrors: z.flattenError(parsed.error).fieldErrors,
        });
        return;
    }
    const { name } = parsed.data;
    const userId = req.user!.id;

    try {
        // Atomically create group and creator membership together
        const group = await prisma.$transaction(async (tx) => {
            const newGroup = await tx.group.create({
                data: { name, createdById: userId },
            });

            await tx.membership.create({
                data: { userId, groupId: newGroup.id, role: "owner" },
            });

            return newGroup;
        });

        res.status(201).json(group);
    } catch (err) {
        console.error("Create group error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Find out what group a user is in
app.get("/groups", requireAuth, async (req, res) => {
    const userId = req.user!.id;

    try {
        const memberships = await prisma.membership.findMany({
            where: { userId },
            include: { group: true },
        });

        // Return the groups themselves, not the membership
        const groups = memberships.map((m) => m.group);
        res.json(groups);
    } catch (err) {
        console.error("List groups error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Join group by code (Rather than using cuid link)
const joinByCodeSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

app.post("/groups/join", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const parsed = joinByCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    });
    return;
  }
  const { inviteCode } = parsed.data;

  try {
    // Find the group this code belongs to
    const group = await prisma.group.findUnique({ where: { inviteCode } });
    if (!group) {
      res.status(404).json({ error: "Invalid invite code" });
      return;
    }

    // Already a member? Don't create a duplicate
    const existing = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId: group.id } },
    });
    if (existing) {
      res.status(409).json({ error: "You are already a member of this group" });
      return;
    }

    const membership = await prisma.membership.create({
      data: { userId, groupId: group.id, role: "member" },
    });

    res.status(201).json({ membership, group });
  } catch (err) {
    console.error("Join by code error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Fetch a single group for the invite code to work
app.get("/groups/:groupId", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  try {
    // Authorization: only members can view the group
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    res.json(group);
  } catch (err) {
    console.error("Get group error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Create expenses
import { splitEqually } from "@expense-splitter/shared";

const createExpenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amountCents: z.number().int().positive("Amount must be a positive number of cents"),
});

app.post("/groups/:groupId/expenses", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    });
    return;
  }
  const { description, amountCents } = parsed.data;

  try {
    // Authorization: you must be a member of this group to log an expense
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    // Who shares the cost: every current member of the group
    const members = await prisma.membership.findMany({ where: { groupId } });
    const shares = splitEqually(amountCents, members.length);

    // Create the expense and all its splits atomically
    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: { groupId, paidById: userId, description, amountCents },
      });

      await tx.expenseSplit.createMany({
        data: members.map((m, i) => ({
          expenseId: newExpense.id,
          userId: m.userId,
          amountCents: shares[i],
        })),
      });

      return tx.expense.findUnique({
        where: { id: newExpense.id },
        include: { splits: true },
      });
    });

    res.status(201).json(expense);
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// List expenses

app.get("/groups/:groupId/expenses", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { groupId } = req.params;

    if (typeof groupId !== "string") {
        res.status(400).json({ error: "Invalid group id" });
        return;
    }

    try {
        // Auth: only members can view the group expenses
        const membership = await prisma.membership.findUnique({
            where: { userId_groupId: { userId, groupId } },
        });
        if (!membership) {
            res.status(403).json({ error: "You are not a member of this group" });
            return;
        }

        const expenses = await prisma.expense.findMany({
            where: { groupId },
            include: {
                splits: true,
                paidBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        res.json(expenses);
    } catch (err) {
        console.error("List expenses error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Computing expenses

app.get("/groups/:groupId/balances", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  try {
    // Authorization: only members can view balances
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    // Load every expense with its splits
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
    });

    const payments = await prisma.payment.findMany({ where: { groupId, status: "confirmed" } });

    // Shape the DB rows into the inputs our pure functions expect
    const expenseInputs = expenses.map((e) => ({
      paidByUserId: e.paidById,
      splits: e.splits.map((s) => ({
        userId: s.userId,
        amountCents: s.amountCents,
      })),
    }));

    // Payment modeled as: payer "paid" the amount, and the recipient "owes" it
    const paymentInputs = payments.map((p) => ({
        paidByUserId: p.fromUserId,
        splits: [{ userId: p.toUserId, amountCents: p.amountCents }],
    }));

    const balances = computeBalances([...expenseInputs, ...paymentInputs]);
    const settlements = computeSettlements(balances);

    res.json({ balances, settlements });
  } catch (err) {
    console.error("Compute balances error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// List group members in a group
app.get("/groups/:groupId/members", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  try {
    // Authorization: only members can view the roster
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    const memberships = await prisma.membership.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            venmoHandle: true,
            cashappTag: true,
            zellePhone: true,
            acceptsCash: true,
          },
        },
      },
    });

    const members = memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      role: m.role,
      venmoHandle: m.user.venmoHandle,
      cashappTag: m.user.cashappTag,
      zellePhone: m.user.zellePhone,
      acceptsCash: m.user.acceptsCash,
    }));
    res.json(members);
  } catch (err) {
    console.error("List members error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Record a payment
const createPaymentSchema = z.object({
  toUserId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

app.post("/groups/:groupId/payments", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  const parsed = createPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    });
    return;
  }
  const { toUserId, amountCents } = parsed.data;

  try {
    // Authorization: payer must be a member
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    // The recipient must also be a member
    const recipientMembership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: toUserId, groupId } },
    });
    if (!recipientMembership) {
      res.status(400).json({ error: "Recipient is not a member of this group" });
      return;
    }

    const payment = await prisma.payment.create({
      data: { groupId, fromUserId: userId, toUserId, amountCents },
    });

    res.status(201).json(payment);
  } catch (err) {
    console.error("Create payment error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Leaving a group
app.post("/groups/:groupId/leave", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  try {
    // Must be a member to leave
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    // Settle-up check: compute this user's net balance in the group
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
    });
    const payments = await prisma.payment.findMany({ where: { groupId } });

    const expenseInputs = expenses.map((e) => ({
      paidByUserId: e.paidById,
      splits: e.splits.map((s) => ({ userId: s.userId, amountCents: s.amountCents })),
    }));
    const paymentInputs = payments.map((p) => ({
      paidByUserId: p.fromUserId,
      splits: [{ userId: p.toUserId, amountCents: p.amountCents }],
    }));

    const balances = computeBalances([...expenseInputs, ...paymentInputs]);
    const myBalance = balances.find((b) => b.userId === userId)?.netCents ?? 0;

    if (myBalance !== 0) {
      res.status(400).json({
        error: "You must settle up before leaving. Your balance is not zero.",
      });
      return;
    }

    // How many members are in the group?
    const memberCount = await prisma.membership.count({ where: { groupId } });

    if (membership.role === "owner") {
      if (memberCount > 1) {
        res.status(400).json({
          error: "As the owner, you can only leave once all other members have left.",
        });
        return;
      }
      // Sole owner leaving → disband the group (cascades delete everything)
      await prisma.group.delete({ where: { id: groupId } });
      res.json({ message: "Group disbanded" });
      return;
    }

    // Regular member leaving → just remove their membership
    await prisma.membership.delete({
      where: { userId_groupId: { userId, groupId } },
    });
    res.json({ message: "Left group" });
  } catch (err) {
    console.error("Leave group error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/payments/:paymentId/confirm", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { paymentId } = req.params;

  if (typeof paymentId !== "string") {
    res.status(400).json({ error: "Invalid payment id" });
    return;
  }

  try {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    // Only the recipient can confirm they received the money
    if (payment.toUserId !== userId) {
      res.status(403).json({ error: "Only the payment recipient can confirm it" });
      return;
    }

    if (payment.status === "confirmed") {
      res.status(409).json({ error: "Payment is already confirmed" });
      return;
    }

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "confirmed" },
    });

    res.json(updated);
  } catch (err) {
    console.error("Confirm payment error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/groups/:groupId/payments", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { groupId } = req.params;

  if (typeof groupId !== "string") {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  try {
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      res.status(403).json({ error: "You are not a member of this group" });
      return;
    }

    const payments = await prisma.payment.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
    });
    res.json(payments);
  } catch (err) {
    console.error("List payments error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const updateMeSchema = z.object({
  venmoHandle: z.string().max(50).optional(),
  cashappTag: z.string().max(50).optional(),
  zellePhone: z.string().max(20).optional(),
  acceptsCash: z.boolean().optional(),
});

app.patch("/me", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        venmoHandle: true,
        cashappTag: true,
        zellePhone: true,
        acceptsCash: true,
      },
    });
    res.json(user);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});



const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => console.log('API running on :${PORT}'));
