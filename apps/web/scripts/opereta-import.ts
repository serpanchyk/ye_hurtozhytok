/**
 * Moves the squad's data from Оперета into єГуртожиток: people (by email),
 * shifts, patrols, cards of the squad board, the activity log and the
 * connected Telegram group. Prints SQL to apply to the єГуртожиток database.
 *
 *   npx tsx scripts/opereta-import.ts --query   # prints the export query
 *   # in the Оперета repo, apps/web, with that query:
 *   npx wrangler d1 execute opereta --remote --json --command "<query>" > opereta.json
 *   # here, apps/web:
 *   npx tsx scripts/opereta-import.ts opereta.json emails.json > import.sql
 *   npx wrangler d1 execute ehurtozhytok --remote --file import.sql
 *
 * emails.json maps an Оперета member id to an @lpnu.ua address, or null for
 * someone who is not moved (allowed only if nothing refers to them):
 *   { "1": "imia.prizvyshche.xx.2024@lpnu.ua", "3": null }
 * Whoever has not signed in yet gets a resident row "pending:<email>" that
 * their first sign-in takes over. Keep emails.json out of the repository.
 *
 * Shifts, patrols and cards keep their Оперета ids: the tables must be empty.
 * Squad-only announcements are not moved (the app has none), nor Оперета's
 * own accounts and codes.
 */
import { readFileSync } from "node:fs";

const TABLES = [
  "members",
  "shifts",
  "patrols",
  "patrol_members",
  "tasks",
  "task_assignees",
  "activity_log",
  "settings",
] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, string | number | null>;

if (process.argv[2] === "--query") {
  console.log(TABLES.map((t) => `select * from ${t};`).join(" "));
  process.exit(0);
}

const [dataPath, emailsPath] = process.argv.slice(2);
if (!dataPath || !emailsPath) {
  console.error(
    "Usage: tsx scripts/opereta-import.ts opereta.json emails.json",
  );
  process.exit(1);
}

// wrangler --json prints one result per statement, in the query's order.
const results = JSON.parse(readFileSync(dataPath, "utf8")) as {
  results: Row[];
}[];
if (results.length !== TABLES.length)
  throw new Error(`Expected ${TABLES.length} results, got ${results.length}`);
const data = Object.fromEntries(
  TABLES.map((t, i) => [t, results[i].results]),
) as Record<Table, Row[]>;
const emails = JSON.parse(readFileSync(emailsPath, "utf8")) as Record<
  string,
  string | null
>;

const now = Date.now();
const out: string[] = [];

/** A SQL literal. */
function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function emailOf(memberId: unknown): string {
  const email = emails[String(memberId)];
  if (!email)
    throw new Error(
      `Member ${String(memberId)} is referred to but has no email`,
    );
  return email.toLowerCase();
}

/** The єГуртожиток resident id of an Оперета member, as a subquery. */
function rid(memberId: unknown): string {
  if (memberId === null || memberId === undefined) return "NULL";
  return `(SELECT id FROM residents WHERE lower(email) = ${lit(emailOf(memberId))})`;
}

// ─── People ──────────────────────────────────────────────────────────────
const ROLE: Record<string, string | null> = {
  member: "squad",
  squad_head: "squad_head",
  site_manager: "site_manager",
  council_head: null,
  commandant: null,
};
for (const m of data.members) {
  const raw = emails[String(m.id)];
  if (raw === undefined)
    throw new Error(`No entry for member ${m.id} (${m.name}) in emails.json`);
  if (raw === null) continue;
  const email = raw.toLowerCase();
  const name = String(m.name).trim();
  const [first, ...rest] = name.split(/\s+/);
  out.push(
    `INSERT INTO residents (google_sub, email, name, first_name, last_name, telegram, created_at, updated_at) SELECT ${lit(`pending:${email}`)}, ${lit(email)}, ${lit(name)}, ${lit(first)}, ${lit(rest.join(" ") || null)}, ${lit(m.telegram)}, ${lit(m.created_at)}, ${now} WHERE NOT EXISTS (SELECT 1 FROM residents WHERE lower(email) = ${lit(email)});`,
  );
  // The bot mentions people by their Telegram; keep the one given in Оперета.
  if (m.telegram)
    out.push(
      `UPDATE residents SET telegram = ${lit(m.telegram)} WHERE lower(email) = ${lit(email)} AND telegram IS NULL;`,
    );
  const role = ROLE[String(m.role)];
  if (role)
    out.push(
      `INSERT OR IGNORE INTO role_grants (email, role, granted_by, created_at) VALUES (${lit(email)}, ${lit(role)}, NULL, ${now});`,
    );
}

