import { prisma } from "@/lib/db";
import { apiError, HttpError } from "@/lib/security";
import { assertRadarOrigin, radarUser } from "@/lib/radar/access";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertRadarOrigin(request); const user = await radarUser(request); const { id } = await context.params;
    const changed = await prisma.radarAlert.updateMany({ where: { id, userId: user.id }, data: { status: "paused", activeUntil: new Date() } });
    if (!changed.count) throw new HttpError(404, "Alert not found.");
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
