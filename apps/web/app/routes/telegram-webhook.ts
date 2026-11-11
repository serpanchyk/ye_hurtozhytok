import { activity, getDb } from "~/lib/db";
import { deleteSetting, getSetting, setSetting } from "~/lib/settings.server";
import { readNewsFromNow } from "~/lib/squad-bot.server";
import {
  SETTING_CHAT,
  SETTING_LINK,
  webhookSecret,
  type PendingLink,
  type TelegramChat,
} from "~/lib/telegram.server";
import type { Route } from "./+types/telegram-webhook";

/** Telegram calls this for messages in groups with the bot; only /connect matters. */

type Chat = { id: number; type: string; title?: string };
type Update = {
  message?: { text?: string; migrate_to_chat_id?: number; chat: Chat };
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
};

/** Wrong codes before the waiting one is cancelled: six digits are guessable. */
const MAX_MISSES = 5;
const CONNECT = /^\/connect(?:@\w+)?(?:[\s ]+(\d[\d\s ]{5,}))?/i;
const HELP =
  "Щоб підключити цю групу до єГуртожитку, відкрийте застосунок → Послуги → Управа → Telegram-група → «Підключити групу» й надішліть сюди команду, яку він покаже.";

/** Telegram takes a Bot API call as the webhook's answer: no extra request. */
function reply(chatId: number, text: string) {
  return Response.json({ method: "sendMessage", chat_id: chatId, text });
}
const ok = () => new Response(null, { status: 200 });
const isGroup = (chat: Chat) =>
  chat.type === "group" || chat.type === "supergroup";

export function loader() {
  return new Response("Not found", { status: 404 });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  if (
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
    (await webhookSecret(env))
  )
    return new Response("Forbidden", { status: 403 });

  const update = (await request.json()) as Update;

  // Just added to a group: say hello, so people see the bot arrived.
  const membership = update.my_chat_member;
  if (membership) {
    const joined = ["member", "administrator"].includes(
      membership.new_chat_member.status,
    );
    if (joined && isGroup(membership.chat))
      return reply(membership.chat.id, `Привіт! Я бот єГуртожитку. ${HELP}`);
    // Removed from the connected group: stop writing there.
    const chat = await getSetting<TelegramChat>(env, SETTING_CHAT);
    if (chat?.id === membership.chat.id && !joined)
      await deleteSetting(env, SETTING_CHAT);
    return ok();
  }

  const message = update.message;
  if (!message) return ok();

  // A group that became a supergroup gets a new id; keep following it.
  if (message.migrate_to_chat_id) {
    const chat = await getSetting<TelegramChat>(env, SETTING_CHAT);
    if (chat && chat.id === message.chat.id)
      await setSetting(env, SETTING_CHAT, {
        ...chat,
        id: message.migrate_to_chat_id,
      });
    return ok();
  }

  const match = message.text?.trim().match(CONNECT);
  if (!match) return ok();
  if (!isGroup(message.chat))
    return reply(
      message.chat.id,
      "Цю команду треба надіслати в груповому чаті загону, а не в особистих.",
    );
  const code = match[1]?.replace(/\D/g, "");
  if (!code) return reply(message.chat.id, HELP);

  const pending = await getSetting<PendingLink>(env, SETTING_LINK);
  if (!pending || pending.expiresAt < Date.now() || pending.code !== code) {
    if (pending && pending.expiresAt >= Date.now()) {
      const misses = (pending.misses ?? 0) + 1;
      if (misses >= MAX_MISSES) await deleteSetting(env, SETTING_LINK);
      else await setSetting(env, SETTING_LINK, { ...pending, misses });
    }
    return reply(
      message.chat.id,
      "Код не підходить або застарів. Створіть новий у застосунку: Управа → Telegram-група.",
    );
  }

  // The log written before is not news for this group; set before the group
  // itself, so no run in between posts it.
  await readNewsFromNow(env);
  await setSetting(env, SETTING_CHAT, {
    id: message.chat.id,
    title: message.chat.title ?? "Група",
  } satisfies TelegramChat);
  await deleteSetting(env, SETTING_LINK);
  await activity(getDb(env), {
    actorId: pending.by,
    action: "telegram.connected",
    entity: "telegram",
    entityId: message.chat.id,
    details: { title: message.chat.title ?? null },
  });
  return reply(
    message.chat.id,
    "Групу підключено. Сюди приходитимуть вахти, обходи, картки загону, зведення о 9:00 і нагадування о 18:00.",
  );
}
