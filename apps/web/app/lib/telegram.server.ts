import { getSetting, setSetting } from "./settings.server";
import { isQuietHour, summaryLine } from "./squad-news";
import { kyivMinute } from "./time";

/**
 * The squad's Telegram bot, moved over from Оперета: one group chat it posts
 * to. Without the TELEGRAM_BOT_TOKEN secret everything here quietly does
 * nothing, so local development needs no bot.
 */

const API = "https://api.telegram.org";

export const SETTING_CHAT = "telegram.chat";
export const SETTING_LINK = "telegram.link";
export const SETTING_LAST = "telegram.last";

export type TelegramChat = { id: number; title: string };
/** A code waiting to be sent in the group with /connect, and who made it. */
export type PendingLink = {
  code: string;
  username: string;
  expiresAt: number;
  by: number;
};
export type LastSend = {
  at: number;
  ok: boolean;
  summary: string;
  error?: string;
};

/** An optional secret, so it is not among the generated Env names. */
function botToken(env: Env): string | undefined {
  return (env as unknown as Record<string, string | undefined>)
    .TELEGRAM_BOT_TOKEN;
}

export function hasBot(env: Env): boolean {
  return Boolean(botToken(env));
}

export async function telegram<T = unknown>(
  env: Env,
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${API}/bot${botToken(env)}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };
  if (!data.ok)
    throw new Error(
      `Telegram ${method} failed: ${data.description ?? response.status}`,
    );
  return data.result as T;
}

/** What Telegram must echo on every webhook call; derived, so no extra secret. */
export async function webhookSecret(env: Env): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`telegram-webhook:${env.SESSION_SECRET}`),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export const webhookUrl = (env: Env) => `${env.APP_URL}/telegram/webhook`;

/** The connected group, or null without a bot or a group. */
export async function squadChat(env: Env): Promise<TelegramChat | null> {
  if (!hasBot(env)) return null;
  return getSetting<TelegramChat>(env, SETTING_CHAT);
}

/**
 * Posts to the squad's group. Never throws, so a failed message does not
 * break anything else; the outcome is kept so the site manager sees in the
 * app whether messages really go out. Returns whether it went.
 */
export async function postToSquad(
  env: Env,
  chat: TelegramChat,
  text: string,
): Promise<boolean> {
  const summary = summaryLine(text);
  try {
    await telegram(env, "sendMessage", {
      chat_id: chat.id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: isQuietHour(
        Math.floor(kyivMinute(Date.now()) / 60),
      ),
    });
    await setSetting(env, SETTING_LAST, {
      at: Date.now(),
      ok: true,
      summary,
    } satisfies LastSend);
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({ event: "telegram.post_failed", message: String(error) }),
    );
    await setSetting(env, SETTING_LAST, {
      at: Date.now(),
      ok: false,
      summary,
      error: String(error).slice(0, 300),
    } satisfies LastSend).catch(() => undefined);
    return false;
  }
}
