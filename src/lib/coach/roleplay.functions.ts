import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { contextoDataAtual } from "./data-atual";

const StartSchema = z.object({
  clinicaId: z.string().uuid(),
  atendente: z.string().min(1).max(120),
  pontos_fracos: z.array(z.string().min(1).max(500)).min(1).max(10),
  contexto: z.string().max(600).optional(),
  /** Nomes de pacientes, temas e perguntas já usados nesta trilha — nunca repetir. */
  evitar: z.array(z.string().max(200)).max(60).optional(),
  /** Semente para forçar variação entre simulações. */
  seed: z.string().max(40).optional(),
  dificuldade: z.enum(["facil", "medio", "dificil"]).optional(),
  exemplos: z
    .array(
      z.object({
        resumo: z.string().max(2000).optional(),
        transcricao: z.string().max(8000).optional(),
        pontos_negativos: z.array(z.string().max(500)).max(10).optional(),
        frases_negativas: z.array(z.string().max(800)).max(10).optional(),
      }),
    )
    .max(8)
    .optional(),
});

const MessageSchema = z.object({
  role: z.enum(["cliente", "atendente"]),
  content: z.string().min(1).max(4000),
});

const ReplySchema = z.object({
  clinicaId: z.string().uuid(),
  atendente: z.string().min(1).max(120),
  pontos_fracos: z.array(z.string().min(1).max(500)).min(1).max(10),
  cenario: z.string().min(1).max(4000),
  perfil_cliente: z.string().min(1).max(2000),
  history: z.array(MessageSchema).min(1).max(400),
  dificuldade: z.enum(["facil", "medio", "dificil"]).optional(),
  encerrar: z.boolean().optional(),
});

export type RoleplayScenario = {
  cenario: string;
  perfil_cliente: string;
  objetivo: string;
  primeira_mensagem: string;
  nome_paciente?: string;
};

export type RoleplayFeedback = {
  nota: number;
  resumo: string;
  acertos: string[];
  melhorias: string[];
  dica_pratica: string;
  agendou?: boolean;
  aderencia_script?: number;
};

export type RoleplayTurn = {
  resposta_cliente?: string;
  finalizar: boolean;
  feedback?: RoleplayFeedback;
  avaliacao_turno?: TurnoAvaliacao;
};

