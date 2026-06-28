import "server-only";

function appsScriptUrl(): string {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) throw new Error("APPS_SCRIPT_URL 환경변수가 설정되지 않았습니다.");
  return url;
}

function sharedSecret(): string {
  return process.env.APP_SHARED_SECRET || "";
}

export function trainerCode(): string {
  return process.env.TRAINER_CODE || "";
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: "Apps Script 응답을 JSON으로 해석하지 못했습니다. 웹앱 URL과 배포 권한을 확인하세요.",
      raw: text.slice(0, 300)
    };
  }
}

export async function callSheetGet(action: string, params: Record<string, string> = {}) {
  const url = new URL(appsScriptUrl());
  url.searchParams.set("action", action);
  if (sharedSecret()) url.searchParams.set("secret", sharedSecret());
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { redirect: "follow", cache: "no-store" });
  return safeJson(res);
}

export async function callSheetPost(action: string, body: Record<string, unknown>) {
  const res = await fetch(appsScriptUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, secret: sharedSecret(), ...body }),
    redirect: "follow",
    cache: "no-store"
  });
  return safeJson(res);
}
