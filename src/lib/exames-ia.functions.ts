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
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Resposta IA não é JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const Schema = z.object({
  tipo_exame: z.string().min(1).max(200),
  resultado_texto: z.string().min(3).max(20_000),
  paciente_nome: z.string().max(200).optional(),
  idade: z.number().min(0).max(130).optional(),
  sexo: z.enum(["M", "F", "O"]).optional(),
  contexto: z.string().max(2000).optional(),
  especialidades_disponiveis: z.array(z.string().max(100)).max(80).optional(),
});

const ExtrairSchema = z.object({
  arquivo_base64: z.string().min(20).max(15_000_000), // data URL ou base64 puro
  mime: z.string().min(3).max(100),
  nome_arquivo: z.string().max(200).optional(),
});

export const extrairTextoExameDeArquivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExtrairSchema.parse(i))
  .handler(async ({ data }): Promise<{ texto: string; tipo_sugerido: string }> => {
    const dataUrl = data.arquivo_base64.startsWith("data:")
      ? data.arquivo_base64
      : `data:${data.mime};base64,${data.arquivo_base64}`;

    const sys = `Você extrai o conteúdo textual de laudos de exames laboratoriais ou de imagem em português do Brasil.
Devolva APENAS um JSON: {"tipo_sugerido": "nome curto do exame", "texto": "transcrição fiel do laudo, preservando valores, unidades e faixas de referência"}.
Não invente valores. Se não conseguir ler, devolva "texto" vazio.`;

    const isPdf = data.mime.includes("pdf");
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: `Extraia o texto do laudo a seguir${data.nome_arquivo ? ` (arquivo: ${data.nome_arquivo})` : ""}.` },
      isPdf
        ? { type: "file", file: { filename: data.nome_arquivo ?? "laudo.pdf", file_data: dataUrl } }
        : { type: "image_url", image_url: { url: dataUrl } },
    ];

    const json = await callAI({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = extractJson(content) as { texto?: unknown; tipo_sugerido?: unknown };
    return {
      texto: typeof parsed.texto === "string" ? parsed.texto : "",
      tipo_sugerido: typeof parsed.tipo_sugerido === "string" ? parsed.tipo_sugerido : "",
    };
  });

export type ClassificacaoExame = {
  status: "normal" | "alterado" | "critico";
  severidade: "baixa" | "media" | "alta";
  achados_relevantes: string[];
  resumo: string;
  recomendacao: string;
  mensagem_paciente: string;
  precisa_contato: boolean;
  especialidade_indicada: string;
  justificativa_especialidade: string;
  urgencia_encaminhamento: "rotina" | "prioritario" | "urgente";
};

export const classificarResultadoExame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Schema.parse(i))
  .handler(async ({ data }): Promise<ClassificacaoExame> => {
    const sys = `Você é uma enfermeira clínica experiente analisando resultados de exames em português do Brasil.
Receberá o nome do exame e o texto do resultado e deve classificar.
Use a melhor evidência clínica. Seja objetiva.

Responda APENAS um JSON com este formato exato:
{
  "status": "normal" | "alterado" | "critico",
  "severidade": "baixa" | "media" | "alta",
  "achados_relevantes": ["item curto", "..."],
  "resumo": "1-2 frases para o prontuário",
  "recomendacao": "conduta sugerida para a equipe (ex: solicitar retorno, exame complementar)",
  "mensagem_paciente": "mensagem curta, empática, em português coloquial, sem causar pânico, orientando o próximo passo. Não dê diagnóstico definitivo.",
  "precisa_contato": true|false,
  "especialidade_indicada": "nome da especialidade médica mais adequada para encaminhamento (ex.: Cardiologia, Endocrinologia, Nefrologia). Se possível, escolha uma da lista de especialidades disponíveis na clínica. Use 'Clínica Geral' quando não houver indicação específica.",
  "justificativa_especialidade": "1 frase explicando por que essa especialidade",
  "urgencia_encaminhamento": "rotina" | "prioritario" | "urgente"
}

Regras:
- "critico" = valor com risco iminente que exige contato imediato.
- "alterado" = fora da faixa, mas sem urgência imediata.
- "normal" = dentro da faixa de referência.
- "precisa_contato" deve ser true se status != "normal".
- "urgencia_encaminhamento": "urgente" para crítico, "prioritario" para alterado relevante, "rotina" para acompanhamento.`;

    const user = `Paciente: ${data.paciente_nome ?? "—"}${data.idade ? `, ${data.idade} anos` : ""}${data.sexo ? `, sexo ${data.sexo}` : ""}.
Exame: ${data.tipo_exame}
${data.contexto ? `Contexto: ${data.contexto}\n` : ""}
${data.especialidades_disponiveis?.length ? `Especialidades disponíveis na clínica: ${data.especialidades_disponiveis.join(", ")}\n` : ""}
Resultado:
${data.resultado_texto}`;

    const json = await callAI({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = extractJson(content) as Partial<ClassificacaoExame>;

    const status = (["normal", "alterado", "critico"].includes(parsed.status as string)
      ? parsed.status
      : "alterado") as ClassificacaoExame["status"];
    const severidade = (["baixa", "media", "alta"].includes(parsed.severidade as string)
      ? parsed.severidade
      : status === "critico" ? "alta" : status === "alterado" ? "media" : "baixa") as ClassificacaoExame["severidade"];

    return {
      status,
      severidade,
      achados_relevantes: Array.isArray(parsed.achados_relevantes)
        ? parsed.achados_relevantes.map(String).slice(0, 12)
        : [],
      resumo: typeof parsed.resumo === "string" ? parsed.resumo : "",
      recomendacao: typeof parsed.recomendacao === "string" ? parsed.recomendacao : "",
      mensagem_paciente: typeof parsed.mensagem_paciente === "string" ? parsed.mensagem_paciente : "",
      precisa_contato: status !== "normal" || Boolean(parsed.precisa_contato),
      especialidade_indicada: typeof parsed.especialidade_indicada === "string" && parsed.especialidade_indicada.trim()
        ? parsed.especialidade_indicada.trim()
        : "Clínica Geral",
      justificativa_especialidade: typeof parsed.justificativa_especialidade === "string" ? parsed.justificativa_especialidade : "",
      urgencia_encaminhamento: (["rotina", "prioritario", "urgente"].includes(parsed.urgencia_encaminhamento as string)
        ? parsed.urgencia_encaminhamento
        : status === "critico" ? "urgente" : status === "alterado" ? "prioritario" : "rotina") as ClassificacaoExame["urgencia_encaminhamento"],
    };
  });
