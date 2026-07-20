"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useHandwashCamera } from "@/components/useHandwashCamera";
import { LABELS, sampleCounts, type HandwashSample, type LabelId } from "@/lib/handwash";

const LOCAL_KEY = "handwash-school-pending-samples";

export function CollectClient() {
  const [selectedLabel, setSelectedLabel] = useState<LabelId>("palm");
  const [setName, setSetName] = useState("default");
  const [deviceName, setDeviceName] = useState("");
  const [trainerCode, setTrainerCode] = useState("");
  const [pendingSamples, setPendingSamples] = useState<HandwashSample[]>(() => loadPendingSamples());
  const [isSampling, setIsSampling] = useState(false);
  const [uploadState, setUploadState] = useState("아직 업로드하지 않았습니다.");

  const selectedLabelRef = useRef<LabelId>(selectedLabel);
  const setNameRef = useRef(setName);
  const deviceNameRef = useRef(deviceName);
  const isSamplingRef = useRef(false);
  const lastSampleAtRef = useRef(0);

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
  }, []);

  const camera = useHandwashCamera({ samples: pendingSamples, onFrame });
  const counts = useMemo(() => sampleCounts(pendingSamples), [pendingSamples]);

  const addSingle = () => {
    setIsSampling(true);
    window.setTimeout(() => setIsSampling(false), 380);
  };

  const uploadSamples = async () => {
    if (pendingSamples.length === 0) {
      setUploadState("업로드할 샘플이 없습니다.");
      return;
    }
    setUploadState("샘플을 업로드하는 중입니다.");
    try {
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerCode,
          setName: setName.trim() || "default",
          device: deviceName.trim(),
          samples: pendingSamples
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setUploadState(data?.message || "업로드에 실패했습니다.");
        return;
      }
      setUploadState(`${data.saved || pendingSamples.length}개 샘플을 Google Sheets에 저장했습니다.`);
      setPendingSamples([]);
      savePendingSamples([]);
    } catch {
      setUploadState("서버에 연결하지 못했습니다. 네트워크를 확인하세요.");
    }
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
            <h1>동작 라벨을 고르고 샘플을 모으세요</h1>
            <div className="field">
              <label htmlFor="setName">샘플 세트 이름</label>
              <input id="setName" value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="예: 3학년_수돗가A" />
            </div>
            <div className="field">
              <label htmlFor="deviceName">기기/장소 메모</label>
              <input id="deviceName" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="예: 보건실 패드" />
            </div>
            <div className="field">
              <label htmlFor="labelSelect">현재 라벨</label>
              <select id="labelSelect" value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value as LabelId)}>
                {LABELS.map((label) => (
                  <option value={label.id} key={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="button-row">
              <button type="button" onClick={addSingle}>
                1개 저장
              </button>
              <button className={isSampling ? "danger" : "primary"} type="button" onClick={() => setIsSampling((value) => !value)}>
                {isSampling ? "수집 중지" : "연속 수집"}
              </button>
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
