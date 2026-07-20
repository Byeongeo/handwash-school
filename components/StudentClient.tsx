"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useHandwashCamera } from "@/components/useHandwashCamera";
import { speak, warmSpeech } from "@/lib/speech";
import {
  createEmptyProgress,
  labelName,
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

// 발판/터치로 카메라를 켠 뒤 QR 없이 이 시간이 지나면 대기 화면으로 복귀(기기 발열·배터리 보호)
const ARM_TIMEOUT_MS = 45_000;
const COACH_INTERVAL_MS = 6_500;

type Phase = "idle" | "armed" | "washing" | "result";

export function StudentClient() {
  const [samples, setSamples] = useState<HandwashSample[]>([]);
  const [config, setConfig] = useState<HandwashConfig>(DEFAULT_CONFIG);
  const [loadState, setLoadState] = useState("설정과 샘플을 불러오는 중입니다.");
  const [phase, setPhase] = useState<Phase>("idle");
  const [student, setStudent] = useState<Student | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>(createEmptyProgress());
  const [resultText, setResultText] = useState("");
  const [saveState, setSaveState] = useState("");

  const configRef = useRef(config);
  const phaseRef = useRef<Phase>("idle");
  const studentRef = useRef<Student | null>(null);
  const progressRef = useRef(progress);
  const tokenRef = useRef(0);
  const finishingRef = useRef(false);
  const lastHandAtRef = useRef(0);
  const lastCoachAtRef = useRef(0);
  const announcedStepsRef = useRef<Set<string>>(new Set());
  const lastQrScanAtRef = useRef(0);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const startCameraRef = useRef<(() => Promise<void>) | null>(null);
  const stopCameraRef = useRef<(() => void) | null>(null);

  configRef.current = config;

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (armTimerRef.current != null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    if (resultTimerRef.current != null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const goIdle = useCallback(() => {
    clearTimers();
    stopCameraRef.current?.();
    studentRef.current = null;
    setStudent(null);
    const empty = createEmptyProgress();
    progressRef.current = empty;
    setProgress(empty);
    setResultText("");
    setSaveState("");
    setPhaseBoth("idle");
  }, [clearTimers, setPhaseBoth]);

  const goArmed = useCallback(
    (opts?: { startCam?: boolean }) => {
      clearTimers();
      studentRef.current = null;
      setStudent(null);
      const empty = createEmptyProgress();
      progressRef.current = empty;
      setProgress(empty);
      setResultText("");
      setSaveState("");
      setPhaseBoth("armed");
      if (opts?.startCam) void startCameraRef.current?.();
      // 항상 대기 모드(config alwaysOn=Y)에서는 카메라를 끄지 않고 종일 QR 대기
      if (!configRef.current.alwaysOn) {
        armTimerRef.current = window.setTimeout(() => {
          if (configRef.current.alwaysOn) return;
          if (phaseRef.current === "armed") goIdle();
        }, ARM_TIMEOUT_MS);
      }
    },
    [clearTimers, setPhaseBoth, goIdle]
  );

  const startStudent = useCallback(
    (next: Student) => {
      if (!next.id) return;
      clearTimers();
      tokenRef.current += 1;
      finishingRef.current = false;
      studentRef.current = next;
      setStudent(next);
      const empty = createEmptyProgress();
      progressRef.current = empty;
      setProgress(empty);
      setResultText("");
      setSaveState("");
      lastHandAtRef.current = performance.now();
      lastCoachAtRef.current = performance.now();
      announcedStepsRef.current = new Set();
      setPhaseBoth("washing");
      speak(`${next.name || next.id} 학생, 손씻기를 시작합니다.`);
    },
    [clearTimers, setPhaseBoth]
  );

  const cancelSession = useCallback(() => {
    tokenRef.current += 1;
    finishingRef.current = false;
    speak("손이 보이지 않아 손씻기를 취소했습니다. 처음부터 다시 시작해 주세요.");
    goArmed();
  }, [goArmed]);

  const finishSession = useCallback(
    async (finalProgress: Record<string, number>) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const myToken = tokenRef.current;
      setPhaseBoth("result");
      const cfg = configRef.current;
      const current = studentRef.current || { id: "practice", name: "연습", raw: "practice" };
      const missing = missingStepIds(finalProgress, cfg.requiredSeconds);
      const score =
        missing.length === 0
          ? cfg.pointsPerCompletion
          : Math.round((STEP_LABELS.length - missing.length) * (cfg.pointsPerCompletion / STEP_LABELS.length));
      const displayName = current.name || current.id;
      setResultText(`${displayName} · ${score}점`);
      speak(
        `${cfg.messageComplete.replaceAll("{이름}", displayName).replaceAll("{점수}", String(score))} ${score}점을 받았습니다. 참 잘했어요!`
      );
      setSaveState("기록을 저장하는 중입니다.");

      try {
        const res = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            record: {
              studentId: current.id,
              studentName: current.name,
              rawStudent: current.raw,
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
        if (tokenRef.current === myToken) {
          if (data?.ok) {
            const total =
              typeof data.totalScore === "number" ? ` · 누적 ${data.totalScore}점 (${data.completedCount || 1}회)` : "";
            setSaveState(`기록 저장 완료${total}`);
          } else {
            setSaveState(data?.message || "기록 저장 실패");
          }
        }
      } catch {
        if (tokenRef.current === myToken) setSaveState("기록 저장 실패: 네트워크를 확인하세요.");
      } finally {
        resultTimerRef.current = window.setTimeout(() => {
          if (tokenRef.current !== myToken) return;
          finishingRef.current = false;
          goArmed();
        }, Math.max(2500, cfg.displaySec * 1000));
      }
    },
    [setPhaseBoth, goArmed]
  );

  const onFrame = useCallback(
    (frame: { prediction: Prediction | null; handCount: number; dt: number; now: number; video: HTMLVideoElement }) => {
      const currentPhase = phaseRef.current;
      if (currentPhase === "armed" || currentPhase === "result") {
        scanQr(frame.video, frame.now, lastQrScanAtRef, qrCanvasRef, (raw) => {
          const next = parseStudentPayload(raw);
          if (!next.id) return;
          startStudent(next);
        });
      }
      if (phaseRef.current !== "washing" || finishingRef.current) return;

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
          // 완료 안내는 단계당 딱 한 번만
          if (next[label] >= cfg.requiredSeconds && !announcedStepsRef.current.has(label)) {
            announcedStepsRef.current.add(label);
            speak(`${labelName(label)} 단계 완료`);
          }
          if (STEP_LABELS.every((step) => (next[step.id] || 0) >= cfg.requiredSeconds)) {
            void finishSession(next);
          }
          return next;
        });
      }

      if (frame.now - lastCoachAtRef.current > COACH_INTERVAL_MS) {
        // 아직 완료되지 않은 단계만 안내(적게 남으면 목록으로)
        const missing = STEP_LABELS.filter((label) => (progressRef.current[label.id] || 0) < cfg.requiredSeconds);
        if (missing.length > 0) {
          speak(
            missing.length <= 3
              ? `남은 단계: ${missing.map((label) => label.short).join(", ")}`
              : `${missing[0].short} 단계를 더 해 주세요.`
          );
        }
        lastCoachAtRef.current = frame.now;
      }
    },
    [startStudent, cancelSession, finishSession]
  );

  const camera = useHandwashCamera({ samples, onFrame });
  startCameraRef.current = camera.startCamera;
  stopCameraRef.current = camera.stopCamera;

  const armFromIdle = useCallback(() => {
    speak("QR 명찰을 카메라에 보여 주세요.");
    goArmed({ startCam: true });
  }, [goArmed]);

  const skipResult = useCallback(() => {
    tokenRef.current += 1;
    finishingRef.current = false;
    goArmed();
  }, [goArmed]);

  // 설정·샘플 로드
  useEffect(() => {
    warmSpeech();
    async function load() {
      try {
        const cfgRes = await fetch("/api/config");
        const cfg = await cfgRes.json();
        if (cfg?.ok) setConfig({ ...DEFAULT_CONFIG, ...cfg });
        const sampleSet = cfg?.activeSampleSet || DEFAULT_CONFIG.activeSampleSet;
        const samplesRes = await fetch(`/api/samples?set=${encodeURIComponent(sampleSet)}`);
        const sampleData = await samplesRes.json();
        if (sampleData?.ok) {
          const list = sampleData.samples || [];
          setSamples(list);
          setLoadState(list.length < 21 ? `샘플이 ${list.length}개뿐입니다. 교사에게 알려 주세요.` : `${list.length}개 샘플 준비 완료`);
        } else {
          setLoadState(sampleData?.message || "샘플을 불러오지 못했습니다.");
        }
      } catch {
        setLoadState("서버 설정을 불러오지 못했습니다. 교사에게 알려 주세요.");
      }
    }
    void load();
  }, []);

  // 풋스위치(키보드로 인식되는 페달)·아무 키
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (phaseRef.current === "idle") {
        event.preventDefault();
        armFromIdle();
      } else if (phaseRef.current === "result") {
        event.preventDefault();
        skipResult();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armFromIdle, skipResult]);

  // 키오스크 화면 꺼짐 방지(지원 브라우저에서만)
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (type: string) => Promise<never> } }).wakeLock?.request("screen") ?? null;
      } catch {
        /* noop */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      try {
        void lock?.release?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  // 언마운트 정리
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const onStageClick = () => {
    if (phaseRef.current === "idle") armFromIdle();
    else if (phaseRef.current === "result") skipResult();
  };

  return (
    <main className="kiosk" onClick={onStageClick}>
      {phase === "idle" && (
        <div className="kiosk-idle">
          <div className="kiosk-emoji">👣</div>
          <h1>{config.alwaysOn ? "화면을 한 번 눌러 시작하세요" : "발판을 밟으면 시작합니다"}</h1>
          <p>
            {config.alwaysOn
              ? "한 번 켜 두면 하루 종일 QR 대기 상태가 됩니다"
              : "화면을 눌러도 됩니다 · QR 명찰을 준비하세요"}
          </p>
          <p className="kiosk-note">{loadState}</p>
        </div>
      )}

      {phase !== "idle" && (
        <div className="kiosk-top">
          {phase === "armed" && <h1>QR 명찰을 카메라에 보여 주세요</h1>}
          {phase === "washing" && <h1>{student?.name || student?.id} 학생 · 손씻기 6단계</h1>}
          {phase === "result" && <h1 className="kiosk-score">🎉 {resultText}</h1>}
          <p className="kiosk-sub">
            {phase === "washing"
              ? `모든 단계를 ${config.requiredSeconds}초 이상 해 주세요`
              : phase === "armed"
                ? config.alwaysOn
                  ? "QR 명찰을 보여 주면 바로 시작됩니다"
                  : "QR이 없으면 잠시 뒤 대기 화면으로 돌아갑니다"
                : saveState || " "}
          </p>
        </div>
      )}

      {/* 카메라는 항상 DOM에 두고 표시만 토글(ref 안정) */}
      <div className={"kiosk-viewer" + (phase === "idle" ? " off" : "") + (camera.mirrored ? " mirrored" : "")}>
        <video ref={camera.videoRef} playsInline muted />
        <canvas ref={camera.canvasRef} />
        {phase !== "idle" && camera.status !== "running" && <div className="viewer-message">{camera.message}</div>}
      </div>

      {(phase === "washing" || phase === "result") && (
        <div className="kiosk-steps">
          {STEP_LABELS.map((label) => {
            const seconds = progress[label.id] || 0;
            const done = seconds >= config.requiredSeconds;
            const percent = Math.min(100, (seconds / config.requiredSeconds) * 100);
            return (
              <div className={`kiosk-step ${done ? "done" : ""}`} key={label.id}>
                <span>{label.short}</span>
                <span className="bar">
                  <span style={{ width: `${percent}%` }} />
                </span>
                <b>{done ? "완료" : `${seconds.toFixed(1)}s`}</b>
              </div>
            );
          })}
        </div>
      )}
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

