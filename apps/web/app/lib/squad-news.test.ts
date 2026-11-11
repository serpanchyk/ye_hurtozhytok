import { describe, expect, it } from "vitest";

import {
  cardStatusMessage,
  dayLabel,
  displayName,
  freeShiftMessage,
  isQuietHour,
  morningMessage,
  newCardMessage,
  patrolMessage,
  shiftEventMessage,
  shiftTopMessage,
  summaryLine,
  weekScheduleMessage,
  worthPosting,
} from "./squad-news";

const URL = "https://ehurtozhytok.pages.dev";

describe("cards", () => {
  it("escapes HTML and shows details, place and a link to the card", () => {
    const text = newCardMessage(URL, {
      id: 41,
      title: "Замок <пральня>",
      details: "Ключ прокручується",
      place: "Підвал",
      status: "new",
      authorName: "Софія",
      origin: "board",
    });
    expect(text).toContain("Замок &lt;пральня&gt;");
    expect(text).toContain("Ключ прокручується");
    expect(text).toContain("Де: Підвал");
    expect(text).toContain("Додав(ла): Софія");
    expect(text).toContain(`href="${URL}/work/tasks/41"`);
  });

  it("keeps a complaint's author out of the group", () => {
    const text = newCardMessage(URL, {
      id: 7,
      title: "Шум · 512",
      details: null,
      place: "512",
      status: "new",
      authorName: null,
      origin: "complaint",
    });
    expect(text).toContain("Нове звернення до загону");
    expect(text).not.toContain("Додав");
  });

  it("says who handed a card over from the council", () => {
    const text = newCardMessage(URL, {
      id: 8,
      title: "Двері",
      details: null,
      place: null,
      status: "done",
      authorName: "Олена",
      origin: "council",
    });
    expect(text).toContain("Студрада передала картку");
    expect(text).toContain("Стан: готово");
    expect(text).toContain("Передав(ла): Олена");
  });

  it("shows the state a card came from", () => {
    const text = cardStatusMessage(URL, {
      id: 2,
      title: "Вікно",
      from: "in_progress",
      to: "done",
      changedBy: "Ігор",
    });
    expect(text).toContain("<b>Виконано</b>");
    expect(text).toContain("в роботі → <b>готово</b>");
  });
});

