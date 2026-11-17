import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, assertSameOrigin, ownerWhere, readJson, watchInput } from "@/lib/security";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const input = await readJson(request, watchInput);
    const watch = await prisma.watch.upsert({ where: ownerWhere(user.id), create: { ...input, userId: user.id }, update: input });
    return Response.json({ watch });
  } catch (error) { return apiError(error); }
}
