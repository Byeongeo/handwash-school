// 한국어 음성 안내 공용 유틸 (클라이언트 전용)
// 안드로이드 크롬에서 cancel() 직후 speak()가 조용히 무시되는 버그가 있어
// 짧은 지연 + resume()으로 우회한다. 한국어 보이스가 있으면 명시적으로 지정.

let koVoice: SpeechSynthesisVoice | null = null;

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

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    if (synth.speaking || synth.pending) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1.02;
    if (!koVoice) pickVoice();
    if (koVoice) utterance.voice = koVoice;
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
