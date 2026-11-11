import { describe, expect, it } from "vitest";

import { describeDetails, momentCell } from "./export";

const names = new Map([[5, "Антон"]]);

describe("the change log in Excel", () => {
  it("words a patrol's state as a patrol's, not a card's", () => {
    expect(
      describeDetails(
        '{"date":"2026-11-10","status":"done","people":[5]}',
        names,
        "patrol",
      ),
    ).toBe("дата: 10.11.2026; стан: Був; учасники: Антон");
    expect(describeDetails('{"status":"done"}', names, "task")).toBe(
      "стан: Готово",
    );
  });

  it("names boards and the state a card came from", () => {
    expect(
      describeDetails('{"from":"squad","to":"council"}', names, "task"),
    ).toBe("з: Оперзагін; до: Студрада");
    expect(
      describeDetails('{"from":"in_progress","status":"done"}', names, "task"),
    ).toBe("з: В роботі; стан: Готово");
  });

  it("shows who was on a shift before and after", () => {
    expect(
      describeDetails(
        '{"before":{"residentId":null},"after":{"residentId":5}}',
        names,
        "shift",
      ),
    ).toBe("було: на вахті: вільна; стало: на вахті: Антон");
  });

  it("leaves text that is not JSON as it is", () => {
    expect(describeDetails("not json", names)).toBe("not json");
  });

  it("puts a moment in Kyiv time", () => {
    expect(momentCell(Date.UTC(2026, 10, 10, 22, 15))).toEqual({
      date: "2026-11-11",
      time: "00:15",
    });
  });
});
