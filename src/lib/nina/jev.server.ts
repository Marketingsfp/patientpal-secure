/**
 * Chamada única ao Jev pelo AI Gateway (server-only). Qualquer erro, recusa
 * ou demora vira "sem decisão" — nunca derruba nem trava o atendimento.
 * Sem nova tentativa automática (regras do gateway).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FLAG_JEV,
  jevPermitido,
  validarRespostas,
  type FaseJev,
  type PerguntaJev,
  type ResultadoJev,
} from "./jev";

const URL_JEV = "https://ai.gateway.lovable.dev/v1/systemone";
export const MODELO_JEV = "typesafe/jev-latest";
/** Limite para não atrasar a resposta ao paciente; ao estourar, segue o fluxo atual. */
const LIMITE_MS = 4000;

export async function jevAtivo(clinicaId: string | null, fase: FaseJev, teste: boolean): Promise<boolean> {
  if (!teste || !clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_JEV[fase])
    .maybeSingle();
  if (error || !data) return false;
  return jevPermitido(teste, Boolean(data.ativo));
}

export async function perguntarJev(
  state: unknown,
  perguntas: Record<string, PerguntaJev>,
): Promise<ResultadoJev> {
  const inicio = Date.now();
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return { ok: false, motivo: "sem_chave", latencyMs: 0 };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), LIMITE_MS);
  try {
    const resp = await fetch(URL_JEV, {
      method: "POST",
      signal: controle.signal,
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ model: MODELO_JEV, state, questions: perguntas }),
    });
    const latencyMs = Date.now() - inicio;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { ok: false, motivo: `http_${resp.status}: ${txt.slice(0, 200)}`, status: resp.status, latencyMs };
    }
    const respostas = validarRespostas(perguntas, await resp.json());
    if (!respostas) return { ok: false, motivo: "resposta_invalida", latencyMs };
    return { ok: true, respostas, latencyMs };
  } catch (e) {
    const motivo = controle.signal.aborted ? "tempo_esgotado" : e instanceof Error ? e.message : "erro";
    return { ok: false, motivo, latencyMs: Date.now() - inicio };
  } finally {
    clearTimeout(timer);
  }
}

/** Registro best-effort da decisão, para comparar com o comportamento atual. */
export async function registrarDecisaoJev(r: {
  clinicaId: string | null;
  conversationId: string | null;
  fase: FaseJev;
  teste: boolean;
  perguntas: Record<string, PerguntaJev>;
  resultado: ResultadoJev;
  aplicada: boolean;
}): Promise<void> {
  try {
    await supabaseAdmin.from("nina_jev_decisoes" as never).insert({
      clinica_id: r.clinicaId,
      conversation_id: r.conversationId,
      fase: r.fase,
      teste: r.teste,
      perguntas: Object.keys(r.perguntas),
      respostas: r.resultado.ok ? r.resultado.respostas : null,
      aplicada: r.aplicada,
      latency_ms: r.resultado.latencyMs,
      erro: r.resultado.ok ? null : r.resultado.motivo,
    } as never);
  } catch (e) {
    console.warn("[nina-jev] falha ao registrar decisão:", e instanceof Error ? e.message : e);
  }
}
