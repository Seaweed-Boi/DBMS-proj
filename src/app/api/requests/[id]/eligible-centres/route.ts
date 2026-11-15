import { handler, intParam } from "@/lib/api";
import { eligibleCentres } from "@/lib/services/allocation";

export const dynamic = "force-dynamic";

export const GET = handler(async ({ params }) => ({ centres: await eligibleCentres(intParam(params.id)) }), "allocate");
