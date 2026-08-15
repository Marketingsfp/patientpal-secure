import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAcessoModulo } from "@/lib/permissoes.server";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MODULO = "consulta-ia";

const Schema = z.object({
  clinicaId: z.string().uuid(),
  contexto: z.string().max(30_000).optional(),
  especialidade: z.string().max(80).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * Registra no `audit_log` que uma anamnese foi enviada para um modelo de IA
 * de terceiro.
 *
 * POR QUE ISTO EXISTE: esta função manda texto clínico livre para fora da
 * infraestrutura da clínica (gateway da Lovable -> Google Gemini). São dados
 * pessoais sensíveis de saúde (LGPD art. 11). Sem registro, não havia como
 * responder "quem mandou o quê, e quando" — nem em auditoria interna, nem
 * diante de um incidente.
 *
 * O QUE NÃO É GRAVADO: o texto da anamnese. Copiá-lo para o audit_log criaria
 * uma SEGUNDA cópia do dado sensível, numa tabela com regra de acesso
 * diferente — o oposto da minimização que a LGPD pede. Guardamos metadados
 * suficientes para rastrear (quem, quando, qual clínica, tamanho, modelo) e um
 * resumo do conteúdo apenas em quantidade de caracteres.
 *
 * Escrita via `supabaseAdmin` de propósito: `audit_log` não tem policy de
 * INSERT para `authenticated`, e é justamente assim que deve ser — o usuário
 * auditado não pode forjar nem suprimir o próprio rastro.
 */
async function registrarAuditoria(dados: {
  clinicaId: string;
  userId: string;
  userEmail: string | null;
  especialidade?: string;
  tamanhoContexto: number;
  qtdMensagens: number;
  status: "enviado" | "erro";
  detalheErro?: string;
}) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      clinica_id: dados.clinicaId,
      user_id: dados.userId,
      user_email: dados.userEmail,
      table_name: "consulta_ia",
      action: "AI_CONSULTA",
      dados_depois: {
        modulo: MODULO,
        modelo: MODEL,
        gateway: GATEWAY,
        especialidade: dados.especialidade ?? null,
        caracteres_contexto: dados.tamanhoContexto,
        mensagens_no_historico: dados.qtdMensagens,
        status: dados.status,
        ...(dados.detalheErro ? { erro: dados.detalheErro } : {}),
      },
    });
  } catch (e) {
    // Não derruba o atendimento por causa do log: a clínica está no meio de
    // uma consulta. Mas registra alto no servidor para não passar silencioso.
    console.error("[consulta-ia] FALHA AO AUDITAR envio de anamnese para IA:", e);
  }
}

/**
 * Assistente clínico livre ("Consultar com IA").
 * Recebe uma anamnese livre digitada pelo médico + o histórico da conversa
 * e devolve a resposta em Markdown. A chave LOVABLE_API_KEY nunca sai do servidor.
 *
 * AUTORIZAÇÃO: estar logado não basta. Antes de qualquer coisa sair da
 * clínica, confirmamos vínculo ativo com a clínica informada E permissão de
 * escrita no módulo "consulta-ia" no perfil do usuário — a mesma matriz da
 * tela de Perfis de Acesso. Antes, a única trava era o menu escondido no
 * navegador, que não impede ninguém de chamar esta função direto.
 */
export const consultarIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // Barreira de autorização — antes de ler a chave e antes de qualquer
    // chamada externa. Se falhar, nada de dado clínico sai daqui.
    await assertAcessoModulo(supabase, userId, data.clinicaId, MODULO, "write");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const userEmail = typeof claims?.email === "string" ? claims.email : null;
    const contexto = data.contexto?.trim();

    const auditoriaBase = {
      clinicaId: data.clinicaId,
      userId,
      userEmail,
      especialidade: data.especialidade?.trim() || undefined,
      tamanhoContexto: contexto?.length ?? 0,
      qtdMensagens: data.messages.length,
    };

    // Registra ANTES do envio: o que precisa ficar rastreado é a saída do dado
    // da clínica, e ela acontece no fetch abaixo. Auditar só o sucesso deixaria
    // de fora justamente as tentativas que falharam no meio.
    await registrarAuditoria({ ...auditoriaBase, status: "enviado" });

    const sys = `Você é um assistente clínico de apoio à decisão para ${
      data.especialidade?.trim() || "clínica geral"
    } no Brasil.
Responda SEMPRE em português do Brasil e em Markdown, com títulos curtos, listas e negrito nos achados relevantes.
Seja objetivo e estruturado. Quando propuser hipóteses diagnósticas, ordene por probabilidade e cite os sinais que sustentam cada uma.
Quando os dados forem insuficientes, diga claramente o que falta perguntar ou medir.
NUNCA substitua o julgamento clínico do médico: apresente tudo como sugestão a confirmar.`;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          ...(contexto
            ? [
                {
                  role: "system" as const,
                  content: `Anamnese livre / dados informados pelo médico:\n${contexto}`,
                },
              ]
            : []),
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Lovable AI error", res.status, text);
      await registrarAuditoria({
        ...auditoriaBase,
        status: "erro",
        detalheErro: `HTTP ${res.status}`,
      });
      if (res.status === 429) throw new Error("Limite de uso atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha IA (${res.status})`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resposta = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { resposta: resposta || "Não foi possível gerar uma resposta." };
  });
