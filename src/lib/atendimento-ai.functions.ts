import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callAI(body: Record<string, unknown>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Lovable AI error", res.status, text);
    if (res.status === 429) throw new Error("Limite de uso atingido. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    throw new Error(`Falha IA (${res.status})`);
  }
  return (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Resposta IA não é JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/* ---------- 1. Estruturar anamnese a partir da transcrição ---------- */
const EstruturarSchema = z.object({
  transcricao: z.string().min(10).max(50_000),
  especialidade: z.string().max(80).optional(),
  promptExtra: z.string().max(800).optional(),
});

export const gerarAnamneseEstruturada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EstruturarSchema.parse(i))
  .handler(async ({ data }) => {
    const sys = `Você é um assistente médico que estrutura consultas em prontuário SOAP em português do Brasil.
Especialidade: ${data.especialidade ?? "Clínica Geral"}.
${data.promptExtra ?? ""}
Receberá a transcrição da conversa entre médico e paciente.
Responda APENAS um JSON com as chaves: queixa_principal, historia_doenca, exame_fisico, hipotese_diagnostica, conduta, prescricao.
Preencha TODOS os campos, mesmo quando a informação não está explícita — infira o mais provável a partir do contexto da consulta e da especialidade, sempre como sugestão a ser revisada pelo médico.
Regras por campo:
- queixa_principal: 1 frase curta com o motivo da consulta.
- historia_doenca: HDA em parágrafo (início, evolução, fatores associados, tratamentos tentados).
- exame_fisico: achados relatados; quando não houver relato, sugira um exame físico dirigido pertinente à queixa/especialidade, prefixado com "Sugerido: ".
- hipotese_diagnostica: OBRIGATÓRIO. Liste de 1 a 3 hipóteses diagnósticas plausíveis para a queixa/especialidade, separadas por " | " (ex.: "Cefaleia tensional | Enxaqueca sem aura | Cefaleia por fadiga visual"). Nunca deixe vazio — mesmo com poucos dados, proponha as hipóteses mais prováveis marcadas com "(sugestão — confirmar)".
- conduta: plano terapêutico e orientações; quando faltar dado, proponha conduta usual para o quadro provável.
- prescricao: prescrição sugerida com medicamento, dose, via, posologia e duração, ou orientações não farmacológicas quando aplicável.
Nunca devolva string vazia. Ao inferir, marque o trecho suposto com "(sugestão — confirmar)". Sempre em português do Brasil.`;
    const json = await callAI({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Transcrição da consulta:\n\n${data.transcricao}` },
      ],
      response_format: { type: "json_object" },
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = extractJson(content) as Record<string, string>;
    const get = (k: string) => (typeof parsed[k] === "string" ? parsed[k] : "");
    return {
      queixa_principal: get("queixa_principal"),
      historia_doenca: get("historia_doenca"),
      exame_fisico: get("exame_fisico"),
      hipotese_diagnostica: get("hipotese_diagnostica"),
      conduta: get("conduta"),
      prescricao: get("prescricao"),
    };
  });

/* ---------- 2. Sugerir CID, exames e prescrição ---------- */
const SugerirSchema = z.object({
  queixa_principal: z.string().max(2000).optional(),
  historia_doenca: z.string().max(5000).optional(),
  exame_fisico: z.string().max(5000).optional(),
  hipotese_diagnostica: z.string().max(2000).optional(),
  especialidade: z.string().max(80).optional(),
});

export const sugerirCondutaClinica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SugerirSchema.parse(i))
  .handler(async ({ data }) => {
    const sys = `Você é um assistente médico de apoio à decisão para ${data.especialidade ?? "clínica geral"} no Brasil.
Com base nos dados clínicos, sugira:
- CIDs prováveis (CID-10, código + descrição, máx 5).
- Exames complementares (máx 8).
- Prescrição sugerida (medicamentos com posologia em texto formatado, e orientações).
Responda APENAS JSON com: { "cids":[{"codigo":"","descricao":""}], "exames":["..."], "prescricao":"..." }.
NÃO substitua o julgamento clínico do médico. Use português do Brasil.`;
    const ctx = [
      data.queixa_principal && `Queixa: ${data.queixa_principal}`,
      data.historia_doenca && `HDA: ${data.historia_doenca}`,
      data.exame_fisico && `Exame: ${data.exame_fisico}`,
      data.hipotese_diagnostica && `Hipótese atual: ${data.hipotese_diagnostica}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!ctx) throw new Error("Forneça ao menos um dado clínico");
    const json = await callAI({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: ctx },
      ],
      response_format: { type: "json_object" },
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = extractJson(content) as {
      cids?: Array<{ codigo?: string; descricao?: string }>;
      exames?: string[];
      prescricao?: string;
    };
    return {
      cids: Array.isArray(parsed.cids)
        ? parsed.cids
            .filter((c) => c?.codigo)
            .slice(0, 5)
            .map((c) => ({ codigo: String(c.codigo ?? ""), descricao: String(c.descricao ?? "") }))
        : [],
      exames: Array.isArray(parsed.exames) ? parsed.exames.filter(Boolean).slice(0, 8) : [],
      prescricao: typeof parsed.prescricao === "string" ? parsed.prescricao : "",
    };
  });

/* ---------- 3. Resumir histórico do paciente ---------- */
const ResumirSchema = z.object({ pacienteId: z.string().uuid() });

export const resumirHistoricoPaciente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResumirSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pron, error } = await supabase
      .from("prontuarios")
      .select("data,queixa_principal,hipotese_diagnostica,conduta,prescricao")
      .eq("paciente_id", data.pacienteId)
      .order("data", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    if (!pron || pron.length === 0) {
      return { resumo: "Sem prontuários anteriores registrados para este paciente.", total: 0 };
    }
    const ctx = pron
      .map(
        (p, i) => `Consulta ${i + 1} (${p.data?.slice(0, 10) ?? ""}):
Queixa: ${p.queixa_principal ?? "-"}
Hipótese: ${p.hipotese_diagnostica ?? "-"}
Conduta: ${p.conduta ?? "-"}
Prescrição: ${p.prescricao ?? "-"}`,
      )
      .join("\n\n");
    const json = await callAI({
      messages: [
        {
          role: "system",
          content:
            "Resuma o histórico clínico abaixo em até 8 bullets em markdown, destacando padrões, comorbidades e medicações em uso. Português do Brasil. Seja conciso e objetivo.",
        },
        { role: "user", content: ctx },
      ],
    });
    const resumo = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { resumo, total: pron.length };
  });
