import { createFileRoute } from "@tanstack/react-router";
import { transcribe } from "@/lib/transcribe.server";

const MAX = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const len = Number(request.headers.get("content-length") || 0);
        if (len > MAX + 64 * 1024) return new Response("Áudio muito grande", { status: 413 });
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Configuração ausente", { status: 500 });
        let file: File;
        try {
          const form = await request.formData();
          const f = form.get("file");
          if (!(f instanceof File)) return new Response("Envie um áudio", { status: 400 });
          file = f;
        } catch {
          return new Response("Envio inválido", { status: 400 });
        }
        try {
          const upstream = await transcribe(
            {
              baseURL: "https://ai.gateway.lovable.dev",
              apiKey,
              model: "google/gemini-3.5-transcribe",
              maxFileBytes: MAX,
              audioOnly: true,
            },
            file,
            { language: "pt", signal: request.signal },
          );
          return new Response(upstream.body, {
            status: upstream.status,
            headers: { "content-type": upstream.headers.get("content-type") ?? "text/event-stream" },
          });
        } catch (e) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          return new Response(e instanceof Error ? e.message : "Erro", { status: 400 });
        }
      },
    },
  },
});
