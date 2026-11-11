import { Form, useNavigation } from "react-router";

import { FormField } from "~/components/controls";
import { Icon } from "~/components/ui";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_TONE,
  REPLY_MAX,
  isOpen,
  type ComplaintStatus,
} from "~/lib/complaints";

export function ComplaintPill({ status }: { status: ComplaintStatus }) {
  return (
    <span className={`st ${COMPLAINT_STATUS_TONE[status]}`}>
      {COMPLAINT_STATUS_LABELS[status]}
    </span>
  );
}

type Shown = {
  status: ComplaintStatus;
  topicLabel: string;
  title: string;
  body: string;
  place: string | null;
  reply: string | null;
  author: { name: string; room: string | null; telegram: string | null } | null;
};

/**
 * A complaint: its state, topic, the author's words, the reply. Those who
 * handle it also see who wrote it, to ask for details.
 */
export function ComplaintDetails({
  c,
  byline,
  withAuthor = false,
}: {
  c: Shown;
  byline: string;
  withAuthor?: boolean;
}) {
  return (
    <>
      <article className="glass ann-detail">
        <div className="ann-detail-top">
          <ComplaintPill status={c.status} />
          <span className="ann-flag">
            <Icon name="mail" small />
            {c.topicLabel}
          </span>
        </div>
        <h2>{c.title}</h2>
        <p className="task-details">{c.body}</p>
        {withAuthor && c.author && (
          <p className="meta">
            <span>
              <Icon name="user" small />
              {c.author.name}
            </span>
            {c.author.room && <span>кімната {c.author.room}</span>}
            {c.author.telegram && <span>@{c.author.telegram}</span>}
          </p>
        )}
        <p className="ann-by">{byline}</p>
      </article>
      {c.reply && (
        <div className="glass reason">
          <b>{c.status === "rejected" ? "Чому відхилено" : "Відповідь"}</b>
          <p>{c.reply}</p>
        </div>
      )}
    </>
  );
}

/**
 * For those who handle a complaint: answer the author, close one about the
 * app (it has no card), or turn it down with a reason.
 */
export function ComplaintActions({
  id,
  status,
  reply,
  canResolve,
}: {
  id: number;
  status: ComplaintStatus;
  reply: string | null;
  canResolve: boolean;
}) {
  const busy = useNavigation().state === "submitting";
  return (
    <section className="decide">
      <div className="section-h">
        <h3>Відповідь автору</h3>
      </div>
      <Form method="post" className="glass form">
        <input type="hidden" name="complaint" value={id} />
        <FormField
          id="reply"
          label="Що написати"
          hint="Автор побачить це у своєму зверненні й отримає сповіщення."
        >
          <textarea
            id="reply"
            name="reply"
            className="area"
            rows={3}
            maxLength={REPLY_MAX}
            defaultValue={reply ?? ""}
            aria-describedby="reply-hint"
          />
        </FormField>
        <button
          className={`btn ${canResolve && isOpen(status) ? "btn-soft" : "btn-primary"} block`}
          type="submit"
          name="intent"
          value="answer"
          disabled={busy}
        >
          Надіслати відповідь
        </button>
        {canResolve && isOpen(status) && (
          <button
            className="btn btn-primary block"
            type="submit"
            name="intent"
            value="resolve"
            disabled={busy}
          >
            Вирішено
          </button>
        )}
      </Form>
      {isOpen(status) && (
        <details className="glass reject">
          <summary>Відхилити з поясненням</summary>
          <Form method="post" className="form">
            <input type="hidden" name="complaint" value={id} />
            <FormField id="reject-reply" label="Чому">
              <textarea
                id="reject-reply"
                name="reply"
                className="area"
                rows={3}
                maxLength={REPLY_MAX}
                required
                placeholder="Наприклад: це не в межах гуртожитку, або вже вирішено."
              />
            </FormField>
            <button
              className="btn btn-soft block"
              type="submit"
              name="intent"
              value="reject"
              disabled={busy}
            >
              Відхилити
            </button>
          </Form>
        </details>
      )}
    </section>
  );
}
