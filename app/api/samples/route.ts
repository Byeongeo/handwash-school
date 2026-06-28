import { NextRequest, NextResponse } from "next/server";
import { callSheetGet, callSheetPost, trainerCode } from "@/lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const setName = req.nextUrl.searchParams.get("set") || "";
    const data = await callSheetGet("samples", { set: setName });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "샘플을 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const expectedCode = trainerCode();
    if (expectedCode && String(body?.trainerCode || "") !== expectedCode) {
      return NextResponse.json({ ok: false, message: "수집 코드가 맞지 않습니다." }, { status: 403 });
    }
    if (!Array.isArray(body?.samples) || body.samples.length === 0) {
      return NextResponse.json({ ok: false, message: "저장할 샘플이 없습니다." }, { status: 400 });
    }
    if (body.samples.length > 500) {
      return NextResponse.json({ ok: false, message: "한 번에 500개 이하로 업로드하세요." }, { status: 400 });
    }
    const data = await callSheetPost("samples", {
      setName: String(body?.setName || "default"),
      device: String(body?.device || ""),
      samples: body.samples
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "샘플 저장에 실패했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
