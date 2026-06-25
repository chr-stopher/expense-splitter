import express from "express";
// import type { Expense } from "@expense-splitter/shared"; Test 1
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./lib/prisma";
import cookieParser from "cookie-parser";
import { requireAuth } from "./middleware/auth";

const app = express();
app.use(express.json());
// cookie-parser middleware
app.use(cookieParser());

app.get("/health", (_req, res) => {
    res.json({status: "ok"});
});

// Middleware route verification
app.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

/*Temporary to show the shared type works across packages       Test 1
app.get("/demo-expense", (_req, res) => {
    const example: Expense = {
        id: "exp_1", // string
        description: "Dinner",  // string
        amountCents: 4250, // number
        paidByUserId: "user_1", // string
    };
    res.json(example);
});
*/

/* cookie-parser test                                          Test 2
app.get("/debug-cookies", (req, res) => {
    res.json(req.cookies);
});
*/

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

// Join group
app.post("/groups/:groupId/join", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { groupId } = req.params;

    // Ensure the type for groupId before being passed to the database
    if (typeof groupId !== "string") {
        res.status(400).json({ error: "Invalid group id" });
        return;
    }

    try {
        // Validate group exists
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group) {
            res.status(404).json({ error: "Group not found" });
            return;
        }

        // Don't create duplicate if already a member of a group
        const existing = await prisma.membership.findUnique({
            where: { userId_groupId: { userId, groupId } },
        });

        if (existing) {
            res.status(409).json({ error: "Already a member of this group" });
            return;
        }

        const membership = await prisma.membership.create({
            data: { userId, groupId, role: "member" },
        });

        res.status(201).json(membership);
    } catch (err) {
        console.error("Join group error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

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

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => console.log('API running on :${PORT}'));
