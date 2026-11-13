import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Configuração ausente", { status: 500 });
        let text = "";
        try {
          const body = (await request.json()) as { text?: unknown };
          text = typeof body.text === "string" ? body.text.trim().slice(0, 600) : "";
        } catch {
          return new Response("Envio inválido", { status: 400 });
        }
        if (!text) return new Response("Texto vazio", { status: 400 });
        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-tts-preview",
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `Fale em português do Brasil, com voz calma, acolhedora e natural, devagar e com clareza, como alguém ajudando um amigo: ${text}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
              },
              stream_format: "audio",
            }),
            signal: request.signal,
          });
          if (!upstream.ok) {
            const msg = await upstream.text().catch(() => "");
            console.error(`TTS failed [${upstream.status}]: ${msg}`);
            return new Response(msg || "Falha na voz", { status: upstream.status });
          }
          return new Response(upstream.body, {
            headers: { "content-type": upstream.headers.get("content-type") ?? "audio/wav" },
          });
        } catch {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          return new Response("Falha na voz", { status: 502 });
        }
      },
    },
  },
});
