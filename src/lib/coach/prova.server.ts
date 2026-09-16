export const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODEL = "google/gemini-3.8-flash";

export type ProvaQuestao = {
  pergunta: string;
  alternativas: string[];
  correta: number;
  explicacao: string;
  origem: string;
};

export type ProvaGerada = {
  titulo: string;
  questoes: ProvaQuestao[];
};

export type ProvaExemplo = {
  titulo?: string;
  resumo?: string;
  pontos_positivos?: string[];
  pontos_negativos?: string[];
  frases?: { tipo: string; trecho: string; motivo: string }[];
  checklist?: { item: string; status: string }[];
  transcricao?: string;
};

export const SYSTEM_PROMPT = `Você é um instrutor sênior de CONVERSÃO DE AGENDAMENTOS no atendimento (WhatsApp e ligações) de uma clínica.

Sua tarefa: criar uma PROVA de múltipla escolha para treinar o atendente a CONVERTER contatos em agendamento, baseada EXCLUSIVAMENTE nas avaliações reais de atendimentos dele que serão fornecidas.

Regras obrigatórias:
- TODAS as questões devem tratar de conversão em agendamento: condução da conversa, oferta de horários, apresentação de valor, tratamento de objeções (preço, tempo, convênio, "vou pensar"), confirmação de dados e follow-up.
- Quando scripts padrão de agendamento forem fornecidos, a alternativa correta deve refletir o script.
- Cada questão deve nascer de um ponto observado nas avaliações (principalmente das falhas e dos itens de checklist não cumpridos).
- Use situações concretas dos atendimentos reais, mas NUNCA exponha nomes de pacientes nem dados pessoais.
- 4 alternativas por questão, apenas uma correta, e as erradas devem ser plausíveis (erros que o atendente realmente comete).
- A explicação deve ensinar o comportamento correto de forma prática.
- O campo "origem" deve dizer, em poucas palavras, de qual ponto da avaliação a questão veio (ex.: "não confirmou dados do paciente").
- Quando as informações de serviços e preços da clínica forem fornecidas, parte das questões deve cobrar domínio delas: serviço, valor em dinheiro e no cartão, dia, médico, horário, preparo e observações. As alternativas erradas devem usar valores/dias plausíveis mas incorretos, e a correta deve bater exatamente com essas informações.
- NUNCA mencione uma tabela, planilha, "TAP" ou qualquer fonte fornecida nos enunciados, alternativas, explicações ou no campo "origem". Trate esses dados como conhecimento normal da clínica.
- Responda SEMPRE em português do Brasil e chame a ferramenta "registrar_prova".`;

export const PROVA_TOOL = {
  type: "function" as const,
  function: {
    name: "registrar_prova",
    description: "Registra a prova de múltipla escolha gerada a partir das avaliações.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto da prova." },
        questoes: {
          type: "array",
          description: "Questões de múltipla escolha.",
          items: {
            type: "object",
            properties: {
              pergunta: { type: "string" },
              alternativas: {
                type: "array",
                items: { type: "string" },
                description: "Exatamente 4 alternativas.",
              },
              correta: { type: "number", description: "Índice (0-3) da alternativa correta." },
              explicacao: { type: "string" },
              origem: { type: "string" },
            },
            required: ["pergunta", "alternativas", "correta", "explicacao", "origem"],
            additionalProperties: false,
          },
        },
      },
      required: ["titulo", "questoes"],
      additionalProperties: false,
    },
  },
};

export function authHeaders() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não está configurada.");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

