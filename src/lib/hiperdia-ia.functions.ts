import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const Schema = z.object({
  pacienteId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

function idade(dataNascimento?: string | null) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos;
}

/**
 * Assistente de IA clínico para o módulo Hiperdia.
 * Monta o contexto com os dados básicos do paciente e as últimas aferições
 * (pressão, glicemia, peso) e responde perguntas do médico em Markdown.
 */
export const perguntarHiperdiaIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: paciente, error: errPac } = await supabase
      .from("pacientes")
      .select("id, nome, data_nascimento, sexo")
      .eq("id", data.pacienteId)
      .maybeSingle();
    if (errPac) throw new Error(errPac.message);
    if (!paciente) throw new Error("Paciente não encontrado ou sem acesso");

    const { data: registros, error: errReg } = await supabase
      .from("hiperdia_registros")
      .select(
        "data_registro, pressao_sistolica, pressao_diastolica, glicemia_jejum, glicemia_pos_prandial, peso, observacoes",
      )
      .eq("paciente_id", data.pacienteId)
      .order("data_registro", { ascending: false })
      .limit(20);
    if (errReg) throw new Error(errReg.message);

    const linhas = (registros ?? []).map((r) => {
      const pa =
        r.pressao_sistolica && r.pressao_diastolica
          ? `${r.pressao_sistolica}/${r.pressao_diastolica} mmHg`
          : "—";
      return `- ${String(r.data_registro).slice(0, 16).replace("T", " ")} | PA: ${pa} | Glicemia jejum: ${
        r.glicemia_jejum ?? "—"
      } | Glicemia pós: ${r.glicemia_pos_prandial ?? "—"} | Peso: ${r.peso ?? "—"} kg${
        r.observacoes ? ` | Obs: ${r.observacoes}` : ""
      }`;
    });

    const anos = idade(paciente.data_nascimento as string | null);
    const contexto = `Paciente: ${paciente.nome}${anos !== null ? `, ${anos} anos` : ""}${
      paciente.sexo ? `, sexo ${paciente.sexo}` : ""
    }.
Aferições Hiperdia (mais recentes primeiro, até 20):
${linhas.length ? linhas.join("\n") : "Nenhuma aferição registrada."}`;

    const sys = `Você é um assistente clínico de apoio à decisão para o programa Hiperdia (hipertensão e diabetes) no Brasil.
Responda em português do Brasil, em Markdown, de forma objetiva (use bullets e negrito para valores relevantes).
Analise tendências, variabilidade e valores fora de meta (PA alvo geralmente <130/80 mmHg; glicemia jejum 70–99 mg/dL, pré-diabetes 100–125, diabetes ≥126; pós-prandial <140).
Quando os dados forem insuficientes, diga claramente e sugira o que medir.
NUNCA substitua o julgamento clínico do médico; apresente suas conclusões como sugestões a confirmar.`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "system", content: `Contexto clínico do paciente:\n${contexto}` },
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Lovable AI error", res.status, text);
      if (res.status === 429) throw new Error("Limite de uso atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha IA (${res.status})`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resposta = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { resposta: resposta || "Não foi possível gerar uma resposta.", registros: linhas.length };
  });