/** Micro-feedback do treinador sobre a última mensagem da atendente. */
export type TurnoAvaliacao = {
  nivel: "bom" | "atencao" | "ruim";
  comentario: string;
  sugestao?: string;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

function authHeaders() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não está configurada.");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

const START_TOOL = {
  type: "function" as const,
  function: {
    name: "iniciar_roleplay",
    description: "Cria um cenário de roleplay focado nos pontos fracos do atendente.",
    parameters: {
      type: "object",
      properties: {
        cenario: { type: "string", description: "Descrição curta do contexto do atendimento (1-2 frases)." },
        perfil_cliente: { type: "string", description: "Perfil do cliente simulado: humor, estilo, urgência, gatilhos." },
        objetivo: { type: "string", description: "O que o atendente precisa demonstrar nesta simulação." },
        primeira_mensagem: {
          type: "string",
          description:
            "Primeira mensagem que o cliente envia no WhatsApp/ligação iniciando o atendimento. Deve ser única: não repetir a mesma pergunta de abertura de outras simulações.",
        },
        nome_paciente: {
          type: "string",
          description:
            "Nome e sobrenome do paciente simulado (brasileiro, comum mas variado). Nunca reutilizar nomes já usados.",
        },
      },
      required: ["cenario", "perfil_cliente", "objetivo", "primeira_mensagem", "nome_paciente"],
      additionalProperties: false,
    },
  },
};


/** Instruções de comportamento do paciente conforme o nível de dificuldade escolhido. */
function instrucaoDificuldade(nivel?: "facil" | "medio" | "dificil") {
  if (nivel === "facil")
    return `NÍVEL FÁCIL: o paciente é receptivo e educado, faz no máximo uma objeção simples e aceita agendar quando recebe horário e valor claros.`;
  if (nivel === "dificil")
    return `NÍVEL DIFÍCIL: o paciente é apressado, desconfiado e resistente. Faça pelo menos 3 objeções fortes e encadeadas ("vou pensar", falta de tempo, desconfiança do profissional, dúvida se precisa mesmo do exame, distância, convênio). Responda curto e às vezes seco e só agende se a atendente contornar as objeções com valor concreto, benefício e oferta de horários específicos. Se ela hesitar ou não conduzir, ameace encerrar a conversa. NUNCA peça desconto, abatimento, promoção ou "faz um preço melhor" — o valor informado é fixo e não se negocia.`;
  return `NÍVEL MÉDIO: o paciente tem dúvidas normais de horário, preparo e necessidade do exame, e faz 2 objeções comuns antes de decidir. Nunca pede desconto nem negocia preço.`;
}

export const startRoleplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartSchema.parse(data))
  .handler(async ({ data, context }): Promise<RoleplayScenario> => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "roleplay-inicio",
      atendente: data.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    // Conteúdo da clínica vem do banco, nunca do navegador.
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    const tabelaTexto = guard.baseParaPrompt(config, data.contexto ?? "", 12_000);

    const system = `${contextoDataAtual()}

Você é um treinador de CONVERSÃO DE AGENDAMENTOS de uma clínica. Sua tarefa é criar uma simulação realista de atendimento (WhatsApp/ligação) para treinar uma atendente a converter o contato em AGENDAMENTO, focando exatamente nos pontos fracos dela.

Regras:
- O objetivo da simulação é SEMPRE fechar um agendamento (consulta/avaliação): o cliente é um paciente interessado, mas com dúvidas e objeções.
- O cenário DEVE ser inspirado em atendimentos REAIS anteriores da atendente (use os exemplos fornecidos como base do contexto, tipo de cliente, tema do problema e gatilhos que costumam aparecer).
- O cenário deve forçar o atendente a praticar os pontos fracos listados.
- Crie um cliente realista, com personalidade marcante (impaciente, confuso, indignado, indeciso, etc.) — escolha o perfil que melhor pressione os pontos fracos e que se pareça com clientes que ela já atendeu.
- O campo "objetivo" deve descrever o que ela precisa demonstrar para conquistar o agendamento.
- A primeira mensagem do cliente deve ser natural, em português do Brasil, como se fosse uma mensagem real de WhatsApp.
- NÃO revele os pontos fracos no texto. NÃO escreva instruções ao atendente.
- NÃO copie literalmente frases dos exemplos — use-os apenas como inspiração de tema, tom e tipo de problema.
- Chame SEMPRE a ferramenta iniciar_roleplay.

${instrucaoDificuldade(data.dificuldade)}
O perfil_cliente e a primeira mensagem devem refletir esse nível de dificuldade.`;

    const exemplosTxt = (data.exemplos ?? [])
      .map((ex, i) => {
        const partes: string[] = [`Exemplo ${i + 1}:`];
        if (ex.resumo) partes.push(`Resumo: ${ex.resumo}`);
        if (ex.pontos_negativos?.length)
          partes.push(`Falhas observadas: ${ex.pontos_negativos.join("; ")}`);
        if (ex.frases_negativas?.length)
          partes.push(`Trechos problemáticos: ${ex.frases_negativas.join(" | ")}`);
        if (ex.transcricao) partes.push(`Transcrição:\n${ex.transcricao}`);
        return partes.join("\n");
      })
      .join("\n\n---\n\n");

    const user = `Atendente: ${data.atendente}\n\nPontos fracos recorrentes que precisamos treinar:\n- ${data.pontos_fracos.join("\n- ")}\n\n${
      scriptsTexto
        ? `Scripts padrão de agendamento da clínica (o treino deve exigir esses passos):\n\n${scriptsTexto}\n\n`
        : ""
    }${
      exemplosTxt
        ? `Atendimentos anteriores REAIS dela (use como base do cenário):\n\n${exemplosTxt}\n\n`
        : ""
    }${
      tabelaTexto.trim()
        ? `Serviços, valores, dias, médicos e horários da clínica — o cenário deve pedir um serviço que exista aqui, com dados reais. Nunca mencione tabela, planilha ou "TAP":\n\n${tabelaTexto.trim()}\n\n`
        : ""
    }Crie o cenário e a primeira mensagem do cliente, inspirando-se nos atendimentos reais acima.`;

    const evitarTxt = data.evitar?.length
      ? `\n\nPROIBIDO REPETIR — já foram usados nesta trilha (nomes de pacientes, serviços e perguntas de abertura). Escolha itens completamente diferentes de todos estes:\n- ${data.evitar
          .slice(0, 60)
          .join("\n- ")}`
      : "";

    const userFinal = `${user}${
      data.contexto?.trim()
        ? `\n\nCONTEXTO OBRIGATÓRIO desta simulação (precisa ser totalmente diferente de outras simulações): ${data.contexto.trim()}`
        : ""
    }${evitarTxt}

REGRAS DE UNICIDADE (obrigatórias):
- Paciente NOVO: nome e sobrenome brasileiros diferentes dos já usados; evite nomes clichê de IA (Maria Silva, João Silva, Ana Souza, Carlos Oliveira).
- Varie idade, gênero, bairro/cidade, profissão, canal de origem (indicação, Instagram, placa, Google) e tom de voz.
- A primeira mensagem deve ter uma FORMA de abertura diferente: às vezes só "oi, bom dia", às vezes já pergunta preço, às vezes manda pedido médico, às vezes pergunta horário ou endereço, com erros de digitação leves quando fizer sentido.
- Nenhuma pergunta ou objeção pode repetir literalmente as anteriores.
- Variação obrigatória (seed ${data.seed ?? Math.random().toString(36).slice(2, 8)}): use essa semente para diversificar as escolhas.`;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userFinal },
        ],
        temperature: 1,
        tools: [START_TOOL],
        tool_choice: { type: "function", function: { name: "iniciar_roleplay" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "roleplay-inicio");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("A IA não retornou um cenário válido.");
    return JSON.parse(args) as RoleplayScenario;
  });

