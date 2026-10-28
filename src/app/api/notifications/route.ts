import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/api-auth";
import { listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Notificações do membro atual (mais recentes primeiro) e quantas sem ler. */
export async function GET(request: NextRequest) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20)));
  return NextResponse.json(await listNotifications(auth.member.id, limit));
}
