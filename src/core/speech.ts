// Read a quote aloud with the best voice this device already has (Web Speech API).
// Nothing is sent anywhere. If the device has no voice for the language, the button is hidden.
const synth: SpeechSynthesis | null = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let voices: SpeechSynthesisVoice[] = [];
const load = () => { if (synth) voices = synth.getVoices(); };
if (synth) {
  load();
  synth.addEventListener?.('voiceschanged', load);
}

// Natural/online neural voices first (Edge: Premwadee/Niwat Online), then good built-ins (iOS Kanya, Google).
const RANK: Record<'th' | 'en', RegExp[]> = {
  th: [/premwadee.*(online|natural)/i, /niwat.*(online|natural)/i, /(online|natural)/i, /premwadee|niwat/i, /kanya/i, /google/i],
  en: [/(online|natural)/i, /samantha|daniel|serena|karen/i, /google (uk|us) english/i],
};

export function bestVoice(lang: 'th' | 'en'): SpeechSynthesisVoice | null {
  const list = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(lang));
  if (!list.length) return null;
  for (const r of RANK[lang]) {
    const v = list.find((x) => r.test(x.name));
    if (v) return v;
  }
  return list.find((v) => v.localService) || list[0];
}

/** Voices load late on some browsers; ask again right before showing the button. */
export function canSpeak(lang: 'th' | 'en') {
  if (!synth) return false;
  load();
  return !!bestVoice(lang);
}

/** Voices arrive late in some browsers: resolve true as soon as one for the language exists (or false after 2 s). */
export function whenVoice(lang: 'th' | 'en'): Promise<boolean> {
  if (canSpeak(lang)) return Promise.resolve(true);
  if (!synth) return Promise.resolve(false);
  return new Promise((done) => {
    const check = () => { if (canSpeak(lang)) { synth.removeEventListener?.('voiceschanged', check); done(true); } };
    synth.addEventListener?.('voiceschanged', check);
    setTimeout(() => { synth.removeEventListener?.('voiceschanged', check); done(canSpeak(lang)); }, 2000);
  });
}

export function speaking() { return !!synth?.speaking; }

export function speak(text: string, lang: 'th' | 'en', onEnd?: () => void) {
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice(lang);
  if (v) u.voice = v;
  u.lang = v?.lang || (lang === 'th' ? 'th-TH' : 'en-GB');
  u.rate = lang === 'th' ? 0.92 : 0.94;
  u.pitch = 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}

export function stopSpeaking() { synth?.cancel(); }
