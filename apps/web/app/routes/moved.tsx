import { redirect } from "react-router";

import type { Route } from "./+types/moved";

// Pages that moved; old links and bookmarks keep working.
const MOVED: Record<string, string> = {
  // «Студрада» and «Люди й ролі» became one page, «Мешканці».
  "/council": "/residents",
  "/roles": "/residents",
  // Proposals are reviewed in «Праця».
  "/announcements/review": "/work/announcements/review",
};

export function loader({ request }: Route.LoaderArgs) {
  throw redirect(MOVED[new URL(request.url).pathname] ?? "/");
}
