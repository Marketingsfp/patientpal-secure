import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { contextoDataAtual } from "./data-atual";

const AnalysisSchema = z.object({
  clinicaId: z.string().uuid(),
  atendente: z.string().max(120).optional(),
  text: z.string().max(30_000).optional(),
  /** Caminho do áudio no armazenamento privado (clinica/arquivo). */
  audioPath: z.string().max(400).optional(),
  audioMime: z.string().max(120).optional(),
});

/** O que realmente vai para o prompt — montado no servidor, nunca pelo cliente. */
type AnalysisInput = {
  text?: string;
  audio?: { base64: string; mimeType: string };
  checklist?: string[];
  scripts?: { titulo: string; conteudo: string }[];
  tabela?: string;
};

export type AnalysisResult = {
  resumo: string;
  pontuacao: number;
  sentimento: "positivo" | "neutro" | "negativo";
  pontos_positivos: string[];
  pontos_negativos: string[];
  treinamento: { titulo: string; descricao: string }[];
  frases_destaque: { tipo: "positiva" | "negativa"; trecho: string; motivo: string }[];
  transcricao?: string;
  checklist_resultado?: {
    item: string;
    status: "cumprido" | "parcial" | "nao_cumprido" | "nao_aplicavel";
    evidencia: string;
  }[];
  agendamento?: {
    status: "agendado" | "em_negociacao" | "nao_agendado" | "nao_aplicavel";
    motivo: string;
    oportunidades_perdidas: string[];
    aderencia_script: number;
    proxima_acao: string;
  };
  atendimento_ideal?: {
    momento: string;
    dito: string;
    ideal: string;
    motivo: string;
  }[];
  curiosidade_tap?: {
    titulo: string;
    conteudo: string;
    por_que_importa: string;
  };
};

