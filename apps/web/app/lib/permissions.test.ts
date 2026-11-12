import { describe, expect, it } from "vitest";

import {
  canBlock,
  canEditAnnouncement,
  canProposeAnnouncement,
  canDecideAnnouncements,
  canPublishAnnouncements,
  canSeeAnnouncement,
  canSeeResidents,
  canBook,
  canCancel,
  canAssignTask,
  canDeleteComplaintCard,
  canDeleteTask,
  canExportSquad,
  canSetUpBot,
  canManageBoard,
  canSeeTask,
  canManageRoles,
  canRelease,
  canRevokeRole,
  isCouncil,
  isSquad,
} from "./permissions";

const resident = { id: 1, roles: [], room: "612" };
const other = { id: 2, roles: [], room: "608" };
const council = { id: 3, roles: ["council" as const], room: "601" };
const head = { id: 5, roles: ["council_head" as const], room: "603" };
const squad = { id: 6, roles: ["squad" as const], room: "404" };
const manager = {
  id: 7,
  roles: ["site_manager" as const],
  room: "509",
  email: "anton@lpnu.ua",
};

describe("permissions", () => {
  it("needs a room and no block to book", () => {
    expect(canBook(resident)).toBe(true);
    expect(canBook({ ...resident, room: null })).toBe(false);
    expect(canBook({ ...resident, blocked: true })).toBe(false);
  });
  it("counts members, the head and the site manager as the council", () => {
    expect(isCouncil(council)).toBe(true);
    expect(isCouncil(head)).toBe(true);
    expect(isCouncil(manager)).toBe(true);
    expect(isCouncil(squad)).toBe(false);
    expect(isCouncil(resident)).toBe(false);
  });
  it("gives the site manager the squad's rights too", () => {
    expect(isSquad(squad)).toBe(true);
    expect(isSquad(manager)).toBe(true);
    expect(isSquad(council)).toBe(false);
  });
  it("lets people cancel their own bookings and the council any", () => {
    expect(canCancel(resident, { residentId: 1 })).toBe(true);
    expect(canCancel(other, { residentId: 1 })).toBe(false);
    expect(canCancel(council, { residentId: 1 })).toBe(true);
    expect(canCancel(head, { residentId: 1 })).toBe(true);
    expect(canCancel(squad, { residentId: 1 })).toBe(false);
    expect(canCancel(manager, { residentId: 1 })).toBe(true);
  });
  it("lets only the owner free a machine early", () => {
    expect(canRelease(resident, { residentId: 1 })).toBe(true);
    expect(canRelease(council, { residentId: 1 })).toBe(false);
  });
  it("leaves blocking to the site manager", () => {
    expect(canBlock(council, other)).toBe(false);
    expect(canBlock(head, other)).toBe(false);
    expect(canBlock(resident, other)).toBe(false);
  });
  it("lets the site manager block anyone but a site manager or themselves", () => {
    expect(canBlock(manager, other)).toBe(true);
    expect(canBlock(manager, council)).toBe(true);
    expect(canBlock(manager, manager)).toBe(false);
    expect(canBlock(manager, { id: 8, roles: ["site_manager"] })).toBe(false);
    expect(canBlock(council, manager)).toBe(false);
  });
  it("takes every role's rights away while someone is blocked", () => {
    const blockedCouncil = { ...council, blocked: true };
    const blockedSquad = { ...squad, blocked: true };
    const blockedManager = { ...manager, blocked: true };
    expect(isCouncil(blockedCouncil)).toBe(false);
    expect(canCancel(blockedCouncil, { residentId: 1 })).toBe(false);
    expect(canCancel(blockedCouncil, { residentId: 3 })).toBe(true);
    expect(isSquad(blockedSquad)).toBe(false);
    expect(isCouncil(blockedManager)).toBe(false);
    expect(canManageRoles(blockedManager)).toBe(false);
    expect(canBlock(blockedManager, other)).toBe(false);
  });
  it("leaves roles to the site manager", () => {
    expect(canManageRoles(manager)).toBe(true);
    expect(canManageRoles(head)).toBe(false);
    expect(canManageRoles(resident)).toBe(false);
  });
  it("never lets the site manager drop their own site-manager role", () => {
    expect(
      canRevokeRole(manager, { email: "x@lpnu.ua", role: "council" }),
    ).toBe(true);
    expect(
      canRevokeRole(manager, { email: "x@lpnu.ua", role: "site_manager" }),
    ).toBe(true);
    expect(
      canRevokeRole(manager, { email: "Anton@lpnu.ua", role: "site_manager" }),
    ).toBe(false);
    expect(
      canRevokeRole(manager, { email: "anton@lpnu.ua", role: "council" }),
    ).toBe(true);
    expect(
      canRevokeRole(
        { ...head, email: "h@lpnu.ua" },
        { email: "x@lpnu.ua", role: "council" },
      ),
    ).toBe(false);
  });
  describe("announcements", () => {
    const pending = {
      authorId: 1,
      status: "pending" as const,
      deletedAt: null,
    };
    const published = { ...pending, status: "published" as const };
    it("lets anyone not blocked propose", () => {
      expect(canProposeAnnouncement(resident)).toBe(true);
      expect(canProposeAnnouncement({ ...resident, blocked: true })).toBe(
        false,
      );
    });
    it("lets the council, the squad and the site manager publish", () => {
      expect(canPublishAnnouncements(council)).toBe(true);
      expect(canPublishAnnouncements(head)).toBe(true);
      expect(canPublishAnnouncements(manager)).toBe(true);
      expect(canPublishAnnouncements(squad)).toBe(true);
      expect(canPublishAnnouncements(resident)).toBe(false);
      expect(canPublishAnnouncements({ ...council, blocked: true })).toBe(
        false,
      );
    });
    it("leaves proposals to the council and the site manager", () => {
      expect(canDecideAnnouncements(council)).toBe(true);
      expect(canDecideAnnouncements(manager)).toBe(true);
      expect(canDecideAnnouncements(squad)).toBe(false);
      expect(canDecideAnnouncements(resident)).toBe(false);
      expect(canSeeAnnouncement(squad, pending)).toBe(false);
    });
    it("shows a proposal only to its author and the deciders", () => {
      expect(canSeeAnnouncement(resident, pending)).toBe(true);
      expect(canSeeAnnouncement(other, pending)).toBe(false);
      expect(canSeeAnnouncement(council, pending)).toBe(true);
      expect(canSeeAnnouncement(other, published)).toBe(true);
      expect(canSeeAnnouncement(other, { ...published, deletedAt: 1 })).toBe(
        false,
      );
    });
    it("lets the author edit only while under review", () => {
      expect(canEditAnnouncement(resident, pending)).toBe(true);
      expect(canEditAnnouncement(resident, published)).toBe(false);
      expect(canEditAnnouncement(other, pending)).toBe(false);
      expect(canEditAnnouncement(council, published)).toBe(true);
    });
    it("lets the squad change only its own published ones", () => {
      expect(canEditAnnouncement(squad, published)).toBe(false);
      expect(
        canEditAnnouncement(squad, { ...published, authorId: squad.id }),
      ).toBe(true);
    });
  });

  describe("task boards", () => {
    const squadHead = { id: 8, roles: ["squad_head" as const], room: "405" };
    const councilCard = {
      board: "council" as const,
      public: true,
      createdBy: council.id,
      deletedAt: null,
    };
    const squadCard = {
      board: "squad" as const,
      public: false,
      createdBy: squad.id,
      deletedAt: null,
    };

    it("lets each side keep only its own board; the site manager both", () => {
      expect(canManageBoard(council, "council")).toBe(true);
      expect(canManageBoard(council, "squad")).toBe(false);
      expect(canManageBoard(squad, "squad")).toBe(true);
      expect(canManageBoard(squad, "council")).toBe(false);
      expect(canManageBoard(manager, "council")).toBe(true);
      expect(canManageBoard(manager, "squad")).toBe(true);
      expect(canManageBoard(resident, "council")).toBe(false);
      expect(canManageBoard({ ...squad, blocked: true }, "squad")).toBe(false);
    });
    it("shows private cards only to those who keep the board", () => {
      expect(canSeeTask(resident, councilCard)).toBe(true);
      expect(canSeeTask(resident, squadCard)).toBe(false);
      expect(canSeeTask(council, squadCard)).toBe(false);
      expect(canSeeTask(squad, squadCard)).toBe(true);
      expect(canSeeTask(squad, { ...squadCard, deletedAt: 1 })).toBe(false);
    });
    it("lets the author, the board's head and the site manager delete", () => {
      expect(canDeleteTask(squad, squadCard)).toBe(true);
      expect(canDeleteTask(squadHead, squadCard)).toBe(true);
      expect(canDeleteTask(manager, squadCard)).toBe(true);
      expect(canDeleteTask({ ...squad, id: 99 }, squadCard)).toBe(false);
      expect(canDeleteTask(head, squadCard)).toBe(false);
      expect(canDeleteTask(head, councilCard)).toBe(true);
    });
    it("shows the residents to the council and the squad", () => {
      expect(canSeeResidents(council)).toBe(true);
      expect(canSeeResidents(squad)).toBe(true);
      expect(canSeeResidents(manager)).toBe(true);
      expect(canSeeResidents(resident)).toBe(false);
      expect(canSeeResidents({ ...squad, blocked: true })).toBe(false);
    });
    it("lets the author, the board's head and the site manager assign", () => {
      expect(canAssignTask(squad, squadCard)).toBe(true);
      expect(canAssignTask({ ...squad, id: 99 }, squadCard)).toBe(false);
      expect(canAssignTask(squadHead, squadCard)).toBe(true);
      expect(canAssignTask(manager, squadCard)).toBe(true);
      expect(canAssignTask(head, squadCard)).toBe(false);
    });
    it("lets only the site manager remove a complaint with its card", () => {
      expect(canDeleteComplaintCard(manager)).toBe(true);
      expect(canDeleteComplaintCard(squadHead)).toBe(false);
      expect(canDeleteComplaintCard(head)).toBe(false);
    });
    it("leaves the squad's Excel to the site manager", () => {
      expect(canExportSquad(manager)).toBe(true);
      expect(canExportSquad(squadHead)).toBe(false);
      expect(canExportSquad(squad)).toBe(false);
      expect(canSetUpBot(manager)).toBe(true);
      expect(canSetUpBot(squadHead)).toBe(false);
    });
  });
});
