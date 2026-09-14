/** Prova estreita de continuidade no atendimento informativo. Sem banco ou modelo. */
import { autorizarConsultaAgenda } from "../consulta-agenda";
import { formasDePagamentoNoTexto } from "./afirmacao";
import { avaliarGrounding } from "./claims";
import { normalizarTexto } from "./evidencia";
import { ehSaudacaoPura } from "./turno-tipo";
import { classificarAfirmacaoOperacional } from "./workflow";
import type { AvaliacaoObrigacao, Obrigacao } from "./obrigacoes";
import type { ContextoConfianca } from "./types";

const REGRA_SUPORTADA = `CONTINUIDADE
Tipo: CONVERSACIONAL.
Aplica-se: apresentação já entregue e sessão em andamento.
Conduta: continue do ponto atual. Faça nova apresentação se o paciente perguntar quem atende ou se o sistema informar uma nova sessão.
Resultado esperado: continuidade sem reiniciar o atendimento ou repetir perguntas já respondidas.`;

function formaSuportada(o: Obrigacao, ctx: ContextoConfianca): boolean {
  if (
    o.origem !== "instrucoes_publicadas" ||
    o.regra?.classe !== "CONVERSACIONAL" ||
    !ctx.instrucoes?.hash ||
    o.regra.hash !== ctx.instrucoes.hash
  )
    return false;
  const corpo = o.regra.trecho.replace(/^\s*REGRA\s+\S+\s*[—–-]\s*/i, "");
  return normalizarTexto(corpo) === normalizarTexto(REGRA_SUPORTADA);
}

const ACOES_INFORMATIVAS = new Set([
  "responder_informacao",
  "informar_profissional",
  "informar_horario",
  "informar_valor",
  "informar_preparo",
  "informar_regra",
]);
const PEDIDO_IDENTIDADE = /\b(quem (?:e|esta|fala|atende)|seu nome|voce e (?:quem|humana|robo))\b/;
const REINICIO =
  /\b(?:sou (?:a|o)|me chamo|meu nome e|vamos (?:comecar|reiniciar)|reiniciar o atendimento)\b/;
