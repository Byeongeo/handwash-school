// 한국어 음성 안내 공용 유틸 (클라이언트 전용)
// 안드로이드 크롬에서 cancel() 직후 speak()가 조용히 무시되는 버그가 있어
// 짧은 지연 + resume()으로 우회한다. 한국어 보이스가 있으면 명시적으로 지정.

let koVoice: SpeechSynthesisVoice | null = null;
let beepContext: AudioContext | null = null;

function pickVoice() {
  try {
    const voices = window.speechSynthesis.getVoices();
    koVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith("ko")) || null;
  } catch {
    koVoice = null;
  }
}

export function warmSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  pickVoice();
  try {
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
  } catch {
    /* noop */
  }
}

export function speak(
  text: string,
  hooks?: { onstart?: () => void; onend?: () => void; onerror?: (message: string) => void }
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    if (synth.speaking || synth.pending) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1.02;
    if (!koVoice) pickVoice();
    if (koVoice) utterance.voice = koVoice;
    utterance.onstart = () => hooks?.onstart?.();
    utterance.onend = () => hooks?.onend?.();
    utterance.onerror = (event) => hooks?.onerror?.((event as SpeechSynthesisErrorEvent).error || "unknown");
    window.setTimeout(() => {
      try {
        synth.resume();
        synth.speak(utterance);
      } catch {
        /* noop */
      }
    }, 60);
  } catch {
    /* noop */
  }
}

// TTS와 무관한 순수 효과음 — 스피커·볼륨 자체를 검사할 때 사용
export function beep(durationMs = 300, frequency = 880) {
  if (typeof window === "undefined") return;
  try {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!beepContext) beepContext = new Ctor();
    if (beepContext.state === "suspended") void beepContext.resume();
    const osc = beepContext.createOscillator();
    const gain = beepContext.createGain();
    osc.connect(gain);
    gain.connect(beepContext.destination);
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.5, beepContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, beepContext.currentTime + durationMs / 1000);
    osc.start();
    osc.stop(beepContext.currentTime + durationMs / 1000);
  } catch {
    /* noop */
  }
}

// 음성엔진 상태 요약(소리 테스트 진단용)
export function speechSupportInfo() {
  const samsungBrowser = typeof navigator !== "undefined" && /SamsungBrowser/i.test(navigator.userAgent);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { supported: false, voices: 0, korean: false, samsungBrowser };
  }
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = window.speechSynthesis.getVoices();
  } catch {
    /* noop */
  }
  return {
    supported: true,
    voices: voices.length,
    korean: voices.some((voice) => voice.lang?.toLowerCase().startsWith("ko")),
    samsungBrowser
  };
}
