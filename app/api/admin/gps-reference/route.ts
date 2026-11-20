import { gpsReferenceSchema } from "@freery/shared";
import { auth } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { firstIssue } from "@/lib/api";
import { clearGpsReference, getGpsReference, setGpsReference } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The true position of a receiver.
 *
 * The researcher stands the receiver at a place whose position they know and
 * marks it on the map. Every fix the receiver records is then measured against
 * this point, and that is the accuracy of the GPS.
 *
 *   POST    mark the place. The old mark for that receiver is replaced.
 *   DELETE  take the mark away, so the page has no ground truth again.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("The body is not valid JSON", 400);
  }

  const parsed = gpsReferenceSchema.safeParse(body);
  if (!parsed.success) {
    return fail(firstIssue(parsed.error), 400);
  }

  const reference = await setGpsReference(parsed.data);
  return ok({ reference });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) return fail("Which receiver?", 400);

  await clearGpsReference(deviceId);
  return ok({ reference: await getGpsReference(deviceId) });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return fail("Not signed in", 401);

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) return fail("Which receiver?", 400);

  return ok({ reference: await getGpsReference(deviceId) });
}
