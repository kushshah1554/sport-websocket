import { Router } from "express";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../validation/matches.js";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";
import { getMatchStatus } from "../utils/match-status.js";
import { desc, eq } from "drizzle-orm";

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get("/", async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query parameters",
      details: JSON.stringify(parsed.error),
    });
  }

  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(limit);

    res.json({ data });

  } catch (error) {
    res.status(500).json({
      error: "Failed to get matches",
      details: JSON.stringify(error),
    });
  }
});

matchRouter.post("/", async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);
  
  if (!parsed.success) {
      return res.status(400).json({
          error: "invalid payload",
          details: JSON.stringify(parsed.error),
        });
    }
    const { data: { startTime, endTime, homeScore, awayScore } } = parsed;

  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(startTime, endTime),
      })
      .returning();
      if(res.app.locals.broadcastMatchCreated) {
        res.app.locals.broadcastMatchCreated(event);
      }
    res.status(201).json({ data: event });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create match",
      details: JSON.stringify(error),
    });
  }
});

matchRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.delete(matches).where(eq(matches.id, id));
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Match not found" });
    }
    res.status(200).json({ message: "Match deleted" });
  } catch (error) {
    res.status(500).json({
      error: "Failed to delete match",
      details: JSON.stringify(error),
    });
  }
});
 