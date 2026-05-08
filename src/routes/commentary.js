import { Router } from "express";
import {
  listCommentaryQuerySchema,
  createCommentarySchema,
} from "../validation/commentary.js";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { matchIdParamSchema } from "../validation/matches.js";
import { eq, desc } from "drizzle-orm";

const MAX_LIMIT = 100;

export const commentaryRouter = Router({ mergeParams: true });

commentaryRouter.get("/", async (req, res) => {
  const paramsResult = matchIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID", details: paramsResult.error.issues });
  }
  const queryResult = listCommentaryQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res
      .status(400)
      .json({
        error: "Invalid query parameters",
        details: queryResult.error.issues,
      });
  }
  try {
    const { id: matchId } = paramsResult.data;
    const { limit = 10 } = queryResult.data;

    const safeLimit = Math.min(limit, MAX_LIMIT);

    const result = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(safeLimit);

    return res.json({ data: result });
  } catch (error) {
    console.error("Error listing commentary:", error);
    return res.status(500).json({ error: "Error listing commentary." });
  }
});

commentaryRouter.post("/", async (req, res) => {
  const paramsResult = matchIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID", details: paramsResult.error.issues });
  }

  const bodyResult = createCommentarySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: "Invalid commentary data",
      details: bodyResult.error.issues,
    });
  }

  try {
    const { minute, ...rest } = bodyResult.data;
    const [result] = await db
      .insert(commentary)
      .values({
        matchId: paramsResult.data.id,
        minute,
        ...rest,
      })
      .returning();
    
    const broadcastCommentary = res.app.locals.broadcastCommentary;
    if (broadcastCommentary) {
      broadcastCommentary(result.matchId, result);
    }

    return res.status(201).json({ data: result });
  } catch (error) {
    console.error("Error creating commentary:", error);
    return res.status(500).json({ error: "Error creating commentary." });
  }
});
