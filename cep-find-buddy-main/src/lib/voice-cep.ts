export class FatalError extends Error {}

export async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof FatalError || (e as Error)?.name === "NotAllowedError") throw e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * 300));
    }
  }
  throw last;
}

export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((s, c) => s + c.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (o: number, v: string) => {
    for (let i = 0; i < v.length; i++) view.setUint8(o + i, v.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let o = 44;
  for (const c of chunks)
    for (const v of c) {
      const s = Math.max(-1, Math.min(1, v));
      view.setInt16(o, s * (s < 0 ? 32768 : 32767), true);
      o += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function recordWav(): Promise<{ stop: () => Promise<File> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    await context.resume();
    const ctx = context;
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    let stopped = false;
    return {
      async stop() {
        if (stopped) throw new Error("Gravação já encerrada");
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
        node.disconnect();
        source.disconnect();
        node.onaudioprocess = null;
        const blob = encodeWav(chunks, ctx.sampleRate);
        await ctx.close();
        if (blob.size < 2048) throw new Error("Não ouvi nada. Tente falar de novo.");
        return new File([blob], "cep.wav", { type: "audio/wav" });
      },
    };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await context?.close();
    throw e;
  }
}

export async function transcribeFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    const text = res.status === 402 ? "Sem créditos de IA no momento." : msg || "Falha ao entender o áudio.";
    if (res.status === 429 || res.status >= 500) throw new Error(text);
    throw new FatalError(text);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let final: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split(/\r?\n\r?\n/);
    buf = events.pop() ?? "";
    for (const ev of events) {
      const data = ev
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        if (j.type === "transcript.text.delta" && j.delta) text += j.delta;
        else if (j.type === "transcript.text.done") final = j.text ?? text;
        else if (j.error) throw new Error(j.error.message ?? "Erro na transcrição");
        else if (typeof j.text === "string") final = j.text;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return final ?? text;
}

const UNITS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4,
  cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
};
const TENS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cinqüenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};

// Converte a fala em uma sequência de dígitos, entendendo "vinte e três", "cento e dois" etc.
function toDigits(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/(\d)[.\s-]+(?=\d)/g, "$1")
    .split(/[^a-zà-úü0-9]+/)
    .filter(Boolean);
  let out = "";
  let group: number | null = null;
  const flush = () => {
    if (group !== null) out += String(group);
    group = null;
  };
  for (const w of words) {
    if (/^\d+$/.test(w)) {
      flush();
      out += w;
    } else if (w in HUNDREDS) {
      flush();
      group = HUNDREDS[w]!;
    } else if (w in TENS) {
      if (group !== null && group % 100 === 0 && group >= 100) group += TENS[w]!;
      else {
        flush();
        group = TENS[w]!;
      }
    } else if (w in UNITS) {
      const u = UNITS[w]!;
      if (group !== null && u < 10 && group % 10 === 0 && group >= 20) {
        group += u;
        flush();
      } else if (group !== null && group >= 100 && group % 100 === 0) {
        group += u;
      } else {
        flush();
        out += String(u);
      }
    } else if (w === "e") {
      continue;
    } else {
      flush();
    }
  }
  flush();
  return out;
}

export function digitsHeard(text: string): string {
  return toDigits(text);
}

export function extractCep(text: string): string | null {
  const d = toDigits(text);
  const m = d.match(/\d{8}/);
  return m ? m[0] : null;
}