describe("shifts", () => {
  it("labels days as the group is used to", () => {
    expect(dayLabel("2026-10-01")).toBe("Чт · 01.10");
  });

  it("describes a new free shift with its note", () => {
    const text = shiftEventMessage(URL, {
      kind: "created",
      date: "2026-10-01",
      name: null,
      note: "Підміна",
      actorName: "Антон",
    });
    expect(text).toContain("<b>Нова вахта</b> · Чт · 01.10");
    expect(text).toContain("Вахта вільна");
    expect(text).toContain("Примітка: Підміна");
    expect(text).toContain(`href="${URL}/work/schedule?w=2026-09-28"`);
  });

  it("tells apart leaving a shift and being taken off", () => {
    const self = shiftEventMessage(URL, {
      kind: "freed",
      date: "2026-10-01",
      previousName: "Олег",
      note: null,
      actorName: "Олег",
    });
    expect(self).toContain("Олег не зможе.");
    const removed = shiftEventMessage(URL, {
      kind: "freed",
      date: "2026-10-01",
      previousName: "Олег",
      note: null,
      actorName: "Антон",
    });
    expect(removed).toContain("Антон зняв(ла) з вахти: Олег.");
  });

  it("names both people when the person changes", () => {
    const text = shiftEventMessage(URL, {
      kind: "edited",
      date: "2026-10-04",
      previousDate: "2026-10-01",
      name: "Ігор",
      previousName: "Олег",
      note: null,
      actorName: "Антон",
    });
    expect(text).toContain("Перенесено з Чт · 01.10");
    expect(text).toContain("Було: Олег → стало: <b>Ігор</b>");
  });

  it("posts small changes only for today and tomorrow", () => {
    const today = "2026-10-01";
    expect(
      worthPosting({ kind: "created", date: "2026-10-02", who: null }, today),
    ).toBe(true);
    expect(
      worthPosting({ kind: "created", date: "2026-10-05", who: null }, today),
    ).toBe(false);
    expect(
      worthPosting({ kind: "created", date: "2026-10-05", who: 3 }, today),
    ).toBe(true);
    expect(worthPosting({ kind: "signed", date: "2026-10-20" }, today)).toBe(
      true,
    );
    const noteOnly = {
      kind: "edited" as const,
      date: "2026-10-08",
      previousDate: "2026-10-08",
      who: 3,
      previousWho: 3,
    };
    expect(worthPosting(noteOnly, today)).toBe(false);
    expect(worthPosting({ ...noteOnly, who: 4 }, today)).toBe(true);
  });

  it("lists the coming week without Friday and Saturday", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${String(5 + i).padStart(2, "0")}`,
      shift:
        i === 0
          ? {
              name: displayName({ name: "Олег", telegram: "oleg14" }),
              note: null,
            }
          : null,
    }));
    const text = weekScheduleMessage(URL, days);
    expect(text).toContain("Графік вахт · 05.10–11.10");
    expect(text).toContain("<b>Пн · 05.10</b> — Олег (@oleg14)");
    expect(text).not.toContain("Пт · 09.10");
    expect(text).toContain("Потрібні люди на 4 дні.");
  });
});

describe("daily messages", () => {
  it("sums up the morning with today's events and tomorrow", () => {
    const text = morningMessage(URL, {
      today: { date: "2026-10-01", shift: { name: "Олег", note: null } },
      tomorrow: { date: "2026-10-02", shift: null },
      events: [{ title: "Збори загону", time: "20:00" }],
      openCards: 3,
      newCards: 1,
    });
    expect(text).toContain("<b>Сьогодні · Чт · 01.10</b>");
    expect(text).toContain("<b>Вахта:</b> Олег");
    expect(text).toContain("О 20:00: Збори загону");
    expect(text).not.toContain("Завтра");
    expect(text).toContain("Відкритих карток: 3 (нових: 1)");
  });

  it("reminds in the evening only when today's shift has nobody", () => {
    expect(
      freeShiftMessage(URL, {
        date: "2026-10-01",
        shift: { name: "Олег", note: null },
      }),
    ).toBeNull();
    expect(
      freeShiftMessage(URL, { date: "2026-10-01", shift: null }),
    ).toContain("ще ніхто не записався");
    expect(
      freeShiftMessage(URL, { date: "2026-10-02", shift: null }),
    ).toBeNull();
  });

  it("ranks who sat how many shifts", () => {
    const text = shiftTopMessage(URL, [
      { place: 1, name: "Олег", telegram: "oleg14", total: 5, month: 2 },
      { place: 2, name: "Ігор", telegram: null, total: 0, month: 0 },
    ]);
    expect(text).toContain("1. Олег (@oleg14) — <b>5</b> (цього місяця: 2)");
    expect(text).toContain("Ще не чергували: Ігор");
  });
});

describe("patrols and helpers", () => {
  it("posts a patrol with who went and the notes", () => {
    const text = patrolMessage(URL, {
      date: "2026-10-01",
      planned: false,
      edited: false,
      people: ["Олег", "Ігор"],
      notes: null,
      authorName: "Олег",
    });
    expect(text).toContain("<b>Обхід</b> · Чт · 01.10");
    expect(text).toContain("Ходили: Олег, Ігор");
    expect(text).toContain("Без зауважень.");
  });

  it("keeps the night quiet and summarises the first line", () => {
    expect(isQuietHour(23)).toBe(true);
    expect(isQuietHour(7)).toBe(true);
    expect(isQuietHour(8)).toBe(false);
    expect(summaryLine("<b>Нова вахта</b> · Чт\nдалі")).toBe("Нова вахта · Чт");
  });
});
