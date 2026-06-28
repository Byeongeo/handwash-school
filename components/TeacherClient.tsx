"use client";

import { useEffect, useState } from "react";
import { LABELS } from "@/lib/handwash";

type Summary = {
  ok: boolean;
  config?: Record<string, unknown>;
  sampleCounts?: Record<string, number>;
  recentRecords?: Array<Record<string, unknown>>;
  message?: string;
};

export function TeacherClient() {
  const [summary, setSummary] = useState<Summary>({ ok: false, message: "불러오는 중입니다." });

  useEffect(() => {
    fetch("/api/summary")
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch(() => setSummary({ ok: false, message: "서버에 연결하지 못했습니다." }));
  }, []);

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">교사용</p>
        <h1>샘플과 학생 기록 확인</h1>
        {!summary.ok && <p className="status-note bad">{summary.message || "정보를 불러오지 못했습니다."}</p>}
        {summary.ok && (
          <>
            <div className="stat-grid">
              {LABELS.map((label) => (
                <div className="stat-box" key={label.id}>
                  <strong>{label.short}</strong>
                  <b>{summary.sampleCounts?.[label.id] || 0}</b>
                </div>
              ))}
            </div>
            <section className="panel">
              <h2>설정</h2>
              <div className="two-col">
                {Object.entries(summary.config || {}).map(([key, value]) => (
                  <div key={key}>
                    <strong>{key}</strong>
                    <p>{String(value)}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>최근 기록</h2>
              <div className="record-list">
                {(summary.recentRecords || []).length === 0 && <p className="status-note">아직 저장된 기록이 없습니다.</p>}
                {(summary.recentRecords || []).map((record, index) => (
                  <div className="record-row" key={`${record["시각"]}-${index}`}>
                    <strong>
                      {String(record["이름"] || record["학번"] || "학생")} · {String(record["점수"] || 0)}점
                    </strong>
                    {String(record["시각"] || "")} · 샘플 {String(record["샘플세트"] || "")} · 부족 {String(record["부족단계"] || "없음")}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