const NORMALIZAR_PERGUNTA = (t: string) =>
  normalizarTexto(t)
    .replace(/[*_?!.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** A abreviação Dr./Dra. não encerra a pergunta. */
function perguntas(texto: string): string[] {
  return (texto.replace(/\b(dra?)\./gi, "$1").match(/[^.!?\n]+\?/g) ?? []).map(NORMALIZAR_PERGUNTA);
}

type TopicoPergunta =
  | "ajuda"
  | "medico"
  | "especialidade"
  | "nome"
  | "cpf"
  | "nascimento"
  | "data"
  | "periodo"
  | "interesse_agenda"
  | "vaga";
function topicoPergunta(q: string): TopicoPergunta | null {
  if (/\b(como|em que)\s+(?:posso|podemos)\s+(?:(?:te|lhe)\s+)?ajudar\b/.test(q)) return "ajuda";
  if (
    /\b(verificar|verificasse|consultar|consulte|ver|olhar|checar)\b/.test(q) &&
    /\b(vagas?|agenda|disponibilidade)\b/.test(q)
  )
    return "interesse_agenda";
  if (/\b(qual|que|prefere)\b/.test(q) && /\b(medico|medica|profissional|doutor|doutora)\b/.test(q))
    return "medico";
  if (/\b(qual|que)\b/.test(q) && /\b(especialidade|exame|procedimento)\b/.test(q))
    return "especialidade";
  if (/\b(nome|chama)\b/.test(q)) return "nome";
  if (/\bcpf\b/.test(q)) return "cpf";
  if (/\b(nascimento|nasceu)\b/.test(q)) return "nascimento";
  if (/\b(qual|que|prefere)\b/.test(q) && /\b(dia|data)\b/.test(q)) return "data";
  if (/\b(manha|tarde|noite|periodo)\b/.test(q)) return "periodo";
  if (
    /\b(qual|quais|que|prefere)\b/.test(q) &&
    /\b(horario|horarios|vaga|vagas|desses|destes|dessas|destas)\b/.test(q)
  )
    return "vaga";
  return null;
}

function raiz(t: string): string {
  return t
    .replace(/s$/, "")
    .replace(/logista$/, "logia")
    .replace(/logo$/, "logia")
    .replace(/iatra$/, "iatria");
}
const GENERICOS = new Set([
  "voces",
  "voce",
  "quais",
  "qual",
  "quanto",
  "custa",
  "gostaria",
  "quero",
  "queria",
  "preciso",
  "consulta",
  "atendimento",
  "horario",
  "horarios",
  "informacao",
  "informacoes",
  "saber",
  "sobre",
  "valor",
  "preco",
  "medico",
  "medicos",
  "profissional",
  "profissionais",
  "fazem",
  "atendem",
  "possui",
  "teria",
  "exame",
  "exames",
  "procedimento",
]);

export function temAssuntoCorrespondente(
  msg: string,
  resposta: string,
  ctx: ContextoConfianca,
): boolean {
  const normalizarAssunto = (t: string) =>
    normalizarTexto(t)
      .split(/[^a-z0-9]+/)
      .map(raiz);
  const assunto = normalizarAssunto(msg).filter((p) => p.length >= 4 && !GENERICOS.has(p));
  const naResposta = new Set(normalizarAssunto(resposta));
  const nosFatos = new Set(
    normalizarAssunto(
      (ctx.fatos ?? [])
        .map((f) =>
          [f.valor, f.chave?.procedimento, f.chave?.especialidade, f.chave?.medicoNome]
            .filter(Boolean)
            .join(" "),
        )
        .join(" "),
    ),
  );
  return assunto.some((p) => naResposta.has(p) && nosFatos.has(p));
}

function respostaAoTopico(topico: TopicoPergunta, texto: string, ctx: ContextoConfianca): boolean {
  const t = normalizarTexto(texto);
  if (!t || /\b(nao sei|talvez|nao quero|prefiro nao)\b/.test(t)) return false;
  if (topico === "ajuda")
    return /\?|\b(quero|preciso|gostaria|tem|valor|preco|medico|exame)\b/.test(t);
  if (topico === "cpf") return /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t);
  if (topico === "nascimento" || topico === "data")
    return /\b\d{1,2}[/-]\d{1,2}|\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|hoje)\b/.test(
      t,
    );
  if (topico === "periodo") return /\b(manha|tarde|noite)\b/.test(t);
  if (topico === "interesse_agenda") return /^(sim|pode|quero|claro|por favor)\b/.test(t);
  if (topico === "vaga")
    return /\b\d{1,2}(?:h|:\d{2})\b|\b(primeir[ao]|segund[ao]|terceir[ao])\b/.test(t);
  if (topico === "nome")
    return (
      !t.includes("?") &&
      !/\b(quero|preciso|gostaria|agendar|marcar|ajuda|consulta)\b/.test(t) &&
      /^(?:meu nome e |sou (?:o |a )?|me chamo )?[a-z]+(?: [a-z]+){1,5}$/.test(
        t.split(/[,;\n]|\b(?:cpf|data de nascimento|nasci)\b/)[0]!.trim(),
      )
    );
  return (ctx.fatos ?? []).some((f) => {
    const valor =
      topico === "medico"
        ? (f.chave?.medicoNome ?? (f.entidade === "profissional" ? f.valor : null))
        : (f.chave?.especialidade ?? f.chave?.procedimento);
    if (!valor) return false;
    return normalizarTexto(valor)
      .split(/[^a-z]+/)
      .filter((p) => p.length >= 4 && !GENERICOS.has(p))
      .some((p) => t.includes(p));
  });
}

type CampoColeta = "nome" | "cpf" | "nascimento";
const ALIASES_COLETA: Record<CampoColeta, string[]> = {
  nome: ["nome", "nome_completo"],
  cpf: ["cpf"],
  nascimento: ["data_nascimento", "data_de_nascimento", "nascimento"],
};

/** Reconhece somente uma solicitação de campos, sem frases factuais adicionais. */
function camposDaColeta(texto: string): CampoColeta[] | null {
  const t = normalizarTexto(texto);
  const m =
    /^(?:para (?:seguir|continuar) com o agendamento[, :]*)?(?:(?:me )?(?:informe|envie|diga)|(?:pode|poderia) (?:me )?(?:informar|enviar|dizer)|qual (?:e )?)(.+?)(?:,? por favor)?[?.!]*$/.exec(
      t,
    );
  if (!m) return null;
  const campos: CampoColeta[] = [];
  const restante = m[1]!
    .replace(/\b(nome(?: completo)?|cpf|data de nascimento)\b/g, (campo) => {
      campos.push(campo.startsWith("nome") ? "nome" : campo === "cpf" ? "cpf" : "nascimento");
      return "";
    })
    .replace(/\b(seu|sua|o|a|e)\b/g, "")
    .replace(/[\s,]+/g, "");
  return campos.length > 0 && !restante && new Set(campos).size === campos.length ? campos : null;
}

