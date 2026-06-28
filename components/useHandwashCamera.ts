"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildFeature,
  classify,
  HAND_CONNECTIONS,
  type HandwashSample,
  type Prediction,
  TASKS_VERSION
} from "@/lib/handwash";

type FrameInfo = {
  feature: number[] | null;
  prediction: Prediction | null;
  handCount: number;
  dt: number;
  now: number;
  video: HTMLVideoElement;
};

type UseHandwashCameraOptions = {
  samples?: HandwashSample[];
  onFrame?: (info: FrameInfo) => void;
};

type CameraStatus = "idle" | "loading" | "ready" | "running" | "error";

type Landmark = { x: number; y: number; z?: number };

export function useHandwashCamera({ samples = [], onFrame }: UseHandwashCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastFrameRef = useRef(performance.now());
  const samplesRef = useRef(samples);
  const onFrameRef = useRef(onFrame);

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [message, setMessage] = useState("카메라를 시작하세요.");
  const [handCount, setHandCount] = useState(0);
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  samplesRef.current = samples;
  onFrameRef.current = onFrame;

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    clearCanvas(canvasRef.current);
    setStatus(landmarkerRef.current ? "ready" : "idle");
    setMessage("카메라가 꺼졌습니다.");
  }, []);

  const loadModel = useCallback(async () => {
    if (landmarkerRef.current) return;
    setStatus("loading");
    setMessage("MediaPipe 모델을 불러오는 중입니다.");
    try {
      const vision = await importCdn(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`);
      const fileset = await vision.FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`
      );
      landmarkerRef.current = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      }).catch(() =>
        vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.45,
          minHandPresenceConfidence: 0.45,
          minTrackingConfidence: 0.45
        })
      );
      setStatus("ready");
      setMessage("모델 준비 완료");
    } catch (error) {
      console.error(error);
      setStatus("error");
      setMessage("MediaPipe 모델을 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    }
  }, []);

  const loop = useCallback((now: number) => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    const dt = Math.min((now - lastFrameRef.current) / 1000, 0.2);
    lastFrameRef.current = now;

    if (video && canvas && landmarker && video.readyState >= 2 && video.videoWidth > 0) {
      resizeCanvas(canvas);
      const results = landmarker.detectForVideo(video, now);
      const landmarks = (results.landmarks || []) as Landmark[][];
      const feature = buildFeature({ landmarks });
      const nextPrediction = classify(feature, samplesRef.current);
      drawHands(canvas, video, landmarks);
      setHandCount(landmarks.length);
      setPrediction(nextPrediction);
      onFrameRef.current?.({
        feature,
        prediction: nextPrediction,
        handCount: landmarks.length,
        dt,
        now,
        video
      });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const startCamera = useCallback(async () => {
    await loadModel();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMessage("이 브라우저에서는 카메라를 사용할 수 없습니다.");
      return;
    }
    try {
      stopCamera();
      setMessage("카메라 권한을 확인하는 중입니다.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      runningRef.current = true;
      lastFrameRef.current = performance.now();
      setStatus("running");
      setMessage("손을 화면 중앙에 보여 주세요.");
      rafRef.current = requestAnimationFrame(loop);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setMessage("카메라를 열지 못했습니다. 권한, HTTPS 접속, 다른 앱의 카메라 사용 여부를 확인하세요.");
    }
  }, [loadModel, loop, stopCamera]);

  useEffect(() => {
    void loadModel();
    return () => stopCamera();
  }, [loadModel, stopCamera]);

  return {
    videoRef,
    canvasRef,
    status,
    message,
    handCount,
    prediction,
    startCamera,
    stopCamera
  };
}

async function importCdn(url: string): Promise<any> {
  return new Function("url", "return import(url)")(url);
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawHands(canvas: HTMLCanvasElement, video: HTMLVideoElement, hands: Landmark[][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = getVideoRect(canvas, video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  hands.forEach((landmarks, handIndex) => {
    const color = handIndex === 0 ? "#12827f" : "#d7643c";
    ctx.lineWidth = Math.max(2, canvas.width / 420);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    for (const [from, to] of HAND_CONNECTIONS) {
      const a = toCanvasPoint(landmarks[from], rect);
      const b = toCanvasPoint(landmarks[to], rect);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const landmark of landmarks) {
      const point = toCanvasPoint(landmark, rect);
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(3, canvas.width / 260), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function getVideoRect(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const canvasAspect = canvas.width / canvas.height;
  const videoAspect = video.videoWidth / video.videoHeight;
  if (!Number.isFinite(videoAspect) || videoAspect <= 0) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }
  if (canvasAspect > videoAspect) {
    const height = canvas.height;
    const width = height * videoAspect;
    return { x: (canvas.width - width) / 2, y: 0, width, height };
  }
  const width = canvas.width;
  const height = width / videoAspect;
  return { x: 0, y: (canvas.height - height) / 2, width, height };
}

function toCanvasPoint(landmark: Landmark, rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x + landmark.x * rect.width,
    y: rect.y + landmark.y * rect.height
  };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
