import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/team";

export const dynamic = "force-dynamic";

/** Quem sou e que papel tenho. A UI usa isso para mostrar ou ocultar o que é de admin. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ member: null }, { status: 403 });
  return NextResponse.json({ member });
}
