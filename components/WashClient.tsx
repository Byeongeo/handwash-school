"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useHandwashCamera } from "@/components/useHandwashCamera";
import {
  createEmptyProgress,
  labelName,
  LABELS,
  missingStepIds,
  parseStudentPayload,
  STEP_LABEL_IDS,
  STEP_LABELS,
  type HandwashConfig,
  type HandwashSample,
  type Prediction,
  type Student
} from "@/lib/handwash";

const DEFAULT_CONFIG: HandwashConfig = {
  ok: true,
  pointsPerCompletion: 10,
  requiredSeconds: 3,
  confidenceThreshold: 65,
  activeSampleSet: "default",
  displaySec: 4,
  idleTimeoutSec: 20,
  alwaysOn: false,
  allowUnregistered: true,
  messageComplete: "{이름} 학생, 손씻기 6단계를 완료했습니다."
};

export function WashClient() {
  const [samples, setSamples] = useState<HandwashSample[]>([]);
  const [config, setConfig] = useState<HandwashConfig>(DEFAULT_CONFIG);
  const [loadState, setLoadState] = useState("설정과 샘플을 불러오는 중입니다.");
  const [studentInput, setStudentInput] = useState("");
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>(createEmptyProgress());
  const [result, setResult] = useState("");
  const [saveState, setSaveState] = useState("");
  const [qrEnabled, setQrEnabled] = useState(true);

  const configRef = useRef(config);
  const progressRef = useRef(progress);
  const studentRef = useRef<Student | null>(currentStudent);
  const sessionActiveRef = useRef(false);
  const finishingRef = useRef(false);
  const sessionSeqRef = useRef(0);
  const lastHandAtRef = useRef(0);
  const lastCoachAtRef = useRef(0);
  const lastCompletedStepRef = useRef("");
  const lastQrScanAtRef = useRef(0);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrEnabledRef = useRef(qrEnabled);

  configRef.current = config;
  progressRef.current = progress;
  studentRef.current = currentStudent;
  sessionActiveRef.current = sessionActive;
  qrEnabledRef.current = qrEnabled;

  const finishSession = useCallback(async (finalProgress: Record<string, number>) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const mySeq = sessionSeqRef.current;
    setSessionActive(false);
    const cfg = configRef.current;
    const student = studentRef.current || { id: "practice", name: "연습", raw: "practice" };
    const missing = missingStepIds(finalProgress, cfg.requiredSeconds);
    const score = missing.length === 0 ? cfg.pointsPerCompletion : Math.round((STEP_LABELS.length - missing.length) * (cfg.pointsPerCompletion / STEP_LABELS.length));
    const displayName = student.name || student.id;
    setResult(`${displayName} 완료: ${score}점`);
    speak(cfg.messageComplete.replaceAll("{이름}", displayName).replaceAll("{점수}", String(score)));
    setSaveState("Google Sheets에 기록을 저장하는 중입니다.");

    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record: {
            studentId: student.id,
            studentName: student.name,
            rawStudent: student.raw,
            completed: missing.length === 0,
            score,
            requiredSeconds: cfg.requiredSeconds,
            confidenceThreshold: cfg.confidenceThreshold,
            sampleSet: cfg.activeSampleSet,
            missingSteps: missing,
            steps: Object.fromEntries(
              STEP_LABELS.map((label) => [label.id, Number((finalProgress[label.id] || 0).toFixed(2))])
            )
          }
        })
      });
      const data = await res.json();
      setSaveState(data?.ok ? "기록 저장 완료" : data?.message || "기록 저장 실패");
    } catch {
      setSaveState("기록 저장 실패: 네트워크를 확인하세요.");
    } finally {
      window.setTimeout(() => {
        // 표시 시간 사이에 다음 학생이 QR로 새 세션을 시작했다면 초기화하지 않음
        if (sessionSeqRef.current !== mySeq) return;
        finishingRef.current = false;
        setCurrentStudent(null);
        setProgress(createEmptyProgress());
        setResult("");
        setSaveState("");
      }, Math.max(2500, cfg.displaySec * 1000));
    }
  }, []);

  const startStudent = useCallback((student: Student) => {
    if (!student.id) return;
    sessionSeqRef.current += 1;
    setCurrentStudent(student);
    studentRef.current = student;
    const emptyProgress = createEmptyProgress();
    setProgress(emptyProgress);
    progressRef.current = emptyProgress;
    setSessionActive(true);
    setResult("");
    setSaveState("");
    lastHandAtRef.current = performance.now();
    lastCoachAtRef.current = performance.now();
    lastCompletedStepRef.current = "";
    finishingRef.current = false;
    speak(`${student.name || student.id} 학생, 손씻기를 시작합니다.`);
  }, []);

  const cancelSession = useCallback(() => {
    sessionSeqRef.current += 1;
    finishingRef.current = false;
    setSessionActive(false);
    setCurrentStudent(null);
    const emptyProgress = createEmptyProgress();
    setProgress(emptyProgress);
    progressRef.current = emptyProgress;
    setResult("");
    setSaveState("손이 보이지 않아 세션을 취소했습니다(기록 없음).");
    speak("손이 보이지 않아 손씻기를 취소했습니다.");
  }, []);

  const onFrame = useCallback(
    (frame: { prediction: Prediction | null; handCount: number; dt: number; now: number; video: HTMLVideoElement }) => {
      if (!sessionActiveRef.current && qrEnabledRef.current) scanQr(frame.video, frame.now, lastQrScanAtRef, qrCanvasRef, (raw) => startStudent(parseStudentPayload(raw)));
      if (!sessionActiveRef.current || finishingRef.current) return;

      const cfg = configRef.current;
      if (frame.handCount > 0) {
        lastHandAtRef.current = frame.now;
      } else if (frame.now - lastHandAtRef.current > cfg.idleTimeoutSec * 1000) {
        cancelSession();
        return;
      }
      const prediction = frame.prediction;
      if (prediction && prediction.confidence * 100 >= cfg.confidenceThreshold && STEP_LABEL_IDS.has(prediction.label)) {
        const label = prediction.label;
        setProgress((prev) => {
          const next = {
            ...prev,
            [label]: Math.min(cfg.requiredSeconds, (prev[label] || 0) + frame.dt)
          };
          progressRef.current = next;
          if (next[label] >= cfg.requiredSeconds && lastCompletedStepRef.current !== label) {
            lastCompletedStepRef.current = label;
            speak(`${labelName(label)} 단계 완료`);
          }
          if (STEP_LABELS.every((step) => (next[step.id] || 0) >= cfg.requiredSeconds)) {
            void finishSession(next);
          }
          return next;
        });
      }

      if (frame.now - lastCoachAtRef.current > 6500) {
        const missing = STEP_LABELS.find((label) => (progressRef.current[label.id] || 0) < cfg.requiredSeconds);
        if (missing) speak(`${missing.short} 단계를 더 해 주세요.`);
        lastCoachAtRef.current = frame.now;
      }
    },
    [finishSession, startStudent, cancelSession]
  );

  const camera = useHandwashCamera({ samples, onFrame });

  useEffect(() => {
    async function load() {
      try {
        const cfgRes = await fetch("/api/config");
        const cfg = await cfgRes.json();
        if (cfg?.ok) setConfig({ ...DEFAULT_CONFIG, ...cfg });
        const sampleSet = cfg?.activeSampleSet || DEFAULT_CONFIG.activeSampleSet;
        const samplesRes = await fetch(`/api/samples?set=${encodeURIComponent(sampleSet)}`);
        const sampleData = await samplesRes.json();
        if (sampleData?.ok) {
          setSamples(sampleData.samples || []);
          setLoadState(`${sampleData.samples?.length || 0}개 샘플을 불러왔습니다.`);
        } else {
          setLoadState(sampleData?.message || "샘플을 불러오지 못했습니다.");
        }
      } catch {
        setLoadState("서버 설정을 불러오지 못했습니다. Vercel 환경변수와 Apps Script URL을 확인하세요.");
      }
    }
    void load();
  }, []);

  const manualStart = () => {
    startStudent(parseStudentPayload(studentInput || "practice 연습"));
  };

  const reset = () => {
    setSessionActive(false);
    setCurrentStudent(null);
    setProgress(createEmptyProgress());
    setResult("");
    setSaveState("");
    finishingRef.current = false;
  };

  const sampleSummary = useMemo(() => {
    const byLabel = Object.fromEntries(LABELS.map((label) => [label.id, 0])) as Record<string, number>;
    for (const sample of samples) byLabel[sample.label] = (byLabel[sample.label] || 0) + 1;
    return byLabel;
  }, [samples]);

  return (
    <main className="page-shell">
      <section className="workbench">
        <section className="camera-panel">
          <div className="toolbar">
            <button className="primary" type="button" onClick={camera.startCamera}>
              카메라 시작
            </button>
            <button type="button" onClick={camera.stopCamera}>
              카메라 끄기
            </button>
            <button type="button" onClick={() => setQrEnabled((value) => !value)}>
              QR {qrEnabled ? "켜짐" : "꺼짐"}
            </button>
            <span className="status-note">{camera.message}</span>
          </div>
          <div className="viewer">
            <video ref={camera.videoRef} playsInline muted />
            <canvas ref={camera.canvasRef} />
            {camera.status !== "running" && <div className="viewer-message">카메라를 시작한 뒤 QR 또는 수동 입력으로 세션을 시작하세요.</div>}
          </div>
          <div className="metric-strip">
            <div>
              <span className="label">학생</span>
              <strong>{currentStudent ? currentStudent.name || currentStudent.id : "대기"}</strong>
            </div>
            <div>
              <span className="label">현재 판정</span>
              <strong>{camera.prediction ? labelName(camera.prediction.label) : "대기"}</strong>
            </div>
            <div>
              <span className="label">신뢰도</span>
              <strong>{camera.prediction ? `${Math.round(camera.prediction.confidence * 100)}%` : "0%"}</strong>
            </div>
            <div>
              <span className="label">손 감지</span>
              <strong>{camera.handCount}</strong>
            </div>
          </div>
        </section>

        <aside>
          <section className="side-panel">
            <p className="eyebrow">학생 실행</p>
            <h1>손씻기 6단계 완료 확인</h1>
            <p className="status-note">{loadState}</p>
            <div className="field">
              <label htmlFor="studentInput">수동 학생 ID</label>
              <input id="studentInput" value={studentInput} onChange={(event) => setStudentInput(event.target.value)} placeholder="예: 3-2-15 홍길동" />
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={manualStart}>
                세션 시작
              </button>
              <button type="button" onClick={reset}>
                초기화
              </button>
            </div>
          </section>

          <section className="side-panel">
            <h2>진행 상황</h2>
            <p className="status-note">
              목표 {config.requiredSeconds}초 · 인정 기준 {config.confidenceThreshold}% · 샘플 세트 {config.activeSampleSet}
            </p>
            <div className="counts">
              {STEP_LABELS.map((label) => {
                const seconds = progress[label.id] || 0;
                const percent = Math.min(100, (seconds / config.requiredSeconds) * 100);
                return (
                  <div className={`step-row ${percent >= 100 ? "done" : ""}`} key={label.id}>
                    <span>{label.short}</span>
                    <span className="bar">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                    <b>{seconds.toFixed(1)}s</b>
                  </div>
                );
              })}
            </div>
            {result && <p className="result-box">{result}</p>}
            {saveState && <p className="status-note good">{saveState}</p>}
          </section>

          <section className="side-panel">
            <h2>샘플 상태</h2>
            <div className="counts">
              {LABELS.map((label) => (
                <div className="count-row" key={label.id}>
                  <span>{label.short}</span>
                  <b>{sampleSummary[label.id] || 0}</b>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function scanQr(
  video: HTMLVideoElement,
  now: number,
  lastQrScanAtRef: MutableRefObject<number>,
  qrCanvasRef: MutableRefObject<HTMLCanvasElement | null>,
  onScan: (raw: string) => void
) {
  if (now - lastQrScanAtRef.current < 800 || !video.videoWidth) return;
  lastQrScanAtRef.current = now;
  const canvas = qrCanvasRef.current || document.createElement("canvas");
  qrCanvasRef.current = canvas;
  const maxWidth = 640;
  const ratio = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
  const width = Math.max(1, Math.round(video.videoWidth * ratio));
  const height = Math.max(1, Math.round(video.videoHeight * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
  if (code?.data) onScan(code.data);
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}
