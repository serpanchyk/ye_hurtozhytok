import type { Board, Role } from "./db/schema";

export type Actor = { id: number; roles: readonly Role[]; blocked?: boolean };

type WithRoles = { roles: readonly Role[]; blocked?: boolean };

/**
 * The site manager can do everything every role can, plus manage roles.
 * A blocked person holds no role's rights until unblocked.
 */
export function isSiteManager(actor: WithRoles): boolean {
  return !actor.blocked && actor.roles.includes("site_manager");
}

/** Has the student council's rights: members, the head, the site manager. */
export function isCouncil(actor: WithRoles): boolean {
  if (actor.blocked) return false;
  return (
    actor.roles.includes("council") ||
    actor.roles.includes("council_head") ||
    isSiteManager(actor)
  );
}

/** Has the squad's rights: members, the head, the site manager. */
export function isSquad(actor: WithRoles): boolean {
  if (actor.blocked) return false;
  return (
    actor.roles.includes("squad") ||
    actor.roles.includes("squad_head") ||
    isSiteManager(actor)
  );
}

/** Anyone signed in, not blocked, with a room in the profile may book. */
export function canBook(actor: Actor & { room: string | null }): boolean {
  return !actor.blocked && !!actor.room;
}

/** Own bookings until they end; the council may cancel anyone's. */
export function canCancel(
  actor: Actor,
  booking: { residentId: number },
): boolean {
  return booking.residentId === actor.id || isCouncil(actor);
}

/** Only the person washing frees the machine early. */
export function canRelease(
  actor: Actor,
  booking: { residentId: number },
): boolean {
  return booking.residentId === actor.id;
}

/** Only the site manager blocks people: anyone but themselves or another site manager. */
export function canBlock(
  actor: Actor,
  target: { id: number; roles: readonly Role[] },
): boolean {
  return (
    isSiteManager(actor) && target.id !== actor.id && !isSiteManager(target)
  );
}

/** Only the site manager hands out and takes away roles. */
export function canManageRoles(actor: Actor): boolean {
  return isSiteManager(actor);
}

/**
 * A site manager may take away any role except their own site-manager role,
 * so the app is never left without someone who manages roles.
 */
export function canRevokeRole(
  actor: Actor & { email: string },
  grant: { email: string; role: Role },
): boolean {
  if (!canManageRoles(actor)) return false;
  return !(
    grant.role === "site_manager" &&
    grant.email.toLowerCase() === actor.email.toLowerCase()
  );
}

type AnnouncementRef = {
  authorId: number;
  status: "pending" | "published" | "rejected";
  audience: "all" | "squad";
  deletedAt: number | null;
};

/** Any resident who is not blocked may propose an announcement. */
export function canProposeAnnouncement(actor: Actor): boolean {
  return !actor.blocked;
}

/** The council and the site manager publish without review and decide on proposals. */
export function canPublishAnnouncements(actor: Actor): boolean {
  return !actor.blocked && isCouncil(actor);
}

/**
 * Published ones are for everyone (squad-only ones for the squad); a proposal
 * is seen only by its author and by those who decide on it.
 */
export function canSeeAnnouncement(actor: Actor, a: AnnouncementRef): boolean {
  if (a.deletedAt !== null) return false;
  if (a.status === "published") return a.audience === "all" || isSquad(actor);
  return a.authorId === actor.id || canPublishAnnouncements(actor);
}

/** Deciders edit and remove any; the author only their own proposal still under review. */
export function canEditAnnouncement(actor: Actor, a: AnnouncementRef): boolean {
  if (a.deletedAt !== null) return false;
  if (canPublishAnnouncements(actor)) return true;
  return !actor.blocked && a.authorId === actor.id && a.status === "pending";
}

type TaskRef = {
  board: Board;
  public: boolean;
  createdBy: number;
  deletedAt: number | null;
};

/**
 * Keeps a board: adds, edits, takes, moves cards and sees private ones.
 * The council keeps its board, the squad its own; the site manager both.
 */
export function canManageBoard(actor: WithRoles, board: Board): boolean {
  return board === "council" ? isCouncil(actor) : isSquad(actor);
}

/** Public cards are for everyone; private ones only for those who keep the board. */
export function canSeeTask(actor: Actor, task: TaskRef): boolean {
  if (task.deletedAt !== null) return false;
  return task.public || canManageBoard(actor, task.board);
}

/** The card's author, the board's head and the site manager remove cards. */
export function canDeleteTask(actor: Actor, task: TaskRef): boolean {
  if (task.deletedAt !== null || !canManageBoard(actor, task.board))
    return false;
  const head = task.board === "council" ? "council_head" : "squad_head";
  return (
    task.createdBy === actor.id ||
    actor.roles.includes(head) ||
    isSiteManager(actor)
  );
}

/** Any resident who is not blocked may write a complaint. */
export function canWriteComplaint(actor: Actor): boolean {
  return !actor.blocked;
}

/**
 * Those who keep the board its card is on handle a complaint (it follows the
 * card when the card is handed over); one about the app, the site manager.
 */
export function canHandleComplaint(
  actor: WithRoles,
  complaint: { board: Board | null },
): boolean {
  return complaint.board
    ? canManageBoard(actor, complaint.board)
    : isSiteManager(actor);
}

/** The author and those who handle it; never anyone else. */
export function canSeeComplaint(
  actor: Actor,
  complaint: { authorId: number | null; board: Board | null },
): boolean {
  return (
    complaint.authorId === actor.id || canHandleComplaint(actor, complaint)
  );
}

/** Leads the squad: its head and the site manager. */
export function leadsSquad(actor: WithRoles): boolean {
  if (actor.blocked) return false;
  return actor.roles.includes("squad_head") || isSiteManager(actor);
}

/** Everyone in the squad stands duty. */
export function canStandShift(person: WithRoles): boolean {
  return isSquad(person);
}

/** Those who lead change anyone's shift; others the ones they made. */
export function canEditShift(
  actor: Actor,
  shift: { createdBy: number },
): boolean {
  return isSquad(actor) && (leadsSquad(actor) || shift.createdBy === actor.id);
}

/** «Не зможу»: the person on duty, or someone who leads the squad. */
export function canLeaveShift(
  actor: Actor,
  shift: { residentId: number | null },
): boolean {
  return (
    shift.residentId !== null &&
    isSquad(actor) &&
    (shift.residentId === actor.id || leadsSquad(actor))
  );
}

/** Those who lead change any patrol; others the ones they recorded. */
export function canEditPatrol(
  actor: Actor,
  patrol: { createdBy: number },
): boolean {
  return canEditShift(actor, patrol);
}
