import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

export async function executarJobWatchdog(request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const recebido = request.headers.get("x-job-token") ?? "";
  if (!recebido) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await (supabaseAdmin as any)
    .from("sistema_job_tokens")
    .select("token")
    .eq("nome", "nina-watchdog")
    .maybeSingle();
  const esperado = data?.token ?? "";
  const a = Buffer.from(recebido),
    b = Buffer.from(esperado);
  if (error || !esperado || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response("Unauthorized", { status: 401 });
  // O cron já chama esta rota a cada minuto, mesmo sem novas mensagens ou
  // navegador aberto. A espera do paciente independe de haver lotes para recuperar.
  let espera: unknown;
  try {
    const { processarTimeoutsEsperaPaciente } = await import("@/lib/nina/espera-timeout.server");
    espera = await processarTimeoutsEsperaPaciente();
  } catch {
    console.error("[nina-timeout] varredura periódica falhou; será retomada no próximo ciclo");
    espera = { erros: 1 };
  }
  try {
    const { executarWatchdogNina } = await import("@/lib/nina/watchdog.server");
    const recuperacao = await executarWatchdogNina();
    // Não acumula recuperação e uma nova geração na mesma requisição.
    let continuacao: unknown = null;
    if (!recuperacao.assumidos) {
      const { continuarCargaPendenteNina } = await import("@/lib/nina/carga-job.server");
      const { processarMensagemTeste } = await import("@/lib/nina/teste-console.server");
      continuacao = await continuarCargaPendenteNina(supabaseAdmin, processarMensagemTeste);
    }
    return Response.json(
      { ...recuperacao, continuacao, espera },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { erro: "WATCHDOG_FAILED", espera },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export const Route = createFileRoute("/api/public/nina/watchdog")({
  server: { handlers: { POST: ({ request }) => executarJobWatchdog(request) } },
});
