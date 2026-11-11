import { Form, data, redirect } from "react-router";

import { ConfirmButton } from "~/components/controls";
import { Credit, Icon, TopBar } from "~/components/ui";
import { agoLabel } from "~/lib/announcements";
import { requireProfile } from "~/lib/auth.server";
import { activity, getDb } from "~/lib/db";
import { canSetUpBot } from "~/lib/permissions";
import { deleteSetting, getSetting, setSetting } from "~/lib/settings.server";
import { shiftTopText } from "~/lib/squad-bot.server";
import {
  SETTING_CHAT,
  SETTING_LAST,
  SETTING_LINK,
  hasBot,
  postToSquad,
  telegram,
  webhookSecret,
  webhookUrl,
  type LastSend,
  type PendingLink,
  type TelegramChat,
} from "~/lib/telegram.server";
import { kyivDateKey, kyivNow } from "~/lib/time";
import { usePolling } from "~/lib/use-polling";
import type { Route } from "./+types/work-telegram";

export const meta: Route.MetaFunction = () => [
  { title: "Telegram-група · єГуртожиток" },
];

const LINK_TTL_MS = 30 * 60_000;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!canSetUpBot(me)) throw redirect("/work");
  if (!hasBot(env)) return { bot: false as const };
  const [chat, pending, last, hooked] = await Promise.all([
    getSetting<TelegramChat>(env, SETTING_CHAT),
    getSetting<PendingLink>(env, SETTING_LINK),
    getSetting<LastSend>(env, SETTING_LAST),
    // Whether Telegram sends the group's messages here and not, say, to
    // Оперета, and what went wrong with them last.
    telegram<{ url: string; last_error_message?: string }>(
      env,
      "getWebhookInfo",
    )
      .then((info) => ({
        ours: info.url === webhookUrl(env),
        error: info.last_error_message ?? null,
      }))
      .catch(() => ({ ours: false, error: null })),
  ]);
  const today = kyivNow().date;
  return {
    bot: true as const,
    chat,
    hooked,
    pending: pending && pending.expiresAt > Date.now() ? pending : null,
    last: last && {
      ...last,
      ago: agoLabel(kyivDateKey(last.at), today),
    },
  };
}

/** Points the bot's webhook here, so /connect and group changes reach us. */
async function hook(env: Env) {
  await telegram(env, "setWebhook", {
    url: webhookUrl(env),
    secret_token: await webhookSecret(env),
    allowed_updates: ["message", "my_chat_member"],
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const me = await requireProfile(request, env);
  if (!canSetUpBot(me) || !hasBot(env))
    return data({ error: "Так зробити не можна." }, { status: 403 });
  const intent = (await request.formData()).get("intent");
  const chat = await getSetting<TelegramChat>(env, SETTING_CHAT);
  try {
    switch (intent) {
      case "connect": {
        const bot = await telegram<{ username: string }>(env, "getMe");
        await hook(env);
        const code = String(
          crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
        ).padStart(6, "0");
        await setSetting(env, SETTING_LINK, {
          code,
          username: bot.username,
          expiresAt: Date.now() + LINK_TTL_MS,
          by: me.id,
        } satisfies PendingLink);
        return null;
      }
      case "hook":
        await hook(env);
        return { notice: "Звʼязок налаштовано." };
      case "test":
      case "stats": {
        if (!chat) return { error: "Групу ще не підключено." };
        const text =
          intent === "test"
            ? "Перевірка звʼязку з єГуртожитком. Усе працює."
            : await shiftTopText(env, kyivNow().date);
        return (await postToSquad(env, chat, text)) === "sent"
          ? { notice: "Надіслано в групу." }
          : { error: "Не вдалося надіслати. Можливо, бота видалили з групи." };
      }
      case "disconnect":
        await deleteSetting(env, SETTING_CHAT);
        await deleteSetting(env, SETTING_LINK);
        if (chat)
          await activity(getDb(env), {
            actorId: me.id,
            action: "telegram.disconnected",
            entity: "telegram",
            entityId: chat.id,
            details: { title: chat.title },
          });
        return { notice: "Групу відключено, бот більше не пише." };
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "telegram.setup_failed",
        message: String(error),
      }),
    );
    return data(
      { error: "Telegram не відповів. Перевірте токен бота й спробуйте ще." },
      { status: 502 },
    );
  }
  return data({ error: "Невідома дія." }, { status: 400 });
}