function semOperacaoNoTurno(ctx: ContextoConfianca, resposta: string): boolean {
  return (
    [null, "nenhuma", "responder_informacao"].includes(ctx.requestedAction) &&
    ctx.evidenciasFluxo?.registroFerramentasCompleto === true &&
    ctx.toolResults.length === 0 &&
    ctx.businessContext.agendamentoConfirmado === false &&
    ctx.businessContext.handoffSolicitado === false &&
    ctx.operationalState?.appointmentAttempted !== true &&
    ctx.operationalState?.appointmentToolCalled !== true &&
    ctx.operationalState?.appointmentCreated !== true &&
    classificarAfirmacaoOperacional(resposta) === "nenhuma"
  );
}

function saudacaoSocial(ctx: ContextoConfianca, resposta: string): boolean {
  if (ctx.turnType !== "SAUDACAO" || !ehSaudacaoPura(ctx.mensagemPaciente ?? "")) return false;
  const somenteCumprimento = normalizarTexto(resposta)
    .replace(
      /\b(?:como|em que)\s+(?:posso|podemos)\s+(?:(?:te|lhe)\s+)?ajudar(?:\s+hoje)?\s*\?/g,
      "",
    )
    .replace(/\bnovamente\b/g, "");
  return ehSaudacaoPura(somenteCumprimento);
}

function agendaComprovada(ctx: ContextoConfianca): boolean {
  if (
    ctx.requestedAction !== "informar_disponibilidade" ||
    ctx.evidenciasFluxo?.registroFerramentasCompleto !== true
  )
    return false;
  const consultas = ctx.toolResults.filter(
    (r) => r.capacidade === "checkAvailability" && r.success && !r.erro,
  );
  if (!consultas.length) return false;
  const vagas = (ctx.fatos ?? []).filter(
    (f) => f.fonte === "agenda" && f.entidade === "vaga" && f.chave?.medicoId && f.chave.medicoNome,
  );
  return (
    vagas.length > 0 &&
    vagas.every(
      (f) =>
        autorizarConsultaAgenda(
          { mensagemAtual: ctx.mensagemPaciente ?? "", historico: ctx.evidenciasFluxo!.historico },
          {
            id: f.chave!.medicoId!,
            nome: f.chave!.medicoNome!,
          },
        ).permitido,
    )
  );
}

/**
 * Confere apenas a regra integral e o fluxo observado. Sem prova, retorna null
 * para manter a avaliação semântica existente: desconhecido não vira cumprimento
 * nem muda a política aplicada às limitações de linguagem aberta.
 */
