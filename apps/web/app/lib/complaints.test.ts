import { describe, expect, it } from "vitest";

import {
  TOPIC_BOARD,
  cardTitle,
  complaintStatus,
  parseComplaintForm,
} from "./complaints";
import {
  canHandleComplaint,
  canSeeComplaint,
  canWriteComplaint,
} from "./permissions";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("complaints", () => {
  it("sends each topic to the right side", () => {
    expect(TOPIC_BOARD.plumbing).toBe("council");
    expect(TOPIC_BOARD.noise).toBe("squad");
    expect(TOPIC_BOARD.app).toBeNull();
  });
  it("takes the state from the card", () => {
    const base = { rejectedAt: null, resolvedAt: null };
    expect(complaintStatus({ ...base, taskStatus: "new" })).toBe("sent");
    expect(complaintStatus({ ...base, taskStatus: "in_progress" })).toBe(
      "in_progress",
    );
    expect(complaintStatus({ ...base, taskStatus: "done" })).toBe("resolved");
    expect(
      complaintStatus({ ...base, rejectedAt: 1, taskStatus: "in_progress" }),
    ).toBe("rejected");
    expect(complaintStatus({ ...base, taskStatus: null })).toBe("sent");
    expect(complaintStatus({ ...base, resolvedAt: 1, taskStatus: null })).toBe(
      "resolved",
    );
  });
  it("names the card by topic and place, not by the author's words", () => {
    expect(cardTitle("noise", "5 поверх")).toBe("Шум · 5 поверх");
    expect(cardTitle("plumbing", null)).toBe("Сантехніка");
  });
  it("needs a topic and a few words", () => {
    expect(parseComplaintForm(form({ topic: "x", body: "текст" })).ok).toBe(
      false,
    );
    expect(parseComplaintForm(form({ topic: "noise", body: "ой" })).ok).toBe(
      false,
    );
    expect(
      parseComplaintForm(
        form({ topic: "noise", body: " Гучна музика ", place: " " }),
      ),
    ).toEqual({
      ok: true,
      values: { topic: "noise", body: "Гучна музика", place: null },
    });
  });
});

describe("complaint permissions", () => {
  const author = { id: 1, roles: [] };
  const other = { id: 2, roles: [] };
  const council = { id: 3, roles: ["council" as const] };
  const squad = { id: 4, roles: ["squad" as const] };
  const manager = { id: 5, roles: ["site_manager" as const] };

  it("lets anyone not blocked write", () => {
    expect(canWriteComplaint(author)).toBe(true);
    expect(canWriteComplaint({ ...author, blocked: true })).toBe(false);
  });
  it("is handled by those who keep its card's board, or the site manager for the app", () => {
    expect(canHandleComplaint(squad, { board: "squad" })).toBe(true);
    expect(canHandleComplaint(council, { board: "squad" })).toBe(false);
    expect(canHandleComplaint(council, { board: null })).toBe(false);
    expect(canHandleComplaint(manager, { board: null })).toBe(true);
  });
  it("is seen only by its author and those who handle it", () => {
    const c = { authorId: author.id, board: "council" as const };
    expect(canSeeComplaint(author, c)).toBe(true);
    expect(canSeeComplaint(other, c)).toBe(false);
    expect(canSeeComplaint(council, c)).toBe(true);
    expect(canSeeComplaint(squad, c)).toBe(false);
  });
});
