import { eq } from "drizzle-orm";

import { getDb } from "./db";
import { settings } from "./db/schema";

/** Reads an app-wide value; null when it was never set. */
export async function getSetting<T>(env: Env, key: string): Promise<T | null> {
  const row = await getDb(env)
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function setSetting(env: Env, key: string, value: unknown) {
  const row = { key, value: JSON.stringify(value), updatedAt: Date.now() };
  await getDb(env)
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: row.value, updatedAt: row.updatedAt },
    });
}

export async function deleteSetting(env: Env, key: string) {
  await getDb(env).delete(settings).where(eq(settings.key, key));
}
