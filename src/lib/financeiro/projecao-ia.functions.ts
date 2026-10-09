/**
 * Pergunta livre da aba Financeiro → Projeção, respondida pela IA.
 *
 * A tela manda a pergunta e o resumo de números que ela mesma já mostra
 * (`montarContextoPergunta`): o servidor não lê o banco, então ninguém vê
 * por aqui nada que já não esteja na própria tela. As contas vêm prontas no
 * resumo; a IA só explica em português simples.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SISTEMA = `Você é o assistente da tela "Projeção do mês" do financeiro de uma clínica médica no Brasil.
Quem pergunta é a gestão da clínica, que não é da área de números. Responda em português do Brasil, simples e direto, em no máximo 8 linhas.

Regras:
1. Use SOMENTE os números do RESUMO abaixo. Nunca invente valor, dia, percentual ou tendência que não esteja lá.
2. Atendimentos e receita por dia da semana para um alvo vêm prontos em "CÁLCULO PRONTO". Copie esses números exatamente; não refaça a conta.
3. Se precisar de uma conta simples que não está pronta (somar, subtrair, dividir números do resumo), faça e mostre a conta em uma linha.
4. Se a pergunta pede algo que o resumo não tem (por médico, por especialidade, por paciente, outro mês, convênio etc.), diga com clareza que esta tela não tem essa informação e o que ela tem.
5. "Atendimento" aqui é cada pagamento recebido no caixa. O dia de hoje ainda está em andamento: o ritmo usa só dias fechados (até ontem).
6. As perguntas anteriores da conversa vêm antes. Numa continuação curta ("e no sábado?", "e se fosse 10%?"), entenda pelo contexto da conversa, mas os números valem sempre os do RESUMO mais recente.
7. Comece pela resposta direta (o número que a pessoa quer). Não use tabelas nem markdown; use frases curtas e, se precisar, uma lista simples com "-".`;

const Schema = z.object({
  pergunta: z.string().trim().min(3).max(600),
  contexto: z.string().min(20).max(15_000),
  /** Perguntas e respostas anteriores desta conversa, da mais antiga à mais nova. */
  conversa: z
    .array(z.object({ pergunta: z.string().max(600), resposta: z.string().max(4_000) }))
    .max(6)
    .default([]),
});

export const perguntarProjecao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Schema.parse(i))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: SISTEMA },
          ...data.conversa.flatMap((t) => [
            { role: "user", content: t.pergunta },
            { role: "assistant", content: t.resposta },
          ]),
          { role: "user", content: `RESUMO:\n${data.contexto}\n\nPERGUNTA: ${data.pergunta}` },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("projeção IA: erro", res.status, text);
      if (res.status === 429)
        throw new Error("Muitas perguntas seguidas. Tente de novo em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha ao consultar a IA (${res.status}).`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resposta = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!resposta) throw new Error("A IA não devolveu resposta. Tente de novo.");
    return { resposta };
  });
