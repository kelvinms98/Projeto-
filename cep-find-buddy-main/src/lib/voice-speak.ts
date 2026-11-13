// Voz humanizada (IA) com cache, sem repetir a mesma frase e com voz do navegador de reserva.
let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let current: AbortController | null = null;
let lastText = "";
let lastAt = 0;
let token = 0;
let unlocked = false;

// Voz fixa: feminina suave.
const voice = "Aoede";
if (typeof window !== "undefined") {
  try { localStorage.removeItem("te-achando-voice"); } catch {}
}

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

// Libera o som no celular/navegador: precisa acontecer dentro de um toque do usuário.
export function unlockAudio() {
  if (typeof window === "undefined" || unlocked) return;
  const c = getCtx();
  c.resume().then(() => (unlocked = c.state === "running")).catch(() => {});
}

function browserSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  u.rate = 0.95;
  const pt = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("pt"));
  const voice = pt.find((v) => /female|feminin|luciana|francisca|maria|vitoria|helo|google/i.test(v.name)) ?? pt[0];
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

export function stopSpeak() {
  token++;
  current?.abort();
  current = null;
  try {
    source?.stop();
  } catch {}
  source = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

const pending = new Map<string, Promise<AudioBuffer>>();
function fetchVoice(text: string, key: string) {
  let p = pending.get(key);
  if (!p) {
    p = fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.arrayBuffer(); })
      .then((a) => getCtx().decodeAudioData(a))
      .then((b) => { buffers.set(key, b); return b; })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

// Prepara a voz com antecedência (ex.: assim que o endereço aparece).
export function preloadSpeak(text: string) {
  if (typeof window === "undefined") return;
  const key = voice + "|" + text;
  if (!buffers.has(key)) fetchVoice(text, key).catch(() => {});
}

export async function speak(text: string, opts: { force?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  // Evita repetir sozinho a mesma frase em sequência; botões usam force.
  if (!opts.force && voice + text === lastText && now - lastAt < 8000) return;
  lastText = voice + text;
  lastAt = now;
  stopSpeak();
  const my = token;
  try {
    const c = getCtx();
    const key = voice + "|" + text;
    let buf = buffers.get(key);
    if (!buf) {
      // Espera a voz feminina suave; frases já ouvidas tocam na hora.
      buf = await fetchVoice(text, key);
    }
    if (my !== token) return;
    if (c.state !== "running") await c.resume();
    if (c.state !== "running") throw new Error("audio bloqueado");
    source = c.createBufferSource();
    source.buffer = buf;
    source.connect(c.destination);
    source.start();
  } catch (e) {
    if ((e as Error)?.name === "AbortError" || my !== token) return;
    console.warn("Voz IA falhou, usando voz do navegador", e);
    browserSpeak(text);
  }
}
