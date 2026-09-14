/** Verificação das regras publicadas de abertura, igual nos dois ambientes. */
import { checarElementosSaudacao } from "../saudacao-sessao";
import { formasDePagamentoNoTexto, segmentosDaResposta } from "./afirmacao";
import { avaliarGrounding, type ResultadoGrounding } from "./claims";
import { normalizarTexto } from "./evidencia";
import { conferirIdentidadeDaResposta } from "./identidade-publicada";
import { temAssuntoCorrespondente } from "./obrigacoes-continuidade";
import type { AvaliacaoObrigacao, Obrigacao } from "./obrigacoes";
import type { ContextoConfianca } from "./types";

// Conferimos o corpo completo, não apenas o ID: uma publicação que acrescente
// exigências não pode ser aprovada por um verificador da versão anterior.
const SAUDACAO = `SAUDAÇÃO INICIAL
Tipo: CONVERSACIONAL.
Aplica-se: primeira resposta da sessão, apresentação ainda não entregue e mensagem composta somente por saudação.
Conduta: cumprimente, apresente-se brevemente com a identidade configurada e pergunte como pode ajudar.
Resultado esperado: acolhimento simples. Esse caso não exige catálogo, agenda ou identificação do paciente por si só.`;
const PEDIDO = `PEDIDO CONCRETO NA ABERTURA
Tipo: CONVERSACIONAL.
Aplica-se: primeira resposta da sessão com pergunta ou solicitação concreta.
Conduta: faça uma apresentação breve e avance diretamente no pedido, consultando a fonte necessária ou perguntando o dado específico que falta.
Resultado esperado: a resposta se dirige ao pedido já informado.
Uma mensagem como “bom dia, qual o valor do exame?” pertence a este caso.`;

