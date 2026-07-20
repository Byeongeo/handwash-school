"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHandwashCamera } from "@/components/useHandwashCamera";
import { LABELS, sampleCounts, type HandwashSample, type LabelId } from "@/lib/handwash";

const LOCAL_KEY = "handwash-school-pending-samples";
const SETTINGS_KEY = "handwash-school-collect-settings";
// 수집 시작 1회당 이만큼 모이면 자동으로 수집 완료(추가 수집은 다시 수집 시작)
const BATCH_SIZE = 100;
// 서버가 한 번에 500개까지 받으므로 그 아래로 나눠 순차 업로드
const UPLOAD_CHUNK = 400;

type CollectSettings = { setName: string; deviceName: string; label: LabelId };

function loadSettings(): CollectSettings {
  const fallback: CollectSettings = { setName: "default", deviceName: "", label: "palm" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      setName: typeof parsed.setName === "string" && parsed.setName.trim() ? parsed.setName : fallback.setName,
      deviceName: typeof parsed.deviceName === "string" ? parsed.deviceName : fallback.deviceName,
      label: LABELS.some((label) => label.id === parsed.label) ? (parsed.label as LabelId) : fallback.label
    };
  } catch {
    return fallback;
  }
}

export function CollectClient() {
  const [selectedLabel, setSelectedLabel] = useState<LabelId>(() => loadSettings().label);
  const [setName, setSetName] = useState(() => loadSettings().setName);
  const [deviceName, setDeviceName] = useState(() => loadSettings().deviceName);
  const [trainerCode, setTrainerCode] = useState("");
  const [pendingSamples, setPendingSamples] = useState<HandwashSample[]>(() => loadPendingSamples());
  const [isSampling, setIsSampling] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [uploadState, setUploadState] = useState("아직 업로드하지 않았습니다.");

  const selectedLabelRef = useRef<LabelId>(selectedLabel);
  const setNameRef = useRef(setName);
  const deviceNameRef = useRef(deviceName);
  const isSamplingRef = useRef(false);
  const lastSampleAtRef = useRef(0);
  const batchCountRef = useRef(0);

  selectedLabelRef.current = selectedLabel;
  setNameRef.current = setName.trim() || "default";
  deviceNameRef.current = deviceName.trim();
  isSamplingRef.current = isSampling;

  const onFrame = useCallback((frame: { feature: number[] | null; handCount: number; now: number }) => {
    if (!isSamplingRef.current || !frame.feature || frame.handCount === 0) return;
    if (frame.now - lastSampleAtRef.current < 320) return;
    lastSampleAtRef.current = frame.now;
    const sample: HandwashSample = {
      label: selectedLabelRef.current,
      feature: frame.feature,
      createdAt: new Date().toISOString(),
      source: "collect",
      device: deviceNameRef.current,
      setName: setNameRef.current
    };
    setPendingSamples((prev) => {
      const next = [...prev, sample];
      savePendingSamples(next);
      return next;
    });
    batchCountRef.current += 1;
    setBatchCount(Math.max(0, batchCountRef.current));
    if (batchCountRef.current >= BATCH_SIZE) {
      isSamplingRef.current = false;
      setIsSampling(false);
      const short = LABELS.find((label) => label.id === selectedLabelRef.current)?.short || "";
      speak(`${short} ${BATCH_SIZE}개 수집 완료. 다음 라벨을 고르세요.`);
    }
  }, []);

  const camera = useHandwashCamera({ samples: pendingSamples, onFrame });
  const counts = useMemo(() => sampleCounts(pendingSamples), [pendingSamples]);

  // 세트 이름·기기 메모·현재 라벨을 기기에 자동 저장(다음 방문 때 복원)
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ setName: setName.trim() || "default", deviceName: deviceName.trim(), label: selectedLabel })
      );
    } catch {
      /* noop */
    }
  }, [setName, deviceName, selectedLabel]);

  const toggleSampling = () => {
    if (isSamplingRef.current) {
      isSamplingRef.current = false;
      setIsSampling(false);
      return;
    }
    batchCountRef.current = 0;
    setBatchCount(0);
    const short = LABELS.find((label) => label.id === selectedLabelRef.current)?.short || "";
    speak(`${short} 수집 시작`);
    setIsSampling(true);
  };

  const addSingle = () => {
    batchCountRef.current = -BATCH_SIZE; // 단발 저장은 자동 완료 카운트에서 제외
    setIsSampling(true);
    window.setTimeout(() => setIsSampling(false), 380);
  };

  const uploadSamples = async () => {
    const all = pendingSamples;
    if (all.length === 0) {
      setUploadState("업로드할 샘플이 없습니다.");
      return;
    }
    // 업로드 중 새 샘플이 섞이지 않도록 수집 중지
    isSamplingRef.current = false;
    setIsSampling(false);

    const chunks: HandwashSample[][] = [];
    for (let index = 0; index < all.length; index += UPLOAD_CHUNK) {
      chunks.push(all.slice(index, index + UPLOAD_CHUNK));
    }

    let uploadedCount = 0;
    const dropUploaded = () => {
      setPendingSamples((prev) => {
        const rest = prev.slice(uploadedCount);
        savePendingSamples(rest);
        return rest;
      });
    };

    for (let index = 0; index < chunks.length; index += 1) {
      setUploadState(`업로드 중… ${index + 1}/${chunks.length} 묶음 (${uploadedCount}/${all.length}개 완료)`);
      try {
        const res = await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trainerCode,
            setName: setName.trim() || "default",
            device: deviceName.trim(),
            samples: chunks[index]
          })
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          dropUploaded();
          setUploadState(
            `${uploadedCount}개는 저장됨 · 나머지 실패: ${data?.message || "업로드에 실패했습니다."} 다시 눌러 이어서 올리세요.`
          );
          speak("업로드가 중간에 실패했습니다. 다시 시도하세요.");
          return;
        }
        uploadedCount += chunks[index].length;
      } catch {
        dropUploaded();
        setUploadState(`${uploadedCount}개는 저장됨 · 네트워크 오류로 중단. 다시 눌러 이어서 올리세요.`);
        speak("네트워크 오류로 업로드가 중단되었습니다.");
        return;
      }
    }

    dropUploaded();
    setUploadState(`${uploadedCount}개 샘플을 Google Sheets에 저장했습니다.`);
    speak(`${uploadedCount}개 샘플 업로드 완료`);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ kind: "handwash-school-samples", samples: pendingSamples }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handwash-samples-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const samples = Array.isArray(parsed) ? parsed : parsed.samples;
      if (!Array.isArray(samples)) throw new Error("samples missing");
      const valid = samples.filter(
        (sample) =>
          typeof sample.label === "string" &&
          Array.isArray(sample.feature) &&
          sample.feature.every((value: unknown) => typeof value === "number")
      ) as HandwashSample[];
      setPendingSamples(valid);
      savePendingSamples(valid);
      setUploadState(`${valid.length}개 샘플을 불러왔습니다.`);
    } catch {
      setUploadState("샘플 JSON을 읽지 못했습니다.");
    }
  };

  const clearSamples = () => {
    if (!window.confirm("브라우저에 모아둔 샘플을 모두 지울까요? Google Sheets에 이미 업로드한 샘플은 지워지지 않습니다.")) return;
    setPendingSamples([]);
    savePendingSamples([]);
    setUploadState("브라우저 임시 샘플을 비웠습니다.");
  };

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
            <button type="button" onClick={() => void camera.toggleFacing()}>
              카메라 전환 ({camera.facing === "user" ? "화면 쪽" : "바깥 쪽"})
            </button>
            <select
              aria-label="현재 라벨"
              value={selectedLabel}
              onChange={(event) => setSelectedLabel(event.target.value as LabelId)}
            >
              {LABELS.map((label) => (
                <option value={label.id} key={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
            <button className={isSampling ? "danger" : "primary"} type="button" onClick={toggleSampling}>
              {isSampling ? `수집 완료 (${batchCount}/${BATCH_SIZE})` : "수집 시작"}
            </button>
            <span className="toolbar-count">
              이 라벨 {counts[selectedLabel]}개 · 전체 {pendingSamples.length}개
            </span>
            <span className="status-note">{camera.message}</span>
          </div>
          <div className={"viewer" + (camera.mirrored ? " mirrored" : "")}>
            <video ref={camera.videoRef} playsInline muted />
            <canvas ref={camera.canvasRef} />
            {camera.status !== "running" && <div className="viewer-message">휴대폰이나 패드를 실제 수돗가 각도에 놓고 카메라를 시작하세요.</div>}
          </div>
          <div className="metric-strip">
            <div>
              <span className="label">현재 라벨</span>
              <strong>{LABELS.find((label) => label.id === selectedLabel)?.short}</strong>
            </div>
            <div>
              <span className="label">손 감지</span>
              <strong>{camera.handCount}</strong>
            </div>
            <div>
              <span className="label">현재 판정</span>
              <strong>{camera.prediction ? LABELS.find((label) => label.id === camera.prediction?.label)?.short : "대기"}</strong>
            </div>
            <div>
              <span className="label">신뢰도</span>
              <strong>{camera.prediction ? `${Math.round(camera.prediction.confidence * 100)}%` : "0%"}</strong>
            </div>
          </div>
        </section>

        <aside>
          <section className="side-panel">
            <p className="eyebrow">샘플 수집</p>
            <h1>수집 설정</h1>
            <p className="status-note">
              라벨 선택과 수집 시작·완료는 카메라 위 툴바에서 합니다. 아래 값은 이 기기에 자동 저장됩니다.
            </p>
            <div className="field">
              <label htmlFor="setName">샘플 세트 이름</label>
              <input id="setName" value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="예: 3학년_수돗가A" />
            </div>
            <div className="field">
              <label htmlFor="deviceName">기기/장소 메모</label>
              <input id="deviceName" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="예: 보건실 패드" />
            </div>
            <div className="button-row">
              <button type="button" onClick={addSingle}>
                1개 저장
              </button>
              <span className="status-note">미세 보강용: 현재 프레임 1장만 저장</span>
            </div>
          </section>

          <section className="side-panel">
            <h2>브라우저 임시 샘플</h2>
            <div className="counts">
              {LABELS.map((label) => (
                <div className="count-row" key={label.id}>
                  <span>{label.short}</span>
                  <b>{counts[label.id]}</b>
                </div>
              ))}
            </div>
            <div className="field">
              <label htmlFor="trainerCode">수집 코드</label>
              <input id="trainerCode" value={trainerCode} onChange={(event) => setTrainerCode(event.target.value)} placeholder="교사용 코드" />
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={uploadSamples}>
                묶음 업로드
              </button>
              <button type="button" onClick={exportJson}>
                JSON 백업
              </button>
            </div>
            <div className="button-row">
              <label className="button">
                JSON 가져오기
                <input hidden type="file" accept="application/json" onChange={(event) => void importJson(event.target.files?.[0])} />
              </label>
              <button className="danger" type="button" onClick={clearSamples}>
                임시 샘플 삭제
              </button>
            </div>
            <p className="status-note">{uploadState}</p>
          </section>
        </aside>
      </section>
    </main>
  );
}

function loadPendingSamples(): HandwashSample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingSamples(samples: HandwashSample[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(samples));
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}
