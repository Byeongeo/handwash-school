import { NextResponse } from "next/server";
import { callSheetGet } from "@/lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await callSheetGet("config");
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "설정을 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
