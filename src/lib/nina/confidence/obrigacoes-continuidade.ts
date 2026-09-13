/** Prova estreita de continuidade no atendimento informativo. Sem banco ou modelo. */
import { autorizarConsultaAgenda } from "../consulta-agenda";
import { avaliarGrounding } from "./claims";
import { normalizarTexto } from "./evidencia";
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
  if (/\b(como|em que)\s+(?:posso|podemos)\s+ajudar\b/.test(q)) return "ajuda";
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

function temAssuntoCorrespondente(msg: string, resposta: string, ctx: ContextoConfianca): boolean {
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
    return !t.includes("?") && /^(?:meu nome e |sou |me chamo )?[a-z]+(?: [a-z]+){1,5}$/.test(t);
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
  const agenda = agendaComprovada(ctx);
  if ((!ctx.requestedAction || !ACOES_INFORMATIVAS.has(ctx.requestedAction)) && !agenda)
    return null;
  const grounding = avaliarGrounding(ctx, resposta);
  if (
    !grounding.total ||
    grounding.semEvidencia.length ||
    grounding.naoVerificados.length ||
    grounding.truncado
  )
    return null;
  if (!agenda && !temAssuntoCorrespondente(msg, resposta, ctx)) return null;

  const atuais = perguntas(resposta);
  const historico = [...e.historico, { role: "user", content: ctx.mensagemPaciente ?? "" }];
  for (const q of atuais) {
    const topico = topicoPergunta(q);
    for (let i = 0; i < historico.length - 1; i++) {
      if (historico[i]!.role !== "assistant" || historico[i + 1]!.role !== "user") continue;
      for (const anterior of perguntas(historico[i]!.content)) {
        const topicoAnterior = topicoPergunta(anterior);
        if (
          topico &&
          topico === topicoAnterior &&
          respostaAoTopico(topico, historico[i + 1]!.content, ctx)
        )
          return resultado("descumprida", "CONTINUIDADE_PERGUNTA_JA_RESPONDIDA");
        if (!topico && q === anterior) return null;
      }
    }
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
