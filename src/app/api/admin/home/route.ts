import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireApiAdmin } from "@/lib/rbac";
import { readJson, validationError } from "@/lib/api";
import { loadHomeAdmin, saveHomeSettings } from "@/server/services/home";
import { homeSettingsUpdateSchema } from "@/server/validators/home";
import { writeAudit } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  return NextResponse.json(await loadHomeAdmin());
}

export async function PATCH(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = homeSettingsUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const settings = await saveHomeSettings(parsed.data, auth.user.id);

  await writeAudit({
    userId: auth.user.id,
    action: "home.settings.update",
    entity: "HomePage",
    entityId: "home",
    metadata: { fields: Object.keys(parsed.data) },
  });

  // The page reads the session to redirect signed-in visitors, so it already renders per
  // request — this drops any cached data alongside it and keeps the save correct if the
  // landing page is ever made cacheable.
  revalidatePath("/");

  return NextResponse.json({ settings });
}
