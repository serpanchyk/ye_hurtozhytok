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
  /** Wrong codes sent so far; after a few the code is cancelled. */
  misses?: number;
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

/** A refusal from the Bot API, with what Telegram says to do about it. */
export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly parameters: { retry_after?: number; migrate_to_chat_id?: number },
  ) {
    super(message);
  }
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
    error_code?: number;
    parameters?: { retry_after?: number; migrate_to_chat_id?: number };
  };
  if (!data.ok)
    throw new TelegramError(
      `Telegram ${method} failed: ${data.description ?? response.status}`,
      data.error_code ?? response.status,
      data.parameters ?? {},
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
 * app whether messages really go out. "later" means Telegram asked to wait.
 */
export async function postToSquad(
  env: Env,
  chat: TelegramChat,
  text: string,
): Promise<"sent" | "later" | "failed"> {
  const summary = summaryLine(text);
  const send = (chatId: number) =>
    telegram(env, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: isQuietHour(
        Math.floor(kyivMinute(Date.now()) / 60),
      ),
    });
  try {
    try {
      await send(chat.id);
    } catch (error) {
      // The group became a supergroup: follow it and try once more.
      const moved =
        error instanceof TelegramError && error.parameters.migrate_to_chat_id;
      if (!moved) throw error;
      await setSetting(env, SETTING_CHAT, { ...chat, id: moved });
      await send(moved);
    }
    await setSetting(env, SETTING_LAST, {
      at: Date.now(),
      ok: true,
      summary,
    } satisfies LastSend);
    return "sent";
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
    return error instanceof TelegramError && error.code === 429
      ? "later"
      : "failed";
  }
}