const ACOES_INFORMATIVAS = new Set([
  "responder_informacao",
  "informar_profissional",
  "informar_valor",
]);
const normalizar = (texto: string) =>
  normalizarTexto(texto)
    .replace(/[*_~]|[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .trim();
const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const semSaudacao = (texto: string) =>
  normalizar(texto)
    .replace(/^(?:(?:ola|oi|bom dia|boa tarde|boa noite)[\s,!.-]*)+/, "")
    .trim();

/** Só retira uma apresentação completa reconhecida; sobras nunca viram prova por omissão. */
function corpoDepoisDaApresentacao(
  texto: string,
  atendente: string,
  estabelecimento: string,
  tipo: string | null,
): string | null {
  const nome = normalizar(estabelecimento);
  const tipoPublicado =
    tipo && !nome.startsWith(normalizar(tipo)) ? `(?:${escapar(normalizar(tipo))}\\s+)?` : "";
  const prefixo = new RegExp(
    `^(?:eu sou|sou|aqui e|me chamo)\\s+(?:a\\s+|o\\s+)?${escapar(normalizar(atendente))}\\s*,?\\s*(?:(?:a|o)\\s+)?(?:assistente|atendente)\\s+(?:virtual\\s+)?d(?:a|o|e)\\s+${tipoPublicado}${escapar(nome)}[.!]\\s*`,
  );
  const semAbertura = semSaudacao(texto);
  return prefixo.test(semAbertura) ? semAbertura.replace(prefixo, "").trim() : null;
}

function groundingCompleto(g: ResultadoGrounding): boolean {
  return !g.semEvidencia.length && !g.naoVerificados.length && !g.truncado && !g.limitacoes.length;
}

/** Escopo propositalmente estreito. Outras dimensões continuam sem aprovação presumida. */
function dimensoesComprovadas(
  ctx: ContextoConfianca,
  mensagem: string,
  g: ResultadoGrounding,
): boolean {
  if (!ctx.requestedAction || !ACOES_INFORMATIVAS.has(ctx.requestedAction)) return false;
  const msg = semSaudacao(mensagem);
  if (
    /\b(?:idade|minima|maxima|anos?|criancas?|infantil|preparo|preparar|jejum|documentos?|duracao|tempo|demora|horarios?|vagas?|datas?|dias?|semana|amanha|cancel\w*|remarc\w*|agend\w*|marcar|convenios?|descontos?|parcel\w*|resultado|garant\w*|cura|tratamento|sintomas?|gestante)\b/.test(
      msg,
    )
  )
    return false;
  const preco = /\b(?:precos?|valores?|valor|custa|custam|quanto (?:e|fica))\b/.test(msg);
  const profissional =
    /\bquem\b|\b(?:qual|quais)\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:medic\w*|profissiona\w*|doutor\w*|\w+logista|\w+iatra)\b/.test(
      msg,
    );
  const oferta = /\b(?:tem|temos|atendem|oferecem|fazem|possui|possuem)\b/.test(msg);
  if (!preco && !profissional && !oferta) return false;
  const comprovados = g.claims.filter(
    (c) => c.suportado && c.fonte === "catalogo_publicado" && c.referencia,
  );
  if (profissional && !comprovados.some((c) => c.tipo === "profissional")) return false;
  if (preco) {
    const valores = comprovados.filter((c) => c.tipo === "valor");
    if (
      !valores.length ||
      !formasDePagamentoNoTexto(msg).every((forma) =>
        valores.some((c) => c.diagnostico?.forma === forma),
      )
    )
      return false;
  }
  // Um preço publicado do serviço também comprova que ele integra o catálogo.
  return !oferta || comprovados.some((c) => ["servico", "profissional", "valor"].includes(c.tipo));
}

/** Toda sentença adicional precisa de prova; uma pergunta final não cobre texto anterior. */
function corpoInformativoComprovado(
  ctx: ContextoConfianca,
  corpo: string,
  grounding: ResultadoGrounding,
): boolean {
  const partes = segmentosDaResposta(corpo);
  if (!partes.length) return false;
  return partes.every((p) => {
    const separador = corpo.slice(p.inicio + p.texto.length).match(/^[.!?;\n]+/)?.[0] ?? "";
    if (separador.includes("?")) {
      // Oferecer consultar vagas não afirma disponibilidade nem autoriza a consulta.
      return /^(?:(?:voce\s+)?(?:gostaria|quer|deseja)\s+de\s+|(?:posso|podemos)\s+)(?:verificar|consultar|ver)\s+(?:as?\s+)?(?:vagas|disponibilidade|agenda)$/.test(
        normalizar(p.texto),
      );
    }
    // Oferta simples do MESMO item cujo preço já foi conferido. Nome inteiro,
    // sem permitir que a palavra do assunto cubra qualificadores ou frases extras.
    const oferta = /^(?:sim,?\s*)?(?:temos|atendemos|oferecemos|fazemos)\s+(.+)$/.exec(
      normalizar(p.texto),
    );
    if (
      oferta &&
      grounding.claims.some(
        (c) =>
          c.suportado &&
          c.fonte === "catalogo_publicado" &&
          c.referencia &&
          c.tipo === "valor" &&
          normalizar(c.diagnostico?.item ?? "") === oferta[1],
      )
    )
      return true;
    const prova = avaliarGrounding({ ...ctx, claims: [] }, p.texto);
    return prova.total > 0 && groundingCompleto(prova);
  });
}

export function avaliarObrigacaoAbertura(
  o: Obrigacao,
  ctx: ContextoConfianca,
  resposta: string,
): AvaliacaoObrigacao | null {
  if (
    o.origem !== "instrucoes_publicadas" ||
    o.regra?.classe !== "CONVERSACIONAL" ||
    !ctx.instrucoes?.hash ||
    o.regra.hash !== ctx.instrucoes.hash ||
    ctx.businessContext.apresentacaoJaFeita !== false
  )
    return null;
  const corpo = normalizarTexto(o.regra.trecho.replace(/^\s*REGRA\s+\S+\s*[—–-]\s*/i, ""));
  const saudacao = corpo === normalizarTexto(SAUDACAO);
  if (!saudacao && corpo !== normalizarTexto(PEDIDO)) return null;
  const identidade = ctx.instrucoes.identidade;
  if (!identidade?.atendente || !identidade.estabelecimento) return null;
  const resultado = (status: AvaliacaoObrigacao["status"], motivo: string): AvaliacaoObrigacao => ({
    obrigacao: o,
    status,
    motivo,
  });
  const conferencia = conferirIdentidadeDaResposta(identidade, resposta);
  const elementos = checarElementosSaudacao(resposta, {
    assistente: identidade.atendente,
    estabelecimento: identidade.estabelecimento,
  });
  if (conferencia.situacao === "divergente")
    return resultado("descumprida", "ABERTURA_IDENTIDADE_DIVERGENTE");
  if (
    conferencia.declarado.atendente &&
    normalizar(conferencia.declarado.atendente) !== normalizar(identidade.atendente)
  )
    return resultado("descumprida", "ABERTURA_IDENTIDADE_DIVERGENTE");
  if (!conferencia.declarado.atendente || !elementos.assistente || !elementos.unidade)
    return resultado("descumprida", "ABERTURA_APRESENTACAO_AUSENTE");

  if (saudacao) {
    // Abertura social não prova fatos nem operações. Se aparecerem, os demais
    // validadores seguem obrigatórios; este verificador não concede dispensa.
    const perguntaAjuda =
      /\b(?:como|em que)\s+(?:posso|podemos)\s+(?:(?:te|lhe|vos)\s+)?ajudar\b[^?]*\?/i.test(
        normalizarTexto(resposta),
      );
    return elementos.saudacao && perguntaAjuda
      ? resultado("cumprida", "ABERTURA_SAUDACAO_COM_IDENTIDADE_COMPROVADA")
      : resultado("descumprida", "ABERTURA_SAUDACAO_OU_PERGUNTA_AUSENTE");
  }

  const mensagem = ctx.mensagemPaciente ?? "";
  const grounding = avaliarGrounding(ctx, resposta);
  const corpoResposta = corpoDepoisDaApresentacao(
    resposta,
    identidade.atendente,
    identidade.estabelecimento,
    identidade.tipo,
  );
  if (
    grounding.total > 0 &&
    groundingCompleto(grounding) &&
    temAssuntoCorrespondente(mensagem, resposta, ctx) &&
    dimensoesComprovadas(ctx, mensagem, grounding) &&
    corpoResposta !== null &&
    corpoInformativoComprovado(ctx, corpoResposta, grounding)
  )
    return resultado("cumprida", "ABERTURA_PEDIDO_RESPONDIDO_COM_FONTE");

  // Esclarecimento estreito: o pedido deixou a entidade sem nome e a resposta
  // pergunta justamente por ela, sem acrescentar fatos não comprovados.
  const msg = semSaudacao(mensagem);
  const perguntaEntidade = ["exame", "procedimento", "especialidade"].some(
    (entidade) =>
      new RegExp(
        `^(?:qual\\s+(?:e\\s+)?(?:o\\s+)?(?:valor|preco)\\s+d[oa]|quanto\\s+custa\\s+(?:o|a))\\s+${entidade}[?!. ]*$`,
      ).test(msg) &&
      corpoResposta !== null &&
      new RegExp(
        `^qual\\s+(?:e\\s+)?(?:o\\s+|a\\s+)?${entidade}(?:\\s+(?:que\\s+)?voce\\s+(?:precisa|quer|deseja)(?:\\s+(?:fazer|consultar))?)?\\?$`,
      ).test(corpoResposta),
  );
  if (
    ((ctx.requestedAction !== null && ACOES_INFORMATIVAS.has(ctx.requestedAction)) ||
      (ctx.turnType === "ESCLARECIMENTO" &&
        (ctx.requestedAction === null || ctx.requestedAction === "nenhuma"))) &&
    perguntaEntidade &&
    groundingCompleto(grounding)
  )
    return resultado("cumprida", "ABERTURA_ENTIDADE_NECESSARIA_SOLICITADA");
  return resultado("indeterminada", "ABERTURA_AVANCO_NO_PEDIDO_NAO_COMPROVADO");
}
