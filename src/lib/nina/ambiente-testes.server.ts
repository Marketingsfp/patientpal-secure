/**
 * Ambiente de testes da Nina — peças de servidor.
 *
 * Usa um grupo PRÓPRIO de 30 leads (índices 11 a 40), separado dos leads 1 a
 * 10 do console de homologação: a automação externa que conversa pelo console
 * e o ambiente de testes podem rodar ao mesmo tempo sem um reiniciar o ciclo
 * do outro. A Nina responde pelo mesmo núcleo do WhatsApp real
 * (`processarMensagemTeste`), sem nada sair para a Meta.
 */
import { garantirPapel, type PapelModelo } from "@/lib/nina/papeis-modelos";
import { MODELO_SOL } from "@/lib/nina/avaliador-sol";
import type { TurnoConversa } from "@/lib/nina/ambiente-testes/paciente";
import type { LinhaTranscricao } from "@/lib/nina/ambiente-testes/juiz";
import type { CatalogoAssuntos } from "@/lib/nina/ambiente-testes/assuntos";

export const PRIMEIRO_LEAD_AMBIENTE = 11;
export const TOTAL_LEADS_AMBIENTE = 30;
/** Quantas conversas uma rodada pode ter (a tela escolhe entre elas). */
export const QUANTIDADES_RODADA = [10, 20, 30] as const;

export type LeadAmbiente = {
  id: string;
  indice: number;
  nome: string;
  conversa_id: string | null;
  sessao_seq: number;
};

function telefoneSessao(indice: number, sessao: number) {
  return `5500${String(indice).padStart(2, "0")}${String(sessao).padStart(5, "0")}`;
}

/** Cria (uma vez) e devolve os 30 leads do ambiente de testes. */
export async function garantirLeadsAmbiente(
  admin: any,
  clinicaId: string,
): Promise<LeadAmbiente[]> {
  const linhas = Array.from({ length: TOTAL_LEADS_AMBIENTE }, (_, i) => {
    const indice = PRIMEIRO_LEAD_AMBIENTE + i;
    return {
      clinica_id: clinicaId,
      indice,
      nome: `Ambiente de testes ${String(i + 1).padStart(2, "0")}`,
      telefone_base: telefoneSessao(indice, 0),
      telefone_sessao: telefoneSessao(indice, 1),
      sessao_seq: 1,
      status: "ativa",
    };
  });
  const { error } = await admin
    .from("nina_teste_leads")
    .upsert(linhas, { onConflict: "clinica_id,indice", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await admin
    .from("nina_teste_leads")
    .select("id, indice, nome, conversa_id, sessao_seq")
    .eq("clinica_id", clinicaId)
    .gte("indice", PRIMEIRO_LEAD_AMBIENTE)
    .lt("indice", PRIMEIRO_LEAD_AMBIENTE + TOTAL_LEADS_AMBIENTE)
    .order("indice");
  if (e2) throw new Error(e2.message);
  return (data ?? []) as LeadAmbiente[];
}

export type RespostaClaude = { texto: string; inputTokens: number; outputTokens: number };

/** Chamada ao Claude Opus 5.5 com resposta JSON; repete uma vez em limite/instabilidade. */
export async function chamarClaudeJson(
  papel: Extract<PapelModelo, "paciente_dificil" | "juiz_testes">,
  instrucoes: string,
  input: unknown[],
  schema: Record<string, unknown>,
  maxSaida: number,
): Promise<RespostaClaude> {
  const { chamarClaudeComoResponses } = await import("@/lib/nina/claude-messages.server");
  const corpo = {
    model: garantirPapel(papel, MODELO_SOL),
    instructions: instrucoes,
    input,
    stream: true,
    store: false,
    max_output_tokens: maxSaida,
    text: { format: { type: "json_schema", name: papel, schema, strict: true } },
  };
  let res = await chamarClaudeComoResponses(corpo);
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await chamarClaudeComoResponses(corpo);
  }
  if (!res.ok || !res.body) {
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    if (res.status === 429) throw new Error("Limite de uso do modelo atingido. Tente mais tarde.");
    throw new Error(`Falha do provedor de IA (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let texto = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.startsWith("data:")) continue;
      const bruto = linha.slice(5).trim();
      if (!bruto || bruto === "[DONE]") continue;
      let ev: any;
      try {
        ev = JSON.parse(bruto);
      } catch {
        continue;
      }
      if (ev.type === "error") throw new Error("O modelo interrompeu a resposta.");
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string")
        texto += ev.delta;
      if (ev.type === "response.completed" && ev.response) {
        if (!texto && typeof ev.response.output_text === "string") texto = ev.response.output_text;
        inputTokens = ev.response.usage?.input_tokens ?? 0;
        outputTokens = ev.response.usage?.output_tokens ?? 0;
      }
    }
  }
  return { texto, inputTokens, outputTokens };
}

type MensagemConversa = { direction: string; body: string | null; enviada_por: string | null };

async function mensagensDaConversa(
  admin: any,
  clinicaId: string,
  conversaId: string,
): Promise<MensagemConversa[]> {
  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .select("direction, body, enviada_por, created_at")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .eq("is_teste", true)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as MensagemConversa[];
}

/** O que o paciente vê: falas do paciente e da clínica; avisos internos ficam de fora. */
export async function turnosParaPaciente(
  admin: any,
  clinicaId: string,
  conversaId: string | null,
): Promise<TurnoConversa[]> {
  if (!conversaId) return [];
  return (await mensagensDaConversa(admin, clinicaId, conversaId))
    .filter((m) => m.body?.trim() && m.enviada_por !== "sistema")
    .map((m) => ({
      autor: m.direction === "in" ? "paciente" : "clinica",
      texto: String(m.body).trim(),
    }));
}

/** Transcrição completa para o juiz (com os avisos do sistema marcados). */
export async function transcricaoParaJuiz(
  admin: any,
  clinicaId: string,
  conversaId: string | null,
): Promise<LinhaTranscricao[]> {
  if (!conversaId) return [];
  return (await mensagensDaConversa(admin, clinicaId, conversaId))
    .filter((m) => m.body?.trim())
    .map((m) => ({
      autor: m.direction === "in" ? "paciente" : m.enviada_por === "sistema" ? "sistema" : "nina",
      texto: String(m.body).trim().slice(0, 3000),
    }));
}

/** Nomes publicados para sortear assuntos (especialidades com escala e exames com preço). */
export async function catalogoParaAssuntos(
  admin: any,
  clinicaId: string,
): Promise<CatalogoAssuntos> {
  const { data: profissionais } = await admin
    .from("nina_cat_profissionais")
    .select("especialidades, horarios")
    .eq("clinica_id", clinicaId)
    .eq("status", "PUBLICADO")
    .limit(500);
  const consultas: string[] = [];
  for (const p of (profissionais ?? []) as any[]) {
    if (!Array.isArray(p.horarios) || !p.horarios.length) continue;
    for (const e of Array.isArray(p.especialidades) ? p.especialidades : [])
      if (e?.nome) consultas.push(String(e.nome));
  }
  const exames: string[] = [];
  for (let pagina = 0; pagina < 4; pagina++) {
    const { data, error } = await admin
      .from("nina_cat_servicos")
      .select("nome, valor")
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .not("valor", "is", null)
      .order("id", { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error || !data?.length) break;
    for (const s of data as any[]) if (s.nome) exames.push(String(s.nome));
    if (data.length < 1000) break;
  }
  return { consultas, exames };
}