export function avaliarObrigacaoContinuidade(
  o: Obrigacao,
  ctx: ContextoConfianca,
  resposta: string,
): AvaliacaoObrigacao | null {
  if (!formaSuportada(o, ctx)) return null;
  const resultado = (status: AvaliacaoObrigacao["status"], motivo: string): AvaliacaoObrigacao => ({
    obrigacao: o,
    status,
    motivo,
  });
  const e = ctx.evidenciasFluxo;
  if (
    !e?.sessionId ||
    e.historicoCompleto !== true ||
    !e.historico.some((m) => m.role === "assistant" && m.content.trim()) ||
    ctx.businessContext.apresentacaoJaFeita !== true
  )
    return null;
  const msg = normalizarTexto(ctx.mensagemPaciente ?? "");
  if (!msg || PEDIDO_IDENTIDADE.test(msg)) return null;
  if (REINICIO.test(normalizarTexto(resposta)))
    return resultado("descumprida", "CONTINUIDADE_ATENDIMENTO_REINICIADO");

  const coleta = camposDaColeta(resposta);
  const atuais = perguntas(resposta);
  const historico = [...e.historico, { role: "user", content: ctx.mensagemPaciente ?? "" }];
  const solicitados = [
    ...atuais.map((q) => ({ q, topico: topicoPergunta(q) })),
    ...(coleta ?? []).map((topico) => ({ q: "", topico })),
  ];
  for (const { q, topico } of solicitados) {
    for (let i = 0; i < historico.length - 1; i++) {
      if (historico[i]!.role !== "assistant" || historico[i + 1]!.role !== "user") continue;
      const anteriores = [
        ...perguntas(historico[i]!.content).map((anterior) => ({
          q: anterior,
          topico: topicoPergunta(anterior),
        })),
        ...(camposDaColeta(historico[i]!.content) ?? []).map((campo) => ({ q: "", topico: campo })),
      ];
      for (const anterior of anteriores) {
        if (
          topico &&
          topico === anterior.topico &&
          respostaAoTopico(topico, historico[i + 1]!.content, ctx)
        )
          return resultado("descumprida", "CONTINUIDADE_PERGUNTA_JA_RESPONDIDA");
        if (!topico && q === anterior.q) return null;
      }
    }
  }

  // São provas de continuidade de conversa, sem dispensar o grounding ou as
  // guardas operacionais. Texto fora dessas formas estreitas continua UNKNOWN.
  const grounding = avaliarGrounding(ctx, resposta);
  const semAfirmacoes =
    grounding.total === 0 &&
    !grounding.semEvidencia.length &&
    !grounding.naoVerificados.length &&
    !grounding.truncado;
  if (semAfirmacoes && semOperacaoNoTurno(ctx, resposta)) {
    if (saudacaoSocial(ctx, resposta))
      return resultado("cumprida", "CONTINUIDADE_SOCIAL_COMPROVADA_NO_HISTORICO");
    if (coleta && ctx.turnType === "ESCLARECIMENTO" && ctx.entities && ctx.requiredFields?.length) {
      if (
        !coleta.every((campo) =>
          ALIASES_COLETA[campo].some((alias) => ctx.requiredFields!.includes(alias)),
        )
      )
        return null;
      const informado = coleta.some(
        (campo) =>
          ALIASES_COLETA[campo].some(
            (alias) => ctx.entities![alias] != null && ctx.entities![alias] !== "",
          ) ||
          historico.some(
            (m) =>
              m.role === "user" &&
              (campo === "cpf"
                ? respostaAoTopico(campo, m.content, ctx)
                : campo === "nascimento"
                  ? /\b(nasci|nascimento)\b/.test(normalizarTexto(m.content)) &&
                    respostaAoTopico(campo, m.content, ctx)
                  : /\b(?:meu nome e |me chamo |sou (?:o |a )?)[a-z]/.test(
                      normalizarTexto(m.content),
                    ) && respostaAoTopico(campo, m.content, ctx)),
          ),
      );
      if (informado || ctx.businessContext.pacienteIdentificado === true)
        return resultado("descumprida", "CONTINUIDADE_DADO_JA_INFORMADO");
      return resultado("cumprida", "CONTINUIDADE_COLETA_DE_DADO_PENDENTE_COMPROVADA");
    }
  }

  const agenda = agendaComprovada(ctx);
  if ((!ctx.requestedAction || !ACOES_INFORMATIVAS.has(ctx.requestedAction)) && !agenda)
    return null;
  if (
    !grounding.total ||
    grounding.semEvidencia.length ||
    grounding.naoVerificados.length ||
    grounding.truncado
  )
    return null;
  // Uma negativa comprovada responde à forma perguntada mesmo quando ela não
  // consta da lista publicada. A prova vem do verificador do caso consultado,
  // nunca da frase de recusa isolada nem de uma consulta que falhou.
  const pagamentoRespondido = formasDePagamentoNoTexto(msg).some((forma) =>
    grounding.claims.some(
      (claim) =>
        claim.tipo === "restricao" &&
        claim.valorAfirmado === `forma_pagamento:${forma}` &&
        claim.suportado &&
        claim.situacao === "confirmado" &&
        claim.fonte === "catalogo_publicado" &&
        Boolean(claim.referencia),
    ),
  );
  if (!agenda && !pagamentoRespondido && !temAssuntoCorrespondente(msg, resposta, ctx)) return null;

  for (const q of atuais) {
    const topico = topicoPergunta(q);
    if (
      !topico ||
      !["interesse_agenda", "medico", ...(agenda ? ["data", "periodo", "vaga"] : [])].includes(
        topico,
      )
    )
      return null;
  }
  return resultado("cumprida", "CONTINUIDADE_INFORMATIVA_COMPROVADA_NO_HISTORICO");
}