// ─── Shifts, patrols, cards ──────────────────────────────────────────────
for (const s of data.shifts)
  out.push(
    `INSERT INTO shifts (id, date, resident_id, note, created_by, created_at) VALUES (${lit(s.id)}, ${lit(s.date)}, ${rid(s.member_id)}, ${lit(s.note)}, ${rid(s.created_by)}, ${lit(s.created_at)});`,
  );
for (const p of data.patrols)
  out.push(
    `INSERT INTO patrols (id, date, status, notes, created_by, created_at) VALUES (${lit(p.id)}, ${lit(p.date)}, ${lit(p.status)}, ${lit(p.notes)}, ${rid(p.created_by)}, ${lit(p.created_at)});`,
  );
for (const pm of data.patrol_members)
  out.push(
    `INSERT INTO patrol_members (patrol_id, resident_id) VALUES (${lit(pm.patrol_id)}, ${rid(pm.member_id)});`,
  );
const createdAt = new Map(data.tasks.map((t) => [t.id, t.created_at]));
for (const t of data.tasks)
  // Squad cards stay private; Оперета kept no finish time, its last change is closest.
  out.push(
    `INSERT INTO tasks (id, board, title, details, place, status, public, patrol_id, created_by, created_at, updated_at, done_at, deleted_at) VALUES (${lit(t.id)}, 'squad', ${lit(t.title)}, ${lit(t.details)}, ${lit(t.place)}, ${lit(t.status)}, 0, ${lit(t.patrol_id)}, ${rid(t.created_by)}, ${lit(t.created_at)}, ${lit(t.updated_at)}, ${t.status === "done" ? lit(t.updated_at) : "NULL"}, NULL);`,
  );
for (const a of data.task_assignees)
  out.push(
    `INSERT INTO task_assignees (task_id, resident_id, created_at) VALUES (${lit(a.task_id)}, ${rid(a.member_id)}, ${lit(createdAt.get(a.task_id) ?? now)});`,
  );

// ─── The activity log ────────────────────────────────────────────────────
const ACTION: Record<string, string> = { "task.edited": "task.updated" };
const kept: Record<string, Set<unknown>> = {
  shift: new Set(data.shifts.map((s) => s.id)),
  patrol: new Set(data.patrols.map((p) => p.id)),
  task: new Set(data.tasks.map((t) => t.id)),
};
const maxId = (ids: Set<unknown>) => Math.max(0, ...[...ids].map(Number));

/** Details as a SQL json_object(), with Оперета member ids turned into resident ids. */
function details(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (Array.isArray(value))
    return `json_array(${value.map((v) => details(v)).join(", ")})`;
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) =>
        k === "memberId"
          ? `'residentId', ${rid(v)}`
          : `${lit(k)}, ${details(v)}`,
    );
    return `json_object(${parts.join(", ")})`;
  }
  return lit(value);
}

let skipped = 0;
for (const e of data.activity_log) {
  const entity = String(e.entity);
  // Оперета's accounts, codes, its own announcements and bot setup stay there.
  if (!(entity in kept)) continue;
  // A gone row whose id the new app may hand out again would mix histories.
  if (
    !kept[entity].has(e.entity_id) &&
    Number(e.entity_id) > maxId(kept[entity])
  ) {
    skipped++;
    continue;
  }
  const parsed = e.details ? (JSON.parse(String(e.details)) as unknown) : null;
  out.push(
    `INSERT INTO activity_log (actor_id, action, entity, entity_id, details, created_at) VALUES (${rid(e.actor_id)}, ${lit(ACTION[String(e.action)] ?? e.action)}, ${lit(entity)}, ${lit(e.entity_id)}, ${parsed === null ? "NULL" : details(parsed)}, ${lit(e.created_at)});`,
  );
}

// ─── The Telegram group; the bot starts reading the log after all of this ─
const chat = data.settings.find((s) => s.key === "telegram.chat");
if (chat)
  out.push(
    `INSERT INTO settings (key, value, updated_at) VALUES ('telegram.chat', ${lit(chat.value)}, ${now}) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
  );
out.push(
  `INSERT INTO settings (key, value, updated_at) VALUES ('telegram.cursor', (SELECT CAST(COALESCE(MAX(id), 0) AS TEXT) FROM activity_log), ${now}) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
);

console.log(out.join("\n"));
// A SQL comment, so it does no harm if stderr ends up in the file too.
console.error(
  `-- members ${data.members.length}, shifts ${data.shifts.length}, patrols ${data.patrols.length}, cards ${data.tasks.length}, log entries ${data.activity_log.length} (${skipped} about gone rows skipped), group ${chat ? "yes" : "no"}`,
);