const SYSTEM_PROMPT = `Você é um especialista sênior em CONVERSÃO DE AGENDAMENTOS no atendimento de uma clínica (WhatsApp e ligações). Sua função é analisar a conversa entre atendente e paciente com UM objetivo central: descobrir o que ajudou ou impediu o AGENDAMENTO da consulta/avaliação.

Critérios de análise (sempre com foco em converter o contato em agendamento):
- Abertura que gera conexão e conduz para o agendamento
- Investigação da necessidade/dor do paciente (perguntas certas)
- Apresentação de valor do serviço antes do preço
- Condução ativa: oferta de horários específicos (opção A ou B), sem terminar a conversa aberta
- Tratamento de objeções (preço, tempo, "vou pensar", "vou ver com meu marido", convênio)
- Senso de urgência legítimo e confirmação dos dados do agendamento
- Fechamento: agendou, confirmou data/hora, orientou o próximo passo
- Follow-up combinado quando não houve agendamento

Toda a nota, os pontos positivos, os pontos negativos e o treinamento devem ser avaliados pela ótica da conversão em agendamento (cordialidade só importa se ajudou ou atrapalhou o fechamento).
Ao final, SEMPRE preencha "atendimento_ideal": reescreva os momentos-chave mostrando exatamente como a atendente poderia ter falado para converter o agendamento (frases prontas, no tom da clínica, com horários/valores da tabela quando existir).
Também preencha "curiosidade_tap" com UMA curiosidade/detalhe pouco lembrado sobre os serviços da clínica — preparo, observação, restrição de idade, prazo de resultado, dia exclusivo, diferença dinheiro x cartão. Escolha algo DIFERENTE e variado a cada análise, de preferência ligado ao serviço citado na conversa. Se nenhuma informação foi fornecida, traga uma boa prática de agendamento.
NUNCA mencione que você recebeu uma tabela, planilha ou "TAP", nem cite a existência dessa fonte. Apresente serviços, valores, dias, médicos, horários e preparos como conhecimento normal da clínica.
Seja específico, prático e construtivo. Use exemplos diretos da conversa.
Responda SEMPRE em português do Brasil. Use a ferramenta "registrar_analise" para entregar o resultado.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "registrar_analise",
    description: "Registra a análise estruturada da conversa de atendimento.",
    parameters: {
      type: "object",
      properties: {
        transcricao: {
          type: "string",
          description:
            "Se a entrada foi um áudio, forneça a transcrição completa com identificação de falantes (Atendente / Cliente). Se a entrada já era texto, deixe vazio.",
        },
        resumo: { type: "string", description: "Resumo em 2-3 frases do atendimento." },
        pontuacao: {
          type: "number",
          description:
            "Nota geral de 0 a 10 medindo a qualidade da CONDUÇÃO PARA O AGENDAMENTO (não apenas a educação do atendente).",
        },
        sentimento: {
          type: "string",
          enum: ["positivo", "neutro", "negativo"],
          description: "Sentimento geral percebido pelo cliente ao final.",
        },
        pontos_positivos: {
          type: "array",
          items: { type: "string" },
          description:
            "3 a 6 comportamentos que aproximaram o paciente do agendamento.",
        },
        pontos_negativos: {
          type: "array",
          items: { type: "string" },
          description:
            "3 a 6 falhas que reduziram a chance de agendamento, específicas e acionáveis.",
        },
        treinamento: {
          type: "array",
          description:
            "3 a 5 treinamentos práticos, todos voltados a aumentar a conversão em agendamento.",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              descricao: { type: "string" },
            },
            required: ["titulo", "descricao"],
            additionalProperties: false,
          },
        },
        agendamento: {
          type: "object",
          description: "Diagnóstico de conversão do contato em agendamento.",
          properties: {
            status: {
              type: "string",
              enum: ["agendado", "em_negociacao", "nao_agendado", "nao_aplicavel"],
              description: "Desfecho do contato quanto ao agendamento.",
            },
            motivo: {
              type: "string",
              description: "Por que agendou ou por que não agendou (1-2 frases, baseado na conversa).",
            },
            oportunidades_perdidas: {
              type: "array",
              items: { type: "string" },
              description:
                "Momentos exatos em que o atendente poderia ter oferecido horário, tratado objeção ou fechado e não fez.",
            },
            aderencia_script: {
              type: "number",
              description:
                "0 a 100: aderência aos scripts padrão de agendamento fornecidos. Se nenhum script foi fornecido, use 0.",
            },
            proxima_acao: {
              type: "string",
              description: "A próxima ação concreta para converter ou confirmar este agendamento.",
            },
          },
          required: ["status", "motivo", "oportunidades_perdidas", "aderencia_script", "proxima_acao"],
          additionalProperties: false,
        },
        frases_destaque: {
          type: "array",
          description: "Trechos exatos da conversa que ilustram acertos ou erros.",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["positiva", "negativa"] },
              trecho: { type: "string" },
              motivo: { type: "string" },
            },
            required: ["tipo", "trecho", "motivo"],
            additionalProperties: false,
          },
        },
        checklist_resultado: {
          type: "array",
          description:
            "Avaliação item-a-item do checklist padrão fornecido pelo usuário. Inclua TODOS os itens do checklist, na mesma ordem, mesmo os não cumpridos. Se nenhum checklist foi fornecido, deixe vazio.",
          items: {
            type: "object",
            properties: {
              item: { type: "string", description: "Texto exato do item do checklist." },
              status: {
                type: "string",
                enum: ["cumprido", "parcial", "nao_cumprido", "nao_aplicavel"],
              },
              evidencia: {
                type: "string",
                description: "1 frase curta com trecho/justificativa observada na conversa.",
              },
            },
            required: ["item", "status", "evidencia"],
            additionalProperties: false,
          },
        },
        atendimento_ideal: {
          type: "array",
          description:
            "4 a 6 momentos da conversa reescritos: como a atendente PODERIA ter atendido para converter o agendamento. Siga a ordem cronológica da conversa (abertura, investigação, valor/preço, objeção, oferta de horário, fechamento/follow-up).",
          items: {
            type: "object",
            properties: {
              momento: {
                type: "string",
                description: "Etapa do atendimento (ex.: Abertura, Objeção de preço, Oferta de horário).",
              },
              dito: {
                type: "string",
                description: "O que a atendente realmente disse (trecho curto) ou 'Não abordou'.",
              },
              ideal: {
                type: "string",
                description:
                  "A fala ideal, pronta para ser usada, em primeira pessoa, natural e conduzindo ao agendamento.",
              },
              motivo: {
                type: "string",
                description: "Em 1 frase, por que essa fala converte melhor.",
              },
            },
            required: ["momento", "dito", "ideal", "motivo"],
            additionalProperties: false,
          },
        },
        curiosidade_tap: {
          type: "object",
          description:
            "Uma curiosidade / detalhe pouco lembrado da TAP para a atendente memorizar. Varie o tema a cada análise.",
          properties: {
            titulo: { type: "string", description: "Título curto (ex.: 'Bota de Unna soma dois valores')." },
            conteudo: { type: "string", description: "A informação exata da tabela, em 1-2 frases." },
            por_que_importa: {
              type: "string",
              description: "Em 1 frase, como isso ajuda a agendar sem erro.",
            },
          },
          required: ["titulo", "conteudo", "por_que_importa"],
          additionalProperties: false,
        },
      },
      required: [
        "resumo",
        "pontuacao",
        "sentimento",
        "pontos_positivos",
        "pontos_negativos",
        "treinamento",
        "frases_destaque",
        "agendamento",
        "atendimento_ideal",
        "curiosidade_tap",
      ],
      additionalProperties: false,
    },
  },
};

function buildUserMessage(input: AnalysisInput) {
  const checklistTxt =
    input.checklist && input.checklist.length > 0
      ? `\n\nChecklist padrão obrigatório a ser avaliado item-a-item (preencha checklist_resultado para CADA item, na mesma ordem):\n- ${input.checklist.join("\n- ")}`
      : "";
  const scriptsAtivos = (input.scripts ?? []).filter((s) => s.conteudo.trim());
  const scriptsTxt =
    scriptsAtivos.length > 0
      ? `\n\nSCRIPTS PADRÃO DE AGENDAMENTO da clínica (compare a conversa com eles, aponte desvios e preencha agendamento.aderencia_script de 0 a 100):\n\n${scriptsAtivos
          .map((s, i) => `Script ${i + 1} — ${s.titulo || "Sem título"}:\n${s.conteudo.trim()}`)
          .join("\n\n")}`
      : "";
  const tabelaTxt = input.tabela?.trim()
    ? `\n\nTABELA OFICIAL DE ATENDIMENTOS E PREÇOS (TAP) da clínica — use como verdade absoluta para checar se a atendente informou serviço, preço (dinheiro/cartão), dia, médico, horário, preparo e observações corretos. Aponte como falha qualquer informação divergente da tabela:\n\n${input.tabela.trim()}`
    : "";
  if (input.audio) {
    return {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: `Transcreva a ligação a seguir (identificando Atendente e Cliente) e em seguida faça a análise completa com foco em CONVERSÃO DE AGENDAMENTO. Chame a ferramenta registrar_analise.${checklistTxt}${scriptsTxt}${tabelaTxt}`,
        },
        {
          type: "input_audio" as const,
          input_audio: {
            data: input.audio.base64,
            // Gravação de celular costuma vir em m4a/ogg; antes tudo isso ia
            // como "webm" e a transcrição podia falhar.
            format: formatoAudio(input.audio.mimeType),
          },
        },
      ],
    };
  }
  return {
    role: "user" as const,
    content: `Analise a seguinte conversa de WhatsApp / transcrição de atendimento com foco em CONVERSÃO DE AGENDAMENTO e chame a ferramenta registrar_analise:${checklistTxt}${scriptsTxt}${tabelaTxt}\n\n${input.text}`,
  };
}

export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const parsed = AnalysisSchema.parse(data);
    if (!parsed.text && !parsed.audioPath) {
      throw new Error("Envie um texto ou um áudio para análise.");
    }
    if (parsed.text && parsed.text.trim().length < 20) {
      throw new Error("O texto é muito curto para análise (mínimo 20 caracteres).");
    }
    return parsed;
  })
  .handler(async ({ data, context }): Promise<AnalysisResult> => {
    const guard = await import("./guard.server");
    const { garantirAcessoCoach, configDaClinica, baseParaPrompt, registrarUsoIA, erroGenericoIA } =
      guard;
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;

    // Analisar atendimento é ação de gestão do Coach.
    await garantirAcessoCoach(db, data.clinicaId, "write");
    const usoId = await registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "analise",
      atendente: data.atendente ?? null,
    });

    const config = await configDaClinica(db, data.clinicaId);
    const audio = data.audioPath
      ? await lerAudio(db, data.clinicaId, data.audioPath, data.audioMime, config.reterAudioDias)
      : undefined;

    const entrada: AnalysisInput = {
      text: data.text,
      audio,
      checklist: config.checklist,
      scripts: config.scripts,
      // Texto: recorta pelo assunto da própria conversa. Áudio: recorte geral,
      // porque o conteúdo só se conhece depois da transcrição.
      tabela: baseParaPrompt(config, data.text ?? "", 40_000),
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("O recurso de IA está indisponível no momento. Avise a gestão da clínica.");
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: `${contextoDataAtual()}\n\n${SYSTEM_PROMPT}` },
          buildUserMessage(entrada),
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "registrar_analise" } },
      }),
    });

    if (!res.ok) await erroGenericoIA(res, "analise");

    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("Resposta inesperada da IA:", JSON.stringify(json).slice(0, 500));
      throw new Error("A IA não retornou uma análise estruturada. Tente novamente.");
    }

    const parsed = JSON.parse(toolCall.function.arguments) as AnalysisResult;
    return parsed;
  });
/** Formato do áudio para a IA, a partir do tipo do arquivo enviado. */
function formatoAudio(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("m4a") || m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("flac")) return "flac";
  return "webm";
}

/**
 * Baixa o áudio do armazenamento privado e devolve em base64 para a IA.
 *
 * Antes a gravação inteira (até 18 MB) viajava dentro da requisição; agora a
 * tela envia o arquivo para o armazenamento e manda só o caminho. Depois da
 * análise o arquivo é apagado (ou mantido pelos dias configurados na clínica).
 */
async function lerAudio(
  db: import("./guard.server").ClienteCoach,
  clinicaId: string,
  caminho: string,
  mime: string | undefined,
  reterDias: number,
): Promise<{ base64: string; mimeType: string }> {
  if (!caminho.startsWith(`${clinicaId}/`)) {
    throw new Error("Áudio inválido para esta clínica.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from("coach-audios").download(caminho);
  if (error || !data) {
    console.error("[coach] download do áudio", error?.message);
    throw new Error("Não foi possível ler o áudio enviado. Envie novamente.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error("Áudio muito grande. O limite é 25 MB.");
  }
  let binario = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + bloco)));
  }

  if (reterDias <= 0) {
    await supabaseAdmin.storage.from("coach-audios").remove([caminho]);
  } else {
    await limparAudiosAntigos(clinicaId, reterDias);
  }

  void db;
  return { base64: btoa(binario), mimeType: mime || "audio/mpeg" };
}

/** Remove as gravações da clínica que passaram do prazo de retenção. */
async function limparAudiosAntigos(clinicaId: string, reterDias: number): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.storage
      .from("coach-audios")
      .list(clinicaId, { limit: 200, sortBy: { column: "created_at", order: "asc" } });
    const limite = Date.now() - reterDias * 24 * 60 * 60 * 1000;
    const velhos = (data ?? [])
      .filter((f) => new Date(f.created_at ?? Date.now()).getTime() < limite)
      .map((f) => `${clinicaId}/${f.name}`);
    if (velhos.length) await supabaseAdmin.storage.from("coach-audios").remove(velhos);
  } catch (e) {
    console.error("[coach] limpeza de áudios", e);
  }
}