const REPLY_TOOL = {
  type: "function" as const,
  function: {
    name: "responder_cliente",
    description:
      "Próxima mensagem do cliente no roleplay, ou encerramento da sessão com feedback completo.",
    parameters: {
      type: "object",
      properties: {
        finalizar: {
          type: "boolean",
          description:
            "True se o roleplay deve ser encerrado agora (atendimento resolvido, abandonado, ou solicitado o encerramento).",
        },
        resposta_cliente: {
          type: "string",
          description:
            "Próxima mensagem do cliente (somente quando finalizar=false). Mantenha curta, natural, em pt-BR.",
        },
        feedback: {
          type: "object",
          description: "Preencher SOMENTE quando finalizar=true.",
          properties: {
            nota: {
              type: "number",
              description:
                "Nota de 0 a 10 do desempenho na condução para o AGENDAMENTO nesta simulação.",
            },
            agendou: {
              type: "boolean",
              description: "True se a atendente conseguiu fechar o agendamento na simulação.",
            },
            aderencia_script: {
              type: "number",
              description:
                "0 a 100: aderência aos scripts padrão de agendamento. Use 0 se nenhum script foi fornecido.",
            },
            resumo: { type: "string", description: "1-2 frases de como foi o atendimento simulado." },
            acertos: {
              type: "array",
              items: { type: "string" },
              description: "2-5 acertos concretos que aproximaram o paciente do agendamento.",
            },
            melhorias: {
              type: "array",
              items: { type: "string" },
              description:
                "2-5 melhorias práticas para converter mais agendamentos, ligadas aos pontos fracos trabalhados.",
            },
            dica_pratica: {
              type: "string",
              description: "Uma dica acionável de fechamento para a próxima conversa real.",
            },
          },
          required: ["nota", "resumo", "acertos", "melhorias", "dica_pratica"],
          additionalProperties: false,
        },
        avaliacao_turno: {
          type: "object",
          description:
            "OBRIGATÓRIO em TODAS as chamadas (inclusive quando finalizar=true): avaliação do treinador sobre a ÚLTIMA mensagem da atendente.",
          properties: {
            nivel: {
              type: "string",
              enum: ["bom", "atencao", "ruim"],
              description:
                "bom = ajudou a converter; atencao = ok mas faltou algo; ruim = erro, informação errada ou perdeu a oportunidade.",
            },
            comentario: {
              type: "string",
              description:
                "1 frase curta (máx. 140 caracteres) dizendo o que essa mensagem fez de certo ou errado para o agendamento.",
            },
            sugestao: {
              type: "string",
              description:
                "Como ela poderia ter dito melhor (frase pronta e curta). Preencher quando nivel for atencao ou ruim.",
            },
          },
          required: ["nivel", "comentario"],
          additionalProperties: false,
        },
      },
      required: ["finalizar"],
      additionalProperties: false,
    },
  },
};

