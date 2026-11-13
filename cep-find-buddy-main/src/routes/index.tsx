import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Search, Volume2, Square, MapPin, ExternalLink, Mic, RotateCcw } from "lucide-react";
import { recordWav, transcribeFile, extractCep, digitsHeard, withRetry, FatalError } from "@/lib/voice-cep";
import { speak, preloadSpeak, stopSpeak, unlockAudio } from "@/lib/voice-speak";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Te Achando — Busca de endereço por CEP" },
      {
        name: "description",
        content:
          "Digite o CEP e o Te Achando mostra o endereço completo, a imagem da rua no mapa e lê tudo em voz alta.",
      },
      { property: "og:title", content: "Te Achando — Busca de endereço por CEP" },
      {
        property: "og:description",
        content:
          "Endereço completo, imagem da rua e leitura em voz alta. Simples, acessível e com modo claro e escuro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Cep = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  estado?: string;
  erro?: boolean | string;
};

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("te-achando-theme");
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(saved ? saved === "dark" : prefers);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("te-achando-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((v) => !v) };
}


function Index() {
  const { dark, toggle } = useTheme();
  const [cep, setCep] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState<Cep | null>(null);
  const [coords, setCoords] = useState<{ lat: string; lon: string } | null | "unavailable">(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [recover, setRecover] = useState<null | "cep" | "mic">(null);
  const lastAudio = useRef<File | null>(null);

  useEffect(() => {
    sessionStorage.removeItem("te-achando-retries");
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
    return stopSpeak;
  }, []);

  async function processAudio(file: File) {
    const text = await withRetry(() => transcribeFile(file));
    const found = extractCep(text);
    if (!found) {
      const got = digitsHeard(text);
      const hint =
        got.length > 0 && got.length < 8
          ? `Ouvi só ${got.length} números: ${got.split("").join(" ")}. O CEP tem oito. Fale de novo, um número de cada vez.`
          : "Não consegui entender o CEP. Fale de novo, um número de cada vez, com calma.";
      setError(`${hint} (Ouvi: "${text || "nada"}")`);
      speak(hint);
      setRecover("mic");
    } else {
      setCep(mask(found));
      await buscar(undefined, found);
    }
  }

  const spoken = (d: Cep, num?: string) => {
    const cepFalado = d.cep.replace(/\D/g, "").split("").join(" ");
    const numero = num ? `, número ${num}` : "";
    const rua = d.logradouro
      ? `Você está procurando ${d.logradouro}${numero}`
      : "Achei o seu CEP";
    const bairro = d.bairro ? `, no bairro ${d.bairro}` : "";
    return `Pronto, encontrei! ${rua}${bairro}, na cidade de ${d.localidade}, ${d.estado || d.uf}. O CEP é ${cepFalado}.`;
  };

  const [rec, setRec] = useState<{ stop: () => Promise<File> } | null>(null);
  const [ouvindo, setOuvindo] = useState<"idle" | "rec" | "proc">("idle");

  async function falarCep() {
    if (ouvindo === "rec" && rec) {
      setOuvindo("proc");
      try {
        const file = await rec.stop();
        lastAudio.current = file;
        await processAudio(file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao ouvir.";
        setError(msg);
        speak(msg);
        setRecover("mic");
      } finally {
        setRec(null);
        setOuvindo("idle");
      }
      return;
    }
    if (ouvindo !== "idle") return;
    stopSpeak();
    setError(null);
    setRecover(null);
    lastAudio.current = null;
    try {
      const r = await withRetry(() => recordWav(), 2, 500);
      setRec(r);
      setOuvindo("rec");
    } catch (err) {
      const denied = (err as Error)?.name === "NotAllowedError";
      setError(
        denied
          ? "O microfone está bloqueado. Toque no cadeado ao lado do endereço do site, permita o microfone e tente de novo."
          : "Não consegui acessar o microfone. Confira se ele está ligado e tente de novo.",
      );
      speak("Não consegui acessar o microfone.");
      setRecover("mic");
    }
  }

  async function reenviarAudio() {
    const file = lastAudio.current;
    if (!file) return falarCep();
    setError(null);
    setRecover(null);
    setOuvindo("proc");
    try {
      await processAudio(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao ouvir.";
      setError(msg);
      speak(msg);
      setRecover("mic");
    } finally {
      setOuvindo("idle");
    }
  }

  async function buscar(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const clean = (override ?? cep).replace(/\D/g, "");
    const num = numero.replace(/\D/g, "").slice(0, 6);
    setError(null);
    setRecover(null);
    setData(null);
    setCoords(null);
    stopSpeak();
    if (clean.length !== 8) {
      setError("Digite um CEP com 8 números, por exemplo 01001-000.");
      speak("O CEP precisa ter oito números.");
      return;
    }
    setLoading(true);
    try {
      const json = await withRetry(async () => {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        if (res.status === 400) throw new FatalError("CEP inválido");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Cep;
      });
      if (json.erro) {
        setError("CEP não encontrado. Confira os números e tente de novo.");
        speak("CEP não encontrado. Confira os números e tente de novo.");
        return;
      }
      setData(json);
      setLoading(false);
      // Prepara a voz em segundo plano: quando a pessoa tocar em "Ouvir o endereço", já toca na hora.
      preloadSpeak(spoken(json, num));
      const geoSearch = (query: string) =>
        withRetry(
          async () => {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 8000);
            try {
              const geo = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
                { signal: controller.signal },
              );
              if (!geo.ok) throw new Error(`HTTP ${geo.status}`);
              return await geo.json();
            } finally {
              window.clearTimeout(timeout);
            }
          },
          2,
        );
      const base = `${json.logradouro || ""}, ${json.bairro || ""}, ${json.localidade}, ${json.uf}, Brasil`;
      let list: Array<{ lat: string; lon: string }> = [];
      try {
        // Com número, acha a localização certeira da rua; sem número, acha a rua.
        list = num ? await geoSearch(`${json.logradouro || ""}, ${num}, ${base}`) : await geoSearch(base);
      } catch {
        list = [];
      }
      if ((!Array.isArray(list) || !list[0]) && num) {
        // Sem número no mapa: mostra a rua inteira em vez de falhar.
        try {
          list = await geoSearch(base);
        } catch {
          list = [];
        }
      }
      setCoords(Array.isArray(list) && list[0] ? { lat: list[0].lat, lon: list[0].lon } : "unavailable");
    } catch (err) {
      if (err instanceof FatalError) {
        setError("CEP inválido. Confira os números e tente de novo.");
        speak("CEP inválido.");
      } else {
        setError("Tentamos algumas vezes e não conseguimos buscar. Verifique sua internet e toque em tentar de novo.");
        speak("Não conseguimos buscar agora. Toque em tentar de novo.");
        setRecover("cep");
      }
    } finally {
      setLoading(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 120);
    }
  }

  const mask = (v: string) => {
    const n = v.replace(/\D/g, "").slice(0, 8);
    return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
  };

  const mapsKey = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
    | string
    | undefined;
  const googleEmbed = coords && coords !== "unavailable"
    ? mapsKey
      ? `https://www.google.com/maps/embed/v1/streetview?key=${mapsKey}&location=${coords.lat},${coords.lon}&language=pt-BR`
      : null
    : null;
  const googleLink = data
    ? coords && coords !== "unavailable"
      ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.logradouro}${numero ? `, ${numero}` : ""}, ${data.bairro}, ${data.localidade} - ${data.uf}`)}`
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <MapPin className="size-5" />
          </span>
          <div>
            <p className="text-xl font-extrabold leading-none tracking-tight">Te Achando</p>
            <p className="text-xs text-muted-foreground">Seu endereço em segundos</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {dark ? "Modo claro" : "Modo escuro"}
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-9">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Digite o CEP e a gente acha a rua pra você
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Mostramos o endereço completo, a imagem da rua no mapa e lemos tudo em voz alta.
          </p>

          <form onSubmit={(e) => { unlockAudio(); buscar(e); }} className="mt-7 flex flex-col gap-3 sm:flex-row">
            <input
              value={cep}
              onChange={(e) => setCep(mask(e.target.value))}
              inputMode="numeric"
              aria-label="Digite o CEP"
              placeholder="01001-000"
              className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-5 py-4 text-2xl font-bold tracking-widest outline-none placeholder:text-muted-foreground focus:ring-4 focus:ring-ring/40"
            />
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              aria-label="Número da casa (opcional)"
              placeholder="Número (opcional)"
              className="w-full rounded-2xl border border-input bg-background px-5 py-4 text-2xl font-bold outline-none placeholder:text-sm placeholder:font-semibold placeholder:tracking-normal placeholder:text-muted-foreground focus:ring-4 focus:ring-ring/40 sm:w-44"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-lg font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Search className="size-5" />
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { unlockAudio(); falarCep(); }}
            disabled={ouvindo === "proc" || loading}
            aria-label="Falar o CEP"
            className={`mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border-2 px-6 py-4 text-lg font-bold transition-colors disabled:opacity-60 ${
              ouvindo === "rec"
                ? "animate-pulse border-destructive bg-destructive text-destructive-foreground"
                : "border-primary text-primary hover:bg-accent"
            }`}
          >
            {ouvindo === "rec" ? <Square className="size-6" /> : <Mic className="size-6" />}
            {ouvindo === "rec"
              ? "Estou ouvindo... toque para terminar"
              : ouvindo === "proc"
                ? "Entendendo o que você falou..."
                : "Falar o CEP em voz alta"}
          </button>

          <button
            type="button"
            onClick={() => {
              unlockAudio();
              speak(
                "Escreva os oito números do CEP no campo e toque no botão buscar. Depois eu leio o endereço para você.",
                { force: true },
              );
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <Volume2 className="size-4" />
            Ouvir como usar
          </button>
        </section>

        <div ref={resultRef} className="scroll-mt-6">
          {error && (
            <p
              role="alert"
              className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-base font-semibold text-destructive"
            >
              {error}
            </p>
          )}
          {error && recover && (
            <button
              type="button"
              onClick={() => (recover === "cep" ? buscar() : lastAudio.current ? reenviarAudio() : falarCep())}
              disabled={loading || ouvindo !== "idle"}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-lg font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <RotateCcw className="size-5" />
              {recover === "cep"
                ? "Tentar buscar de novo"
                : lastAudio.current
                  ? "Tentar entender de novo"
                  : "Tentar o microfone de novo"}
            </button>
          )}

          {data && (
            <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              {coords === null ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 bg-muted px-6 text-center sm:h-80">
                  <span className="size-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                  <p className="font-semibold text-muted-foreground">Carregando a foto da rua...</p>
                </div>
              ) : googleEmbed ? (
                <div>
                  <iframe
                    title={`Mapa do Google da rua ${data.logradouro}`}
                    src={googleEmbed}
                    className="h-64 w-full border-0 sm:h-80"
                    loading="lazy"
                  />
                  {googleLink && (
                    <a
                      href={googleLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-muted px-4 py-3 text-center text-sm font-semibold text-primary underline underline-offset-4"
                    >
                      Ver a foto da rua no Google Street View
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center gap-4 bg-muted px-6 py-8 text-center">
                  <MapPin className="size-9 text-primary" />
                  <div>
                    <p className="font-bold">A foto abre direto no Google Street View</p>
                    <p className="mt-1 text-sm text-muted-foreground">Toque no botão abaixo para ver a rua em 360 graus.</p>
                  </div>
                  {googleLink && (
                    <a
                      href={googleLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground"
                    >
                      <ExternalLink className="size-5" />
                      Abrir foto da rua
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-4 p-6 sm:p-8">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Rua
                  </p>
                  <p className="text-2xl font-extrabold">{data.logradouro || "Não informado"}</p>
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {numero && <Field label="Número" value={numero} />}
                  <Field label="Bairro" value={data.bairro || "Não informado"} />
                  <Field label="Cidade" value={`${data.localidade} - ${data.uf}`} />
                  <Field label="CEP" value={data.cep} />
                  <Field label="Complemento" value={data.complemento || "—"} />
                </dl>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { unlockAudio(); speak(spoken(data, numero), { force: true }); }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Volume2 className="size-5" />
                    Ouvir o endereço
                  </button>
                  <button
                    type="button"
                    onClick={stopSpeak}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-6 py-3 text-base font-bold transition-colors hover:bg-accent"
                  >
                    <Square className="size-4" />
                    Parar a voz
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-lg font-bold">{value}</dd>
    </div>
  );
}
