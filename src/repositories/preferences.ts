import { eq } from "drizzle-orm";
import type { createDatabase } from "../lib/db/connection";
import { userPreferences } from "../lib/db/schema";

export type Database = ReturnType<typeof createDatabase>["db"];
// Only server-authenticated identity may construct an owner; never pass request body IDs.
export type Owner = Readonly<{ userId: string }>;
export async function readPreferences(db: Database, owner: Owner) {
  await db
    .insert(userPreferences)
    .values({ userId: owner.userId })
    .onConflictDoNothing();
  const [result] = await db
    .select({
      timeZone: userPreferences.timeZone,
      reviewedAt: userPreferences.reviewedAt,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, owner.userId));
  return result;
}
export async function savePreferences(
  db: Database,
  owner: Owner,
  timeZone: string,
) {
  const now = new Date();
  const [result] = await db
    .insert(userPreferences)
    .values({ userId: owner.userId, timeZone, reviewedAt: now })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { timeZone, reviewedAt: now, updatedAt: now },
    })
    .returning({
      timeZone: userPreferences.timeZone,
      reviewedAt: userPreferences.reviewedAt,
    });
  return result;
}
