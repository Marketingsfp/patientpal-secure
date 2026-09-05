/**
 * Job de vencimento da espera do paciente (Fase 3).
 *
 * Chamado por agendamento no banco. Rota pública por necessidade do agendador,
 * mas protegida por segredo: sem o cabeçalho correto, responde 401.
 */
import { createFileRoute } from "@tanstack/react-router";

async function executar(request: Request): Promise<Response> {
  const segredo = process.env["NINA_JOB_SECRET"];
  const enviado = request.headers.get("x-nina-job-secret") ?? "";
  if (!segredo || enviado !== segredo) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const clinicaId = url.searchParams.get("clinica_id");
  const limiteBruto = Number(url.searchParams.get("limite"));

  const { processarTimeoutsEsperaPaciente } = await import("@/lib/nina/espera-timeout.server");
  const r = await processarTimeoutsEsperaPaciente({
    clinicaId: clinicaId ?? null,
    limite: Number.isFinite(limiteBruto) && limiteBruto > 0 ? limiteBruto : undefined,
  });

  return new Response(JSON.stringify({ ok: true, ...r }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/nina/espera-timeout")({
  server: {
    handlers: {
      POST: ({ request }) => executar(request),
      GET: ({ request }) => executar(request),
    },
  },
});