export const roleplayReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ReplySchema.parse(data))
  .handler(async ({ data, context }): Promise<RoleplayTurn> => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "roleplay-turno",
      atendente: data.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    // A base vai em TODO turno: aqui o teto é bem menor e o recorte usa o
    // cenário mais as últimas falas, não a base inteira.
    const assunto = [data.cenario, ...data.history.slice(-6).map((m) => m.content)].join(" ");
    const tabelaTexto = guard.baseParaPrompt(config, assunto, 10_000);

    const system = `${contextoDataAtual()}

Você está conduzindo uma simulação de treinamento de CONVERSÃO DE AGENDAMENTO de uma clínica.

Seu papel: interpretar o PACIENTE que entrou em contato com a clínica. Você está conversando com a atendente ${data.atendente}. Você quer resolver seu problema, mas só agenda se for bem conduzido.

Cenário: ${data.cenario}
Perfil do cliente que você interpreta: ${data.perfil_cliente}

Pontos fracos da atendente que esta simulação precisa estressar:
- ${data.pontos_fracos.join("\n- ")}
${scriptsTexto ? `\nScripts padrão de agendamento que a atendente deveria seguir (use-os para avaliar no feedback, nunca os cite durante a conversa):\n\n${scriptsTexto}\n` : ""}
${tabelaTexto.trim() ? `\nServiços, valores em dinheiro/cartão, dias, médicos, horários e preparos da clínica. Como paciente, pergunte sobre esses itens e cobre coerência; no feedback, penalize preço/dia/preparo informados errados. NUNCA mencione tabela, planilha, "TAP" ou qualquer fonte fornecida — trate como conhecimento normal da clínica:\n\n${tabelaTexto.trim()}\n` : ""}
Regras de interpretação:
- Responda SEMPRE em português do Brasil, curto e natural, como mensagem real de WhatsApp.
- Mantenha consistência com o perfil do cliente. Pressione os pontos fracos sem exagero teatral.
- Levante objeções realistas (horário, "vou pensar", convênio, distância, dúvida se precisa do exame). Só aceite agendar se a atendente conduzir bem, apresentar valor e oferecer horários concretos.
- PROIBIDO pedir desconto, promoção, abatimento, parcelamento extra ou dizer "vi mais barato"/"faz um preço melhor". O valor da clínica é fixo: você pode perguntar o preço uma vez, mas nunca tentar negociar.
- Se a atendente não oferecer horário nem conduzir para o agendamento, esfrie o interesse.
- Não saia do personagem. Não dê dicas. Não use markdown.
- Se a atendente fechar o agendamento e confirmar dados, confirme e encerre.
- Se o atendente pedir para encerrar, ou se o cliente claramente desistir/resolver, finalize.
- O feedback final deve avaliar principalmente se o agendamento foi conquistado e o que faltou para converter.
- Além do personagem, você também é TREINADOR: em TODA chamada da ferramenta preencha avaliacao_turno avaliando a ÚLTIMA mensagem da atendente (nivel, comentario curto e sugestao de fala melhor quando não estiver bom). Isso é feedback para ela, não faz parte da conversa — nunca repita esse conteúdo dentro de resposta_cliente.
- Quando "encerrar" for solicitado no input OU quando o atendimento naturalmente terminar, chame a ferramenta com finalizar=true e preencha feedback. Caso contrário, finalizar=false e resposta_cliente preenchida.
- SEMPRE chame a ferramenta responder_cliente.

${instrucaoDificuldade(data.dificuldade)}`;


    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: system },
    ];
    // Só os últimos 20 turnos vão na íntegra; o começo da conversa entra como
    // resumo curto, para o custo do turno não crescer sem limite.
    const historico = data.history;
    const recentes = historico.slice(-20);
    const anteriores = historico.slice(0, Math.max(0, historico.length - 20));
    if (anteriores.length) {
      messages.push({
        role: "user",
        content: `[RESUMO DO INÍCIO DA CONVERSA (${anteriores.length} mensagens): ${anteriores
          .map((m) => `${m.role === "cliente" ? "Paciente" : "Atendente"}: ${m.content.slice(0, 160)}`)
          .join(" | ")
          .slice(0, 3000)}]`,
      });
    }
    for (const m of recentes) {
      messages.push({
        role: m.role === "cliente" ? "assistant" : "user",
        content: m.content,
      });
    }
    if (data.encerrar) {
      messages.push({
        role: "user",
        content:
          "[INSTRUÇÃO DO SISTEMA: a atendente solicitou encerrar a simulação agora. Chame responder_cliente com finalizar=true e o feedback completo.]",
      });
    }

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: [REPLY_TOOL],
        tool_choice: { type: "function", function: { name: "responder_cliente" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "roleplay-turno");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("A IA não retornou uma resposta válida.");
    return JSON.parse(args) as RoleplayTurn;
  });