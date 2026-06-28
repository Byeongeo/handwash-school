export const TASKS_VERSION = "0.10.18";

export type LabelId = "palm" | "back" | "between" | "fingers" | "thumb" | "nails" | "other";

export type HandwashLabel = {
  id: LabelId;
  name: string;
  short: string;
};

export type HandwashSample = {
  label: LabelId;
  feature: number[];
  createdAt?: string;
  source?: string;
  device?: string;
  setName?: string;
};

export type Prediction = {
  label: LabelId;
  confidence: number;
  nearestDistance: number;
};

export type Student = {
  id: string;
  name: string;
  raw: string;
};

export type HandwashConfig = {
  ok: boolean;
  pointsPerCompletion: number;
  requiredSeconds: number;
  confidenceThreshold: number;
  activeSampleSet: string;
  displaySec: number;
  allowUnregistered: boolean;
  messageComplete: string;
};

export type SessionRecord = {
  studentId: string;
  studentName: string;
  rawStudent: string;
  completed: boolean;
  score: number;
  requiredSeconds: number;
  confidenceThreshold: number;
  sampleSet: string;
  missingSteps: string[];
  steps: Record<string, number>;
};

export const LABELS: HandwashLabel[] = [
  { id: "palm", name: "1 손바닥 마주대기", short: "손바닥" },
  { id: "back", name: "2 손등 문지르기", short: "손등" },
  { id: "between", name: "3 손가락 사이/깍지", short: "깍지" },
  { id: "fingers", name: "4 손가락 마주잡기", short: "손가락" },
  { id: "thumb", name: "5 엄지 문지르기", short: "엄지" },
  { id: "nails", name: "6 손톱 밑/손목", short: "손톱/손목" },
  { id: "other", name: "기타/대기 동작", short: "기타" }
];

export const STEP_LABELS = LABELS.filter((label) => label.id !== "other");
export const STEP_LABEL_IDS = new Set(STEP_LABELS.map((label) => label.id));

export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17]
];

type Landmark = { x: number; y: number; z?: number };

export function labelName(id: string) {
  return LABELS.find((label) => label.id === id)?.short || id;
}

export function createEmptyProgress() {
  return Object.fromEntries(STEP_LABELS.map((label) => [label.id, 0]));
}

export function parseStudentPayload(rawValue: string): Student {
  const raw = String(rawValue || "").trim();
  let id = raw;
  let name = "";

  try {
    const url = new URL(raw);
    id =
      url.searchParams.get("studentId") ||
      url.searchParams.get("student") ||
      url.searchParams.get("id") ||
      url.searchParams.get("code") ||
      raw;
    name = url.searchParams.get("name") || "";
  } catch {
    const parts = raw
      .split(/[,\t|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      id = parts[0];
      name = parts.slice(1).join(" ");
    } else {
      const spaceParts = raw.split(/\s+/).filter(Boolean);
      if (spaceParts.length >= 2) {
        id = spaceParts[0];
        name = spaceParts.slice(1).join(" ");
      }
    }
  }

  return {
    id: id.slice(0, 80),
    name: name.slice(0, 80),
    raw
  };
}

export function buildFeature(results: { landmarks?: Landmark[][] } | null): number[] | null {
  const hands = (results?.landmarks || [])
    .map((landmarks) => {
      const centroid = landmarks.reduce<{ x: number; y: number; z: number }>(
        (acc, landmark) => ({
          x: acc.x + landmark.x / landmarks.length,
          y: acc.y + landmark.y / landmarks.length,
          z: acc.z + (landmark.z ?? 0) / landmarks.length
        }),
        { x: 0, y: 0, z: 0 }
      );
      return { landmarks, centroid };
    })
    .sort((a, b) => a.centroid.x - b.centroid.x)
    .slice(0, 2);

  if (hands.length === 0) return null;

  const feature: number[] = [];
  const scales: number[] = [];
  for (const hand of hands) {
    const wrist = hand.landmarks[0];
    const scale =
      Math.max(
        ...hand.landmarks.map((landmark) =>
          Math.hypot(landmark.x - wrist.x, landmark.y - wrist.y, ((landmark.z || 0) - (wrist.z || 0)) * 0.4)
        )
      ) || 1;
    scales.push(scale);
    for (const landmark of hand.landmarks) {
      feature.push((landmark.x - wrist.x) / scale);
      feature.push((landmark.y - wrist.y) / scale);
      feature.push(((landmark.z || 0) - (wrist.z || 0)) / scale);
    }
  }

  if (hands.length === 1) {
    feature.push(...Array(63).fill(0));
  }

  const left = hands[0];
  const right = hands[1];
  if (left && right) {
    const avgScale = (scales[0] + scales[1]) / 2 || 1;
    feature.push((right.centroid.x - left.centroid.x) / avgScale);
    feature.push((right.centroid.y - left.centroid.y) / avgScale);
    feature.push((right.centroid.z - left.centroid.z) / avgScale);
    feature.push(Math.hypot(right.centroid.x - left.centroid.x, right.centroid.y - left.centroid.y) / avgScale);
    feature.push(scales[0] / Math.max(scales[1], 0.0001));
    feature.push(1);
  } else {
    feature.push(0, 0, 0, 0, 0, 0);
  }

  return l2Normalize(feature);
}

export function classify(feature: number[] | null, samples: HandwashSample[]): Prediction | null {
  if (!feature || samples.length < 3) return null;
  const usable = samples.filter((sample) => Array.isArray(sample.feature) && sample.feature.length > 0);
  if (usable.length < 3) return null;

  const distances = usable
    .map((sample) => ({
      label: sample.label,
      distance: euclidean(feature, sample.feature)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(9, usable.length));

  const scores = new Map<LabelId, number>();
  let total = 0;
  for (const item of distances) {
    const weight = 1 / Math.max(item.distance, 0.0001);
    scores.set(item.label, (scores.get(item.label) || 0) + weight);
    total += weight;
  }

  const [label, score] = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
  return {
    label,
    confidence: total ? score / total : 0,
    nearestDistance: distances[0]?.distance ?? 0
  };
}

export function sampleCounts(samples: HandwashSample[]) {
  const counts = Object.fromEntries(LABELS.map((label) => [label.id, 0])) as Record<LabelId, number>;
  for (const sample of samples) {
    if (sample.label in counts) counts[sample.label] += 1;
  }
  return counts;
}

export function missingStepIds(progress: Record<string, number>, requiredSeconds: number) {
  return STEP_LABELS.filter((label) => (progress[label.id] || 0) < requiredSeconds).map((label) => label.id);
}

function l2Normalize(values: number[]) {
  const norm = Math.hypot(...values);
  if (!norm) return values;
  return values.map((value) => value / norm);
}

function euclidean(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (!length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum / length);
}
