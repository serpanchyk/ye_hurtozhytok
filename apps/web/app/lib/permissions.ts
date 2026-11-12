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

/** Who signed up and where they live: the council, the squad, the site manager. */
export function canSeeResidents(actor: WithRoles): boolean {
  return isCouncil(actor) || isSquad(actor);
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
  deletedAt: number | null;
};

/** Any resident who is not blocked may propose an announcement. */
export function canProposeAnnouncement(actor: Actor): boolean {
  return !actor.blocked;
}

/** The council, the squad and the site manager publish without review. */
export function canPublishAnnouncements(actor: Actor): boolean {
  return !actor.blocked && (isCouncil(actor) || isSquad(actor));
}

/**
 * The council and the site manager decide on proposals and change or remove
 * anyone's announcement.
 */
export function canDecideAnnouncements(actor: Actor): boolean {
  return !actor.blocked && isCouncil(actor);
}

/** Published ones are for everyone; a proposal only for its author and those who decide on it. */
export function canSeeAnnouncement(actor: Actor, a: AnnouncementRef): boolean {
  if (a.deletedAt !== null) return false;
  if (a.status === "published") return true;
  return a.authorId === actor.id || canDecideAnnouncements(actor);
}

/**
 * Deciders edit and remove any; those who publish their own; everyone else
 * only their own proposal still under review.
 */
export function canEditAnnouncement(actor: Actor, a: AnnouncementRef): boolean {
  if (a.deletedAt !== null) return false;
  if (canDecideAnnouncements(actor)) return true;
  if (actor.blocked || a.authorId !== actor.id) return false;
  return a.status === "pending" || canPublishAnnouncements(actor);
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

/** The roles that keep each board, to list who can work on its cards. */
export const BOARD_KEEPERS: Record<Board, readonly Role[]> = {
  council: ["council", "council_head", "site_manager"],
  squad: ["squad", "squad_head", "site_manager"],
};

/** Public cards are for everyone; private ones only for those who keep the board. */
export function canSeeTask(actor: Actor, task: TaskRef): boolean {
  if (task.deletedAt !== null) return false;
  return task.public || canManageBoard(actor, task.board);
}

/**
 * A complaint's card goes only with the complaint itself, and only the site
 * manager removes those (test or junk ones); a real one is turned down.
 */
export function canDeleteComplaintCard(actor: WithRoles): boolean {
  return isSiteManager(actor);
}

/** The card's author, the board's head and the site manager say who works on a card. */
export function canAssignTask(
  actor: Actor,
  task: { board: Board; createdBy: number },
): boolean {
  if (!canManageBoard(actor, task.board)) return false;
  const head = task.board === "council" ? "council_head" : "squad_head";
  return (
    task.createdBy === actor.id ||
    actor.roles.includes(head) ||
    isSiteManager(actor)
  );
}

/** The same people remove cards. */
export function canDeleteTask(actor: Actor, task: TaskRef): boolean {
  return task.deletedAt === null && canAssignTask(actor, task);
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

/** The squad's Excel (shifts, patrols, cards, people, the log) is the site manager's. */
export function canExportSquad(actor: WithRoles): boolean {
  return isSiteManager(actor);
}

/** The squad's Telegram group is connected and looked after by the site manager. */
export function canSetUpBot(actor: WithRoles): boolean {
  return isSiteManager(actor);
}

/** Everyone in the squad stands duty. */
export function canStandShift(person: WithRoles): boolean {
  return isSquad(person);
}

/**
 * Those who lead change any shift. Others only one they added, before its
 * day is over and while nobody else is on it, so no one is taken off a
 * shift by someone who does not lead.
 */
export function canEditShift(
  actor: Actor,
  shift: { createdBy: number; residentId: number | null; date: string },
  today: string,
): boolean {
  if (!isSquad(actor)) return false;
  if (leadsSquad(actor)) return true;
  return (
    shift.createdBy === actor.id &&
    shift.date >= today &&
    (shift.residentId === null || shift.residentId === actor.id)
  );
}

/** «Не зможу»: the person on duty before the day is over, or someone who leads the squad. */
export function canLeaveShift(
  actor: Actor,
  shift: { residentId: number | null; date: string },
  today: string,
): boolean {
  if (shift.residentId === null || !isSquad(actor)) return false;
  if (leadsSquad(actor)) return true;
  return shift.residentId === actor.id && shift.date >= today;
}

/** Those who lead change any patrol; others the ones they recorded. */
export function canEditPatrol(
  actor: Actor,
  patrol: { createdBy: number },
): boolean {
  return isSquad(actor) && (leadsSquad(actor) || patrol.createdBy === actor.id);
}
