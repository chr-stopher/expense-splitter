import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction
) {
    // 1: Read session id from browser
    const sessionId = req.cookies?.sessionId;
    if (!sessionId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }

    try {
        // 2: Find related user from session
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { user: true },
        });

        // 3: Reject if session doesn't exist / is expired
        if (!session || session.expiresAt < new Date()) {
            res.status(401).json({ error: "Session invalid or expired" });
            return;
        }

        // 4: Attach only logged-in user to req, no passwordHash
        req.user = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
        };

        // 5: Hand over control to route handler
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        res.status(500).json({ error: "Something went wrong" });
    }
}
