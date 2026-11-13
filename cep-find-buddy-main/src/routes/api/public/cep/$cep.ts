import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/cep/$cep")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params, request }) => {
        const cep = String(params.cep).replace(/\D/g, "");
        if (cep.length !== 8) return json({ erro: "CEP deve ter 8 números" }, 400);
        const numero = (new URL(request.url).searchParams.get("numero") ?? "")
          .replace(/\D/g, "")
          .slice(0, 6);

        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!r.ok) return json({ erro: "Serviço de CEP indisponível" }, 502);
        const d = (await r.json()) as {
          erro?: boolean;
          cep: string;
          logradouro: string;
          complemento: string;
          bairro: string;
          localidade: string;
          uf: string;
        };
        if (d.erro) return json({ erro: "CEP não encontrado" }, 404);

        let latitude: number | null = null;
        let longitude: number | null = null;
        try {
          const q = [d.logradouro, numero, d.bairro, d.localidade, d.uf, "Brasil"]
            .filter(Boolean)
            .join(", ");
          const g = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
            { headers: { "User-Agent": "TeAchando/1.0 (cep-find-buddy.lovable.app)" } },
          );
          const arr = (await g.json()) as Array<{ lat: string; lon: string }>;
          if (arr[0]) {
            latitude = Number(arr[0].lat);
            longitude = Number(arr[0].lon);
          }
        } catch {
          /* coordenadas opcionais */
        }

        const endereco = `${d.logradouro}${numero ? `, ${numero}` : ""}, ${d.bairro}, ${d.localidade} - ${d.uf}`;
        return json({
          cep: d.cep,
          logradouro: d.logradouro,
          numero: numero || null,
          complemento: d.complemento,
          bairro: d.bairro,
          cidade: d.localidade,
          uf: d.uf,
          endereco,
          latitude,
          longitude,
          fotoDaRua:
            latitude != null
              ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`,
        });
      },
    },
  },
});