function IntentButton({
  intent,
  className = "btn btn-soft block",
  children,
}: {
  intent: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Form method="post">
      <button className={className} name="intent" value={intent}>
        {children}
      </button>
    </Form>
  );
}

/** The squad's group chat: connect it, check it, send to it. */
export default function WorkTelegram({
  loaderData: d,
  actionData,
}: Route.ComponentProps) {
  // The group's name appears once /connect is sent; no reload button in the app.
  usePolling(5_000, d.bot && !!d.pending && !d.chat);
  return (
    <>
      <TopBar back="/work?s=manager" title="Telegram-група" />
      <p className="lede" style={{ margin: "0 4px 14px" }}>
        Бот пише в групу загону: вахти, обходи, картки дошки загону, зведення о
        9:00, нагадування про вільну вахту о 18:00, а в неділю ще графік на
        тиждень і хто скільки відсидів.
      </p>
      {actionData && "notice" in actionData && (
        <p className="ok-note" role="status">
          {actionData.notice}
        </p>
      )}
      {actionData && "error" in actionData && (
        <p className="error-note" role="alert">
          {actionData.error}
        </p>
      )}

      {!d.bot ? (
        <div className="glass empty">
          <b>Бота ще не підключено</b>
          Напишіть розробникові: боту потрібен токен (як це зробити — у
          docs/run-project.md).
        </div>
      ) : d.chat ? (
        <>
          <div className="glass" style={{ padding: "4px 0" }}>
            <div className="list-row">
              <span className="who-av">
                <Icon name="mail" small />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{d.chat.title}</b>
                <span className="sub">
                  {!d.hooked.ours
                    ? "Підключено, але звʼязок веде не сюди"
                    : d.hooked.error
                      ? `Telegram повідомляє: ${d.hooked.error}`
                      : "Підключено"}
                </span>
              </span>
              {(!d.hooked.ours || d.hooked.error) && (
                <Form method="post">
                  <button className="pill-btn" name="intent" value="hook">
                    Налаштувати
                  </button>
                </Form>
              )}
            </div>
            {d.last && (
              <div className="list-row">
                <span className="who-av">
                  <Icon name={d.last.ok ? "check" : "x"} small />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{d.last.summary || "Повідомлення"}</b>
                  <span className="sub">
                    {d.last.ok ? "Надіслано" : "Не надіслано"} {d.last.ago}
                  </span>
                </span>
              </div>
            )}
          </div>
          <div className="home-actions">
            <IntentButton intent="test">Надіслати перевірку</IntentButton>
            <IntentButton intent="stats">
              Надіслати «Хто скільки відсидів»
            </IntentButton>
            <Form method="post" className="confirm-form">
              <ConfirmButton
                className="btn btn-ghost-danger block"
                name="intent"
                value="disconnect"
                question="Відключити групу? Бот перестане писати."
                yes="Так, відключити"
              >
                Відключити групу
              </ConfirmButton>
            </Form>
          </div>
        </>
      ) : d.pending ? (
        <>
          <ol className="glass bot-steps">
            <li>
              Додайте бота <b>@{d.pending.username}</b> у груповий чат загону.
            </li>
            <li>
              Надішліть у групі цю команду (діє 30 хвилин):
              <code className="bot-command">
                /connect@{d.pending.username} {d.pending.code}
              </code>
            </li>
            <li>Бот відповість у групі, а тут зʼявиться її назва.</li>
          </ol>
          <div className="home-actions">
            <IntentButton intent="connect">Створити новий код</IntentButton>
          </div>
        </>
      ) : (
        <>
          <div className="glass empty">
            <b>Групу не підключено</b>
            Підключіть груповий чат загону, щоб бот писав туди.
          </div>
          <div className="home-actions">
            <IntentButton intent="connect" className="btn btn-primary block">
              Підключити групу
            </IntentButton>
          </div>
        </>
      )}
      <Credit />
    </>
  );
}
