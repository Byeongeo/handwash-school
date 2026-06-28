import { NextRequest, NextResponse } from "next/server";
import { callSheetPost } from "@/lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.record || typeof body.record !== "object") {
      return NextResponse.json({ ok: false, message: "저장할 기록이 없습니다." }, { status: 400 });
    }
    const data = await callSheetPost("record", { record: body.record });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "기록 저장에 실패했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
