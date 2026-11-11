import type { ReactNode, Ref } from "react";
import { Link } from "react-router";

import { PillGroup } from "~/components/pill-group";
import { Icon } from "~/components/ui";
import {
  BOARDS,
  BOARD_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  TASK_STATUSES,
  type Board,
  type TaskStatus,
} from "~/lib/tasks";

export type BoardCard = {
  id: number;
  title: string;
  place: string | null;
  status: TaskStatus;
  public: boolean;
  assignees: string[];
  /** «вчора», «3 дні тому» for finished cards. */
  done: string | null;
};

/** «Студрада / Оперзагін» as a gliding switch; `query` builds each link. */
export function BoardTabs({
  board,
  boards = BOARDS,
  query,
}: {
  board: Board;
  boards?: readonly Board[];
  query: (b: Board) => string;
}) {
  return (
    <PillGroup className="seg" label="Дошка">
      {boards.map((b) => (
        <Link
          data-pill-item
          key={b}
          to={query(b)}
          replace
          preventScrollReset
          aria-current={b === board ? "true" : undefined}
        >
          {BOARD_LABELS[b]}
        </Link>
      ))}
    </PillGroup>
  );
}

/**
 * «Нові → В роботі → Готово», the same on the public board and the working
 * one. On the working board (`keeper`) cards can be dragged, private ones are
 * marked and cards nobody took say so.
 */
export function BoardColumns({
  columns,
  href,
  keeper = false,
  landed = null,
  innerRef,
}: {
  columns: Record<TaskStatus, BoardCard[]>;
  href: (id: number) => string;
  keeper?: boolean;
  landed?: number | null;
  innerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="board-cols" ref={innerRef}>
      {TASK_STATUSES.map((status) => (
        <section
          key={status}
          className="board-col"
          data-drop={keeper ? status : undefined}
          aria-label={STATUS_LABELS[status]}
        >
          <div className="section-h">
            <h3>{STATUS_LABELS[status]}</h3>
            <span className="muted">{columns[status].length}</span>
          </div>
          {columns[status].length ? (
            <div className="task-list">
              {columns[status].map((t) => (
                <Link
                  viewTransition
                  className={`glass ann-row task-card${t.id === landed ? " is-landed" : ""}`}
                  to={href(t.id)}
                  key={t.id}
                  data-task={keeper ? t.id : undefined}
                  data-status={t.status}
                  data-draggable={keeper ? "" : undefined}
                  draggable={false}
                >
                  <span className="ann-row-text">
                    {!t.public && <PrivateFlag />}
                    <b>{t.title}</b>
                    <span className="meta">
                      {t.place && (
                        <span>
                          <Icon name="pin" small />
                          {t.place}
                        </span>
                      )}
                      {t.assignees.length > 0 && (
                        <span>
                          <Icon name="user" small />
                          {t.assignees.join(", ")}
                        </span>
                      )}
                      {keeper &&
                        t.assignees.length === 0 &&
                        status !== "done" && <span>нічия</span>}
                      {t.done && status === "done" && (
                        <span>готово {t.done}</span>
                      )}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="glass empty">Порожньо</div>
          )}
        </section>
      ))}
    </div>
  );
}

function PrivateFlag() {
  return (
    <span className="ann-flag">
      <Icon name="lock" small />
      Приватна
    </span>
  );
}

/** A card's page: state, title, place, details for those who keep the board, who works on it. */
export function TaskArticle({
  task,
  details,
  byline,
  children,
}: {
  task: {
    status: TaskStatus;
    public: boolean;
    title: string;
    place: string | null;
    assignees: string[];
  };
  details?: string | null;
  byline: string;
  children?: ReactNode;
}) {
  return (
    <>
      <article className="glass ann-detail">
        <div className="ann-detail-top">
          <span className={`st ${STATUS_TONE[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
          {!task.public && <PrivateFlag />}
        </div>
        <h2>{task.title}</h2>
        {task.place && (
          <p className="meta">
            <span>
              <Icon name="pin" small />
              {task.place}
            </span>
          </p>
        )}
        {details && <p className="task-details">{details}</p>}
        <p className="ann-by">{byline}</p>
      </article>
      {children}
      <div className="glass" style={{ padding: "4px 0", marginTop: 10 }}>
        <div className="list-row">
          <span className="who-av">
            <Icon name="user" small />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>
              {task.assignees.length ? task.assignees.join(", ") : "Поки ніхто"}
            </b>
            <span className="sub">Виконують</span>
          </span>
        </div>
      </div>
    </>
  );
}
