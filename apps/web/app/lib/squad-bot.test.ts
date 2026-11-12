import { describe, expect, it } from "vitest";

import type { Task } from "./db/schema";
import { newsFor, type Facts } from "./squad-bot.server";

const URL = "https://ehurtozhytok.pages.dev";

const card = (over: Partial<Task> = {}): Task => ({
  id: 7,
  board: "squad",
  title: "Шум · 5 поверх, 512",
  details: "Подробиці лише для загону",
  place: "5 поверх, 512",
  status: "new",
  public: false,
  patrolId: null,
  createdBy: 1,
  createdAt: 0,
  updatedAt: 0,
  doneAt: null,
  deletedAt: null,
  ...over,
});

function facts(t: Task): Facts {
  return {
    name: (id) => (id === null ? null : id === 1 ? "Олег" : "Ігор"),
    card: new Map([[t.id, t]]),
    helpers: new Map(),
    shift: new Map(),
    patrol: new Map(),
  };
}

const entry = (action: string, details: object | null, at = Date.now()) => ({
  id: 1,
  actorId: 1,
  action,
  entity: "task",
  entityId: 7,
  details: details && JSON.stringify(details),
  createdAt: at,
});

describe("what the bot tells the squad's group", () => {
  it("posts a complaint's card without the person who complained", () => {
    const text = newsFor(
      entry("task.created", { board: "squad", complaint: true }),
      facts(card()),
      URL,
    );
    expect(text).toContain("Шум · 5 поверх, 512");
    expect(text).not.toContain("Олег");
  });

  it("keeps the council's board out of the group", () => {
    const council = card({ board: "council" });
    expect(
      newsFor(entry("task.created", { board: "council" }), facts(council), URL),
    ).toBeNull();
    // Logged on the council's board, moved to the squad since: still not news.
    expect(
      newsFor(entry("task.taken", { board: "council" }), facts(card()), URL),
    ).toBeNull();
  });

  it("tells about cards handed over either way", () => {
    expect(
      newsFor(
        entry("task.moved", { from: "squad", to: "council" }),
        facts(card({ board: "council" })),
        URL,
      ),
    ).toContain("Картку передано студраді");
    expect(
      newsFor(
        entry("task.moved", { from: "council", to: "squad" }),
        facts(card()),
        URL,
      ),
    ).toContain("Студрада передала картку");
  });

  it("names who was given a card and who gave it", () => {
    const text = newsFor(
      entry("task.assigned", { board: "squad", added: [2], removed: [] }),
      facts(card()),
      URL,
    );
    expect(text).toContain("Призначено виконавців");
    expect(text).toContain("Виконують: Ігор");
    expect(text).toContain("Призначив(ла): Олег");
  });

  it("lists the people a new card was given to at once", () => {
    const text = newsFor(
      entry("task.created", { board: "squad", assignees: [2] }),
      facts(card({ status: "in_progress" })),
      URL,
    );
    expect(text).toContain("Виконують: Ігор");
    expect(text).not.toContain("можна взяти собі");
  });

  it("says nothing of a card deleted since", () => {
    expect(
      newsFor(
        entry("task.created", { board: "squad" }),
        facts(card({ deletedAt: 1 })),
        URL,
      ),
    ).toBeNull();
  });
});
