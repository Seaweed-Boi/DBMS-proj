import { handler } from "@/lib/api";
import { AVAILABILITY, SKILLS } from "@/lib/constants";
import { listVolunteers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const skill = sp.get("skill");
  const availability = sp.get("availability");
  return {
    volunteers: await listVolunteers({
      skill: skill && (SKILLS as readonly string[]).includes(skill) ? skill : undefined,
      availability: availability && (AVAILABILITY as readonly string[]).includes(availability) ? availability : undefined,
    }),
  };
});