export function buildUserPrompt(
  atendente: string,
  quantidade: number,
  exemplos: ProvaExemplo[],
  scripts?: string,
  tabela?: string,
) {
  const blocos = exemplos
    .map((e, i) => {
      const parts: string[] = [`Atendimento ${i + 1}${e.titulo ? ` — ${e.titulo}` : ""}`];
      if (e.resumo) parts.push(`Resumo: ${e.resumo}`);
      if (e.pontos_negativos?.length)
        parts.push(`Falhas observadas:\n- ${e.pontos_negativos.join("\n- ")}`);
      if (e.pontos_positivos?.length)
        parts.push(`Acertos observados:\n- ${e.pontos_positivos.join("\n- ")}`);
      if (e.frases?.length)
        parts.push(
          `Trechos marcados:\n${e.frases
            .map((f) => `(${f.tipo}) "${f.trecho}" — ${f.motivo}`)
            .join("\n")}`,
        );
      if (e.checklist?.length)
        parts.push(
          `Checklist:\n${e.checklist.map((c) => `- ${c.item}: ${c.status}`).join("\n")}`,
        );
      if (e.transcricao) parts.push(`Trecho da conversa:\n${e.transcricao.slice(0, 2500)}`);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  return `Atendente avaliado: ${atendente}
Gere exatamente ${quantidade} questões de múltipla escolha focadas em conversão de agendamento, priorizando os erros mais recorrentes.
${scripts ? `\nSCRIPTS PADRÃO DE AGENDAMENTO da clínica (base das respostas corretas):\n\n${scripts}\n` : ""}
${tabela?.trim() ? `\nTABELA OFICIAL DE ATENDIMENTOS E PREÇOS (TAP) da clínica (fonte da verdade para questões de valores, dias, médicos, horários e preparos):\n\n${tabela.trim()}\n` : ""}

AVALIAÇÕES REAIS:

${blocos}`;
}

export function normalize(raw: unknown, quantidade: number): ProvaGerada {
  const data = raw as ProvaGerada;
  const questoes = (data.questoes ?? [])
    .filter((q) => q && q.pergunta && Array.isArray(q.alternativas) && q.alternativas.length >= 2)
    .map((q) => ({
      pergunta: String(q.pergunta),
      alternativas: q.alternativas.slice(0, 4).map((a) => String(a)),
      correta: Math.max(0, Math.min(q.alternativas.length - 1, Number(q.correta) || 0)),
      explicacao: String(q.explicacao ?? ""),
      origem: String(q.origem ?? ""),
    }))
    .slice(0, quantidade);
  if (questoes.length === 0) throw new Error("A IA não retornou questões válidas. Tente novamente.");
  return { titulo: String(data.titulo ?? "Prova de conversão de agendamento"), questoes };
}

// ===================== FEEDBACK DA PROVA (gerado pela IA) =====================

export type FeedbackItem = {
  indice: number;
  status: "acerto" | "erro";
  comentario: string;
  sugestao: string;
};

export type FeedbackProva = {
  resumo: string;
  itens: FeedbackItem[];
  pontos_fortes: string[];
  pontos_melhorar: string[];
  plano_de_acao: string[];
};

export const FEEDBACK_SYSTEM_PROMPT = `Você é um treinador sênior de CONVERSÃO DE AGENDAMENTOS de uma clínica, avaliando a prova respondida por um atendente.

Sua tarefa: dar FEEDBACK individual em CADA questão respondida e um feedback geral.

Regras:
- Para cada questão, explique em 1-2 frases por que a resposta escolhida está certa ou errada, sempre ligando ao impacto na conversão do agendamento.
- O campo "sugestao" traz uma fala pronta ou comportamento prático que o atendente deve usar no atendimento real (curto, aplicável).
- Nos acertos, reforce o comportamento correto (não seja genérico).
- Nunca mencione tabelas, planilhas, "TAP" ou fontes fornecidas — trate como conhecimento normal da clínica.
- Fale direto com o atendente ("você"), em português do Brasil, tom respeitoso e objetivo.
- Chame SEMPRE a ferramenta "registrar_feedback".`;

export const FEEDBACK_TOOL = {
  type: "function" as const,
  function: {
    name: "registrar_feedback",
    description: "Registra o feedback do treinador sobre a prova respondida.",
    parameters: {
      type: "object",
      properties: {
        resumo: { type: "string", description: "Feedback geral em 2-4 frases." },
        itens: {
          type: "array",
          description: "Feedback de cada questão, na mesma ordem recebida.",
          items: {
            type: "object",
            properties: {
              indice: { type: "number", description: "Número da questão (1-based)." },
              status: { type: "string", enum: ["acerto", "erro"] },
              comentario: { type: "string" },
              sugestao: { type: "string" },
            },
            required: ["indice", "status", "comentario", "sugestao"],
            additionalProperties: false,
          },
        },
        pontos_fortes: { type: "array", items: { type: "string" } },
        pontos_melhorar: { type: "array", items: { type: "string" } },
        plano_de_acao: {
          type: "array",
          items: { type: "string" },
          description: "2 a 4 ações práticas para os próximos atendimentos.",
        },
      },
      required: ["resumo", "itens", "pontos_fortes", "pontos_melhorar", "plano_de_acao"],
      additionalProperties: false,
    },
  },
};

export function buildFeedbackPrompt(
  atendente: string,
  questoes: { pergunta: string; alternativas: string[]; correta: number; explicacao?: string; origem?: string }[],
  respostas: number[],
  tabela?: string,
  scripts?: string,
) {
  const blocos = questoes
    .map((q, i) => {
      const escolhida = respostas[i];
      const alts = q.alternativas
        .map((a, ai) => `${String.fromCharCode(65 + ai)}) ${a}`)
        .join("\n");
      return `Questão ${i + 1}: ${q.pergunta}
${alts}
Correta: ${String.fromCharCode(65 + q.correta)}
Resposta do atendente: ${escolhida >= 0 ? String.fromCharCode(65 + escolhida) : "não respondeu"}
Resultado: ${escolhida === q.correta ? "acerto" : "erro"}${q.origem ? `\nOrigem: ${q.origem}` : ""}`;
    })
    .join("\n\n---\n\n");

  return `Atendente: ${atendente}
${scripts?.trim() ? `\nSCRIPTS PADRÃO DE AGENDAMENTO da clínica:\n\n${scripts.trim()}\n` : ""}
${tabela?.trim() ? `\nINFORMAÇÕES DE SERVIÇOS, VALORES E HORÁRIOS da clínica:\n\n${tabela.trim()}\n` : ""}

PROVA RESPONDIDA:

${blocos}

Dê feedback de TODAS as ${questoes.length} questões, na ordem, e o feedback geral.`;
}

export function normalizeFeedback(raw: unknown, totalQuestoes: number): FeedbackProva {
  const d = (raw ?? {}) as Partial<FeedbackProva>;
  const lista = (str: unknown) =>
    Array.isArray(str) ? str.map((s) => String(s).slice(0, 400)).slice(0, 8) : [];
  const itens = (Array.isArray(d.itens) ? d.itens : [])
    .map((it) => ({
      indice: Math.max(1, Math.min(totalQuestoes, Number(it?.indice) || 0)),
      status: it?.status === "acerto" ? ("acerto" as const) : ("erro" as const),
      comentario: String(it?.comentario ?? "").slice(0, 800),
      sugestao: String(it?.sugestao ?? "").slice(0, 800),
    }))
    .filter((it) => it.comentario);
  return {
    resumo: String(d.resumo ?? "").slice(0, 1500),
    itens,
    pontos_fortes: lista(d.pontos_fortes),
    pontos_melhorar: lista(d.pontos_melhorar),
    plano_de_acao: lista(d.plano_de_acao),
  };
}