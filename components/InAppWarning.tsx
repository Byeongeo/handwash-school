"use client";

import { useEffect, useState } from "react";

// 카카오톡·네이버·인스타그램 등 메신저 인앱 브라우저는 음성(Web Speech)·카메라가 제대로 동작하지 않음
const IN_APP_PATTERN = /KAKAOTALK|NAVER\(inapp|Instagram|Line\/|FB_IAB|FBAN/i;

export function InAppWarning() {
  const [agent, setAgent] = useState("");
  useEffect(() => {
    setAgent(navigator.userAgent);
  }, []);
  if (!IN_APP_PATTERN.test(agent)) return null;
  const isKakao = /KAKAOTALK/i.test(agent);
  return (
    <div className="inapp-warning">
      ⚠️ 지금 {isKakao ? "카카오톡" : "앱"} 내부 브라우저로 열려 있어 <b>음성·카메라가 동작하지 않습니다.</b> 오른쪽
      위 메뉴(⋮ 또는 공유 버튼)에서 <b>"다른 브라우저로 열기"(크롬)</b>를 눌러 주세요.
    </div>
  );
}
