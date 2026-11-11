import { redirect } from "react-router";

import type { Route } from "./+types/moved";

// Pages that moved; old links and bookmarks keep working.
const MOVED: Record<string, string> = {
  // «Студрада» and «Люди й ролі» became one page, «Мешканці», now among the
  // work pages.
  "/council": "/work/residents",
  "/roles": "/work/residents",
  "/residents": "/work/residents",
  // Proposals are reviewed in the work pages.
  "/announcements/review": "/work/announcements/review",
};

export function loader({ request }: Route.LoaderArgs) {
  throw redirect(MOVED[new URL(request.url).pathname] ?? "/");
}
