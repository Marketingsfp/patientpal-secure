/**
 * FASE 5 — CLAIM-LEVEL GROUNDING.
 * FASE 2 — CORRESPONDÊNCIA ENTRE AFIRMAÇÃO E FATO RECUPERADO.
 *
 * O problema original: `catalogoEncontrou = true` era tratado como se
 * validasse a RESPOSTA INTEIRA. Uma resposta, porém, costuma conter várias
 * afirmações independentes:
 *
 *   "Cardiologia custa R$ 150"        -> catálogo publicado (campo preco)
 *   "Dr. João atende"                  -> catálogo publicado (profissional)
 *   "há vaga sábado às 14h"            -> Agenda (slot concreto)
 *
 * A partir da FASE 2, cada afirmação é confrontada com o FATO correspondente
 * (`ctx.fatos`, extraído pelo servidor do retorno real das ferramentas):
 *
 * - preço de outro procedimento não apoia o preço afirmado;
 * - escala publicada não prova vaga;
 * - recusa prudente ("não tenho o preço confirmado") não é afirmação de preço;
 * - quando a evidência exigida não foi propagada, o resultado é INCOMPLETO
 *   (UNKNOWN), nunca aprovação silenciosa.
 */
import { classificarAfirmacaoOperacional } from "./workflow";
import {
  corresponder,
  consolidarTentativas,
  houveTruncamento,
  normalizarTexto,
  type ChaveFato,
  type ConsultaDoTurno,
  type EntidadeFato,
  type FatoRecuperado,
} from "./evidencia";
import {
  chaveDaAfirmacaoMonetaria,
  correspondenciaDaAfirmacao,
  fatosNoEscopoDaAfirmacao,
  qualificadoresDaAfirmacao,
  referenciaDoFato,
  segmentoNaPosicao,
  valorDaAfirmacao,
  TERMOS_DE_ASSUNTO,
} from "./afirmacao";

import {
  classificarNatureza,
  modalidadeDaNatureza,
  oracaoNaPosicao,
  pareceConterDadoOperacional,
  NATUREZAS_NAO_FACTUAIS,
  type NaturezaAfirmacao,
} from "./modalidade";
import type {
  ClaimEstruturado,
  ContextoConfianca,
  ModalidadeClaim,
  ResultadoFerramenta,
  ResultadoValidador,
  TipoClaim,
  TipoFonte,
} from "./types";

const NOME = "ClaimGroundingValidator";

const CAP_CATALOGO = new Set(["searchKnowledgeBase", "listCatalog"]);
const CAP_AGENDA = new Set(["checkAvailability", "listSlots", "createAppointment"]);
const CAP_PROFISSIONAL = new Set(["listProfessionals", "getProfessional"]);

/** Limite de afirmações avaliadas por resposta — ao estourar, a avaliação é incompleta. */
const LIMITE_CLAIMS = 60;

/** Fontes que podem sustentar cada tipo de afirmação. */
const FONTES_ACEITAS: Record<TipoClaim, TipoFonte[]> = {
  valor: ["catalogo_publicado"],
  profissional: ["catalogo_publicado"],
  disponibilidade: ["agenda"],
  preparo: ["catalogo_publicado"],
  regra: ["catalogo_publicado", "instrucoes"],
  agendamento: ["agenda"],
  servico: ["catalogo_publicado"],
  endereco: ["catalogo_publicado", "instrucoes"],
  unidade: ["catalogo_publicado", "instrucoes"],
  convenio: ["catalogo_publicado"],
  restricao: ["catalogo_publicado", "instrucoes"],
  escala: ["catalogo_publicado", "agenda"],
};

/** Onde procurar o fato de cada tipo de afirmação. */
/** O vocabulário de assuntos vive em `afirmacao.ts` (FASE 2). */

/**
 * A afirmação extraída do TEXTO fala do mesmo assunto do fato recuperado?
 *
 * Regra: se a frase não nomeia assunto algum, nada há para conferir (o valor
 * segue validado pelo fato). Se a frase nomeia um assunto (ex.: "ultrassom")
 * que não aparece no assunto do fato (ex.: "consulta de cardiologia"), o valor
 * coincidir é coincidência — não prova.
 */
function assuntoDoFatoCompativel(
  fato: FatoRecuperado,
  trecho: string,
  fatos: FatoRecuperado[] = [],
): boolean {
  const chave = fato.chave ?? {};
  const assuntoFato = [chave.procedimento, chave.medicoNome, chave.especialidade, chave.convenio]
    .map((v) => normalizarTexto(v))
    .filter((v) => v.length > 0)
    .join(" ");
  if (!assuntoFato) return true;
  const texto = normalizarTexto(trecho);
  // Qualificador de escopo: se a frase fixa uma UNIDADE e o dado recuperado
  // não é daquela unidade, o valor não vale para o que foi afirmado.
  if (texto.includes("unidade")) {
    const unidadeDaChave = normalizarTexto(chave.unidadeId);
    const unidadeRecuperada = fatos
      .filter((f) => f.entidade === "unidade")
      .map((f) => normalizarTexto(f.valor))
      .some((v) => v.length > 0 && texto.includes(v));
    if (!unidadeDaChave && !unidadeRecuperada) return false;
  }

  const mencionados = TERMOS_DE_ASSUNTO.filter((t) => t !== "unidade" && texto.includes(t));
  if (mencionados.length === 0) return true;
  return mencionados.some((t) => assuntoFato.includes(t));
}

const ALVO_DO_FATO: Record<TipoClaim, { entidades: EntidadeFato[]; campos: string[]; monetario?: boolean }> = {
  valor: { entidades: ["procedimento", "servico"], campos: ["preco"], monetario: true },
  preparo: { entidades: ["procedimento"], campos: ["preparo"] },
  profissional: { entidades: ["profissional"], campos: ["nome"] },
  disponibilidade: { entidades: ["vaga"], campos: ["slot"] },
  escala: { entidades: ["escala"], campos: ["dia_atendimento", "funcionamento"] },
  agendamento: { entidades: ["agendamento"], campos: ["appointment_id"] },
  endereco: { entidades: ["endereco", "unidade"], campos: ["endereco"] },
  unidade: { entidades: ["unidade", "clinica"], campos: ["nome", "endereco"] },
  convenio: { entidades: ["convenio"], campos: ["cobertura", "aceito"] },
  servico: { entidades: ["servico", "procedimento"], campos: ["oferecido", "nome"] },
  restricao: { entidades: ["restricao"], campos: ["observacao"] },
  regra: { entidades: ["restricao", "procedimento"], campos: ["observacao", "regra"] },
};

/** Como o claim terminou. */
export type SituacaoClaim =
  | "confirmado"
  | "divergente"
  | "fora_do_escopo"
  | "sem_fonte"
  /** Havia canal de evidência, mas o fato não foi propagado ao motor. */
  | "nao_verificado";

export type ClaimAvaliado = {
  id: string;
  tipo: TipoClaim;
  /** Trecho da resposta final que sustenta a classificação. */
  trecho: string;
  /** Como o claim entrou: estrutura do turno ou leitura complementar do texto. */
  origem: "estruturado" | "texto";
  modalidade: ModalidadeClaim;
  /** FASE 3 — natureza da oração (ausência, desconhecido, falha, recusa...). */
  natureza?: NaturezaAfirmacao;
  situacao: SituacaoClaim;
  suportado: boolean;
  /** Fonte concreta que sustentou o claim (quando houve). */
  fonte: string | null;
  /** Valor que a fonte traz, quando diferente do afirmado. */
  valorDaFonte?: string | null;
  /** FASE 2 — referência auditável do fato usado (fonte:consulta#registro). */
  referencia?: string | null;
  /** FASE 2 — valor efetivamente extraído da afirmação, quando houve. */
  valorAfirmado?: string | null;
  motivo: string;
};

export type ResultadoGrounding = {
  claims: ClaimAvaliado[];
  total: number;
  suportados: number;
  /** Afirmou sem fonte, ou afirmou o que a fonte contradiz. */
  semEvidencia: ClaimAvaliado[];
  /** Não deu para verificar: evidência não propagada ou avaliação truncada. */
  naoVerificados: ClaimAvaliado[];
  /** A avaliação está incompleta (limite de claims ou retorno truncado). */
  truncado: boolean;
  /** FASE 3 — limitações conhecidas da extração/avaliação deste turno. */
  limitacoes: string[];
};

// ------------------------------------------------------- evidência disponível

function ok(f: ResultadoFerramenta): boolean {
  return f.success && !f.erro;
}

function ferramentaComConteudo(ctx: ContextoConfianca, caps: Set<string>): boolean {
  return ctx.toolResults.some(
    (f) => f.capacidade !== null && caps.has(f.capacidade) && ok(f) && f.temConteudo !== false,
  );
}

function ferramentaExecutada(ctx: ContextoConfianca, caps: Set<string>): boolean {
  return ctx.toolResults.some((f) => f.capacidade !== null && caps.has(f.capacidade) && ok(f));
}

function fonteDisponivel(ctx: ContextoConfianca, tipo: TipoFonte): boolean {
  return ctx.retrievedSources.some(
    (s) => s.tipo === tipo && s.temConteudo && s.publicado !== false && s.interna !== true,
  );
}

/**
 * Canal de evidência existente por tipo de afirmação. Continua valendo como
 * mapa de ORIGEM possível — não como prova de que o fato específico existe.
 */
export function evidenciasDisponiveis(ctx: ContextoConfianca): Record<TipoClaim, string | null> {
  const catalogo =
    ferramentaComConteudo(ctx, CAP_CATALOGO) || fonteDisponivel(ctx, "catalogo_publicado")
      ? "catalogo_publicado"
      : null;
  const agenda =
    ferramentaComConteudo(ctx, CAP_AGENDA) || fonteDisponivel(ctx, "agenda") ? "agenda" : null;
  const profissional =
    catalogo ?? (ferramentaComConteudo(ctx, CAP_PROFISSIONAL) ? "catalogo_publicado" : null);
  const instrucoes = fonteDisponivel(ctx, "instrucoes") ? "instrucoes" : null;
  const provaAgendamento =
    ctx.operationalState?.appointmentCreated === true && ctx.operationalState?.appointmentId
      ? `appointment_id:${ctx.operationalState.appointmentId}`
      : null;

  return {
    valor: catalogo,
    profissional,
    // FASE 2 — uma reserva já persistida comprova o horário reservado, mesmo
    // sem nova consulta de agenda neste turno.
    disponibilidade: agenda ?? provaAgendamento,
    preparo: catalogo,
    regra: catalogo ?? instrucoes,
    agendamento: provaAgendamento,
    servico: catalogo,
    endereco: catalogo ?? instrucoes,
    unidade: catalogo ?? instrucoes,
    convenio: catalogo,
    restricao: catalogo ?? instrucoes,
    escala: catalogo ?? agenda,
  };
}

/** Consultas do turno: as propagadas pelo servidor ou, na falta, as inferidas. */
export function consultasDoTurno(ctx: ContextoConfianca): ConsultaDoTurno[] {
  if (ctx.consultas && ctx.consultas.length > 0) return consolidarTentativas(ctx.consultas);
  return consolidarTentativas(
    ctx.toolResults.map((f) => ({
      id: `${f.nome}|${f.capacidade ?? ""}`,
      consulta: f.nome,
      capacidade: f.capacidade,
      status: !ok(f) ? "falha" : f.temConteudo === false ? "vazio" : "nao_verificado",
      tentativas: 1,
      falhasAnteriores: [],
      erro: f.erro ?? null,
    })),
  );
}

/** Uma consulta desse tipo respondeu corretamente (com ou sem itens)? */
function consultaRespondeu(ctx: ContextoConfianca, caps: Set<string>): ConsultaDoTurno | null {
  return (
    consultasDoTurno(ctx).find(
      (c) => c.capacidade !== null && caps.has(c.capacidade) && c.status !== "falha",
    ) ?? null
  );
}

/** FASE 3 — houve consulta desse tipo que FALHOU no turno? */
function consultaFalhou(ctx: ContextoConfianca, caps: Set<string>): boolean {
  return consultasDoTurno(ctx).some(
    (c) => c.capacidade !== null && caps.has(c.capacidade) && c.status === "falha",
  );
}

function capsDoTipo(tipo: TipoClaim): Set<string> {
  if (tipo === "disponibilidade" || tipo === "agendamento") return CAP_AGENDA;
  if (tipo === "profissional") return new Set([...CAP_CATALOGO, ...CAP_PROFISSIONAL]);
  return CAP_CATALOGO;
}

// ------------------------------------------------ extração complementar (texto)

const PADROES: Array<{ tipo: TipoClaim; re: RegExp }> = [
  { tipo: "valor", re: /R\$\s?\d[\d.,]*|custa\s+\d[\d.,]*|valor\s+(é|de)\s+\d[\d.,]*/gi },
  {
    tipo: "profissional",
    re: /\b(dr|dra|doutor|doutora)\.?\s+[A-ZÀ-Ú][\p{L}]+(\s+[A-ZÀ-Ú][\p{L}]+)?/giu,
  },
  {
    tipo: "disponibilidade",
    re: /((temos|há|ha|tem)\s+(vaga|hor[áa]rio|disponibilidade)[^.!?\n]*)|(\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[^.!?\n]{0,40}\b\d{1,2}\s?(h|:\d{2}))|(\b\d{1,2}\/\d{1,2}[^.!?\n]{0,30}\b\d{1,2}\s?(h|:\d{2}))/gi,
  },
  {
    tipo: "preparo",
    re: /(jejum[^.!?\n]*)|(preparo[^.!?\n]*)|(suspender\s+[^.!?\n]*medica[^.!?\n]*)/gi,
  },
  {
    tipo: "regra",
    re: /((é|e)\s+obrigat[óo]rio[^.!?\n]*)|(n[ãa]o\s+aceitamos[^.!?\n]*)/gi,
  },
  // FASE 2 — cobertura de endereço, serviço e convênio.
  {
    tipo: "endereco",
    re: /((ficamos|estamos|atendemos|fica|funcionamos)\s+(na|no|em)\s+[^.!?\n]{6,90})|((rua|av\.?|avenida|travessa|rodovia)\s+[^.!?\n]{4,90})/gi,
  },
  {
    tipo: "convenio",
    re: /(conv[êe]nio[^.!?\n]*)|((aceitamos|atendemos|cobre|cobrimos)\s+[^.!?\n]{0,40}(plano|conv[êe]nio|unimed|amil|bradesco)[^.!?\n]*)/gi,
  },
  {
    tipo: "servico",
    re: /((realizamos|fazemos|oferecemos|temos)\s+(o\s+|a\s+)?(exame|procedimento|consulta)[^.!?\n]*)/gi,
  },
];

const RE_NEGACAO =
  /\b(n[ãa]o|nao)\b[^.!?\n]{0,60}|(\bsem\s+(informa[çc][ãa]o|confirma[çc][ãa]o|previs[ãa]o)\b)|(\bainda\s+n[ãa]o\b)/i;
const RE_HIPOTESE = /\b(geralmente|normalmente|costuma|em m[ée]dia|acredito|acho que|talvez|deve ser)\b/i;

/** Frase que contém o trecho — a modalidade é lida na frase, não na palavra. */
function fraseDoTrecho(texto: string, trecho: string): string {
  const partes = texto.split(/(?<=[.!?\n])\s+/);
  return partes.find((p) => p.includes(trecho)) ?? texto;
}

export function classificarModalidade(frase: string): ModalidadeClaim {
  const f = frase.trim();
  if (!f) return "afirmacao";
  if (/\?\s*$/.test(f)) return "pergunta";
  if (RE_HIPOTESE.test(f)) return "hipotese";
  if (RE_NEGACAO.test(f)) return "negacao";
  return "afirmacao";
}

/** Valor citado na afirmação (para conferir contra o fato). */
function valorAfirmado(tipo: TipoClaim, trecho: string): string | null {
  if (tipo === "valor") {
    const m = trecho.match(/R\$\s?[\d.,]+|\d[\d.,]*/);
    return m ? m[0] : null;
  }
  return null;
}

export type ClaimDoTexto = {
  tipo: TipoClaim;
  trecho: string;
  modalidade: ModalidadeClaim;
  /** FASE 3 — natureza lida na ORAÇÃO da própria afirmação. */
  natureza: NaturezaAfirmacao;
  /**
   * FASE 2 — segmento da resposta a que a afirmação pertence. Qualificadores
   * (procedimento, profissional, unidade, dia, hora, convênio, condição) são
   * lidos AQUI, nunca em outro ponto da resposta.
   */
  frase: string;
};

/**
 * Camada COMPLEMENTAR: lê o texto final procurando afirmações sensíveis.
 * Nunca é usada como única fonte de verdade do significado operacional —
 * afirmações de agendamento vêm da gramática já existente do workflow.
 */
export function extrairClaimsDoTexto(texto: string): ClaimDoTexto[] {
  const t = (texto ?? "").trim();
  if (!t) return [];
  const achados: ClaimDoTexto[] = [];
  const vistos = new Set<string>();

  for (const { tipo, re } of PADROES) {
    for (const m of t.matchAll(re)) {
      const trecho = String(m[0]).trim().slice(0, 160);
      const chave = `${tipo}:${trecho.toLowerCase()}`;
      if (!trecho || vistos.has(chave)) continue;
      vistos.add(chave);
      const posicao = m.index ?? t.indexOf(trecho);
      const frase = segmentoNaPosicao(t, posicao);
      // FASE 3 — a modalidade é lida na ORAÇÃO, não na frase inteira: o "não"
      // de uma oração não contamina o preço afirmado na oração seguinte.
      const natureza = classificarNatureza(oracaoNaPosicao(t, posicao));
      achados.push({ tipo, trecho, modalidade: modalidadeDaNatureza(natureza), natureza, frase });
      if (achados.length >= LIMITE_CLAIMS) return achados;
    }
  }

  // Afirmação operacional de agendamento: gramática única, a do workflow.
  const operacional = classificarAfirmacaoOperacional(t);
  if (operacional === "sucesso_agendamento") {
    achados.push({
      tipo: "agendamento",
      trecho: "afirmação de agendamento concluído",
      modalidade: "afirmacao",
      natureza: "afirmacao_positiva",
      frase: t,
    });
  }
  return achados;
}

// ------------------------------------------------------------- avaliação

/**
 * Avalia claim a claim contra a evidência realmente disponível no turno.
 * Determinístico: nenhuma chamada de modelo acontece aqui.
 */
export function avaliarGrounding(ctx: ContextoConfianca, texto?: string | null): ResultadoGrounding {
  const canal = evidenciasDisponiveis(ctx);
  const fatos: FatoRecuperado[] | null = ctx.fatos ?? null;
  const estruturados: ClaimEstruturado[] = ctx.claims ?? [];
  const claims: ClaimAvaliado[] = [];
  const vistos = new Set<string>();
  let truncado = houveTruncamento(consultasDoTurno(ctx));

  const push = (c: Omit<ClaimAvaliado, "id">) => {
    claims.push({ id: `${c.tipo}-${claims.length + 1}`, ...c });
  };

  const registrar = (
    tipo: TipoClaim,
    trecho: string,
    origem: ClaimAvaliado["origem"],
    fonteDeclarada: TipoFonte | null,
    modalidade: ModalidadeClaim,
    valor: string | null,
    chave: ChaveFato | null,
    /** FASE 2 — segmento da resposta onde a afirmação foi feita. */
    frase?: string,
    /** FASE 3 — natureza da oração; derivada da modalidade quando ausente. */
    naturezaInformada?: NaturezaAfirmacao,
  ) => {
    const idem = `${tipo}:${normalizarTexto(trecho)}`;
    if (vistos.has(idem)) return;
    vistos.add(idem);
    if (claims.length >= LIMITE_CLAIMS) {
      truncado = true;
      return;
    }

    const natureza: NaturezaAfirmacao =
      naturezaInformada ??
      (modalidade === "pergunta"
        ? "pergunta"
        : modalidade === "hipotese"
          ? "hipotese"
          : modalidade === "negacao"
            ? "ausencia_afirmada"
            : "afirmacao_positiva");

    // Pergunta não afirma nada — nada a verificar.
    if (natureza === "pergunta") return;

    // FASE 3 — declarar desconhecimento, falha de consulta ou recusa NÃO é
    // afirmar um fato: fica registrado como não verificável, sem penalizar.
    if (NATUREZAS_NAO_FACTUAIS.has(natureza)) {
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        natureza,
        situacao: "nao_verificado",
        suportado: false,
        fonte: null,
        motivo:
          natureza === "falha_declarada"
            ? "a resposta declara falha na consulta — não afirma fato a verificar"
            : natureza === "desconhecido_declarado"
              ? "a resposta declara desconhecer a informação — não afirma fato a verificar"
              : "a resposta recusa ou limita o atendimento — não afirma fato a verificar",
      });
      return;
    }

    const aceitas = FONTES_ACEITAS[tipo];
    const canalDoTipo = canal[tipo];

    // Hipótese explícita não é fato verificado, mas também não é fato sem fonte.
    if (modalidade === "hipotese") {
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        situacao: "nao_verificado",
        suportado: false,
        fonte: null,
        motivo: "afirmação apresentada como estimativa — não confirmada em fonte oficial",
      });
      return;
    }

    // Negativa FACTUAL ("não temos vaga"): precisa de evidência do MESMO
    // escopo. Consulta bem-sucedida, sozinha, não comprova ausência.
    if (modalidade === "negacao") {
      const caps = capsDoTipo(tipo);
      const consulta = consultaRespondeu(ctx, caps);
      const falhou = consultaFalhou(ctx, caps);
      const fonteOficial = canalDoTipo ?? (consulta ? aceitas[0] ?? null : null);

      if (!consulta) {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          natureza,
          situacao: "sem_fonte",
          suportado: false,
          fonte: null,
          motivo: falhou
            ? "a consulta falhou neste turno — falha não comprova inexistência"
            : `negativa sem consulta a ${aceitas.join(" ou ")} neste turno`,
        });
        return;
      }

      // Algum fato do mesmo escopo contraria a negativa?
      const alvoNeg = ALVO_DO_FATO[tipo];
      const segmentoNeg = (frase ?? trecho).trim();
      const chaveNeg = chave ?? qualificadoresDaAfirmacao(segmentoNeg);
      const contrarios = fatos
        ? fatosNoEscopoDaAfirmacao(fatos, {
            entidades: alvoNeg.entidades,
            campos: alvoNeg.campos,
            frase: segmentoNeg,
            chave: chaveNeg,
          }).noEscopo.filter((f) => String(f.valor ?? "").trim() !== "")
        : [];

      // O próprio fato pode DECLARAR a ausência ("preparo: Não é preciso
      // jejum"): aí a negativa está apoiada, não contrariada.
      const apoiador = contrarios.find((f) => {
        const v = normalizarTexto(f.valor);
        const tr = normalizarTexto(trecho);
        return (
          classificarNatureza(String(f.valor ?? "")) === "ausencia_afirmada" ||
          (v !== "" && (v.includes(tr) || tr.includes(v)))
        );
      });
      if (apoiador) {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          natureza,
          situacao: "confirmado",
          suportado: true,
          fonte: fonteOficial,
          referencia: referenciaDoFato(apoiador),
          motivo: "negativa apoiada em fato do mesmo escopo que declara a ausência",
        });
        return;
      }

      if (contrarios.length > 0) {
        const f = contrarios[0]!;
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          natureza,
          situacao: "divergente",
          suportado: false,
          fonte: fonteOficial,
          valorDaFonte: f.valor,
          referencia: referenciaDoFato(f),
          motivo: "a consulta retornou dado no escopo afirmado — a negativa contradiz a fonte",
        });
        return;
      }

      // Retorno cortado não comprova ausência.
      if (consulta.status === "parcial" || consulta.truncado === true) {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          natureza,
          situacao: "nao_verificado",
          suportado: false,
          fonte: fonteOficial,
          motivo: "consulta incompleta ou truncada — não comprova inexistência",
        });
        return;
      }

      if (consulta.status === "vazio") {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          natureza,
          situacao: "confirmado",
          suportado: true,
          fonte: fonteOficial,
          motivo: "negativa apoiada em consulta que respondeu sem itens no escopo afirmado",
        });
        return;
      }

      // Respondeu, mas não dá para dizer que o escopo afirmado foi coberto.
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        natureza,
        situacao: "nao_verificado",
        suportado: false,
        fonte: fonteOficial,
        motivo:
          "a consulta respondeu, mas não há evidência de ausência no escopo afirmado",
      });
      return;
    }

    // Agendamento: a prova é o registro persistido, não o texto.
    if (tipo === "agendamento") {
      const provaFato =
        fatos && fatos.some((f) => f.entidade === "agendamento" && f.valor);
      const prova = canal.agendamento ?? (provaFato ? "agenda" : null);
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        situacao: prova ? "confirmado" : "sem_fonte",
        suportado: Boolean(prova),
        fonte: prova,
        motivo: prova
          ? "agendamento comprovado por registro persistido"
          : "afirmação de agendamento sem prova persistida (appointment_id)",
      });
      return;
    }

    if (fonteDeclarada !== null && !aceitas.includes(fonteDeclarada)) {
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        situacao: "sem_fonte",
        suportado: false,
        fonte: canalDoTipo,
        motivo: `fonte declarada (${fonteDeclarada}) não é oficial para ${tipo}`,
      });
      return;
    }

    // --------- confronto com o FATO recuperado (caminho principal da FASE 2)
    const alvo = ALVO_DO_FATO[tipo];

    /**
     * FASE 2 — correspondência factual da afirmação.
     *
     * Cada afirmação é lida no seu próprio segmento: valor + qualificadores
     * (procedimento, profissional, unidade, dia, hora, convênio, condição de
     * pagamento). Preço de um procedimento não aprova o preço de outro, e
     * endereço/preparo/horário só passam quando o VALOR bate com a fonte.
     */
    const segmento = (frase ?? trecho).trim();
    if (fatos && fatos.length > 0 && segmento) {
      // FASE 3 — afirmação monetária: o valor e a CONDIÇÃO vêm do recorte do
      // próprio valor ("R$ 51,00 no dinheiro" / "R$ 60,00 no cartão"),
      // enquanto procedimento/profissional/unidade seguem vindo do segmento.
      const monetaria = tipo === "valor";
      const chaveDaFrase =
        chave ??
        (monetaria ? chaveDaAfirmacaoMonetaria(segmento, trecho) : qualificadoresDaAfirmacao(segmento));
      const valorDaFrase =
        valor ??
        (monetaria
          ? (valorDaAfirmacao(tipo, trecho) ?? valorDaAfirmacao(tipo, segmento))
          : valorDaAfirmacao(tipo, segmento));

      if (process.env["DBG3"]) console.error("DBG", JSON.stringify({tipo,trecho,segmento,chaveDaFrase,valorDaFrase,entidades:alvo.entidades,campos:alvo.campos}));
      const r = correspondenciaDaAfirmacao(fatos, {
        tipo,
        entidades: alvo.entidades,
        campos: alvo.campos,
        frase: segmento,
        chave: chaveDaFrase,
        valor: valorDaFrase,
      });

      if (r.situacao === "confirmado") {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          situacao: "confirmado",
          suportado: true,
          fonte: r.fato.fonte,
          referencia: r.referencia,
          valorAfirmado: valorDaFrase,
          motivo: "afirmação corresponde ao registro recuperado do mesmo caso",
        });
        return;
      }
      if (r.situacao === "divergente") {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          situacao: "divergente",
          suportado: false,
          fonte: r.fato.fonte,
          referencia: r.referencia,
          valorAfirmado: valorDaFrase,
          valorDaFonte: r.valorDaFonte,
          motivo: `valor afirmado diverge da fonte (fonte: ${r.valorDaFonte ?? "vazio"})`,
        });
        return;
      }
      if (r.situacao === "fora_do_escopo") {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          situacao: "fora_do_escopo",
          suportado: false,
          fonte: canalDoTipo,
          valorAfirmado: valorDaFrase,
          motivo:
            r.motivo ??
            "a fonte consultada não cobre este caso (procedimento/profissional/unidade/dia/convênio)",

        });
        return;
      }
      if (r.situacao === "indeterminado") {
        push({
          tipo,
          trecho,
          origem,
          modalidade,
          situacao: "nao_verificado",
          suportado: false,
          fonte: canalDoTipo,
          motivo: r.motivo,
        });
        return;
      }
    }

    if (fatos) {
      for (const campo of alvo.campos) {
        const r = corresponder(fatos, {
          entidades: alvo.entidades,
          campo,
          valor,
          ...(alvo.monetario ? { monetario: true } : {}),
          chave,
        });
        if (r.situacao === "confirmado") {
          // FASE 8 — o valor bater não basta: a afirmação precisa ser do MESMO
          // assunto do dado recuperado. Claims extraídos do texto não trazem
          // chave; se o texto nomeia um assunto diferente do assunto do fato
          // (outro procedimento, outro profissional, outra unidade), a
          // correspondência não comprova nada e vira verificação incompleta.
          // Claims de texto trazem só o trecho do valor; o assunto costuma
          // estar na frase inteira, então conferimos contra a resposta toda.
          if (
            origem === "texto" &&
            !assuntoDoFatoCompativel(
              r.fato,
              `${texto ?? ctx.draftText ?? ""} ${trecho}`,
              fatos ?? [],
            )
          ) {
            push({
              tipo,
              trecho,
              origem,
              modalidade,
              situacao: "nao_verificado",
              suportado: false,
              fonte: r.fato.fonte,
              motivo:
                "o dado recuperado é de outro assunto — não foi possível ligar a afirmação à fonte",
            });
            return;
          }
          push({
            tipo,
            trecho,
            origem,
            modalidade,
            situacao: "confirmado",
            suportado: true,
            fonte: r.fato.fonte,
            motivo: "afirmação corresponde ao registro recuperado",
          });
          return;
        }
        if (r.situacao === "divergente") {
          push({
            tipo,
            trecho,
            origem,
            modalidade,
            situacao: "divergente",
            suportado: false,
            fonte: r.fato.fonte,
            valorDaFonte: r.esperado,
            motivo: `valor afirmado diverge da fonte (fonte: ${r.esperado ?? "vazio"})`,
          });
          return;
        }
        if (r.situacao === "fora_do_escopo") {
          push({
            tipo,
            trecho,
            origem,
            modalidade,
            situacao: "fora_do_escopo",
            suportado: false,
            fonte: canalDoTipo,
            motivo: "a fonte consultada não cobre este caso (procedimento/profissional/dia)",
          });
          return;
        }
      }
    }

    // Reserva já persistida comprova o horário que ela mesma reservou.
    if (
      (tipo === "disponibilidade" || tipo === "escala") &&
      typeof canalDoTipo === "string" &&
      canalDoTipo.startsWith("appointment_id:")
    ) {
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        situacao: "confirmado",
        suportado: true,
        fonte: canalDoTipo,
        motivo: "horário comprovado pela reserva já persistida",
      });
      return;
    }

    // --------- sem fato correspondente
    const houveCanal = Boolean(canalDoTipo) || ferramentaExecutada(ctx, capsDoTipo(tipo));
    if (!houveCanal) {
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        situacao: "sem_fonte",
        suportado: false,
        fonte: null,
        motivo: `sem evidência de ${aceitas.join(" ou ")} para esta afirmação`,
      });
      return;
    }
    if (fatos) {
      push({
        tipo,
        trecho,
        origem,
        modalidade,
        situacao: "sem_fonte",
        suportado: false,
        fonte: null,
        motivo: "a consulta não retornou este dado — afirmação não comprovada",
      });
      return;
    }
    // Canal existia, mas o turno não propagou os fatos: avaliação INCOMPLETA.
    push({
      tipo,
      trecho,
      origem,
      modalidade,
      situacao: "nao_verificado",
      suportado: false,
      fonte: canalDoTipo,
      motivo: "evidência estruturada não propagada ao motor — verificação incompleta",
    });
  };

  for (const c of estruturados) {
    const trecho = (c.texto ?? "").trim().slice(0, 160) || c.tipo;
    registrar(
      c.tipo,
      trecho,
      "estruturado",
      c.fonte?.tipo ?? null,
      c.modalidade ?? classificarModalidade(trecho),
      c.valor ?? valorAfirmado(c.tipo, trecho),
      c.chave ?? null,
      c.texto ?? trecho,
    );
  }
  const textoFinal = texto ?? ctx.draftText ?? "";
  for (const c of extrairClaimsDoTexto(textoFinal)) {
    registrar(
      c.tipo,
      c.trecho,
      "texto",
      null,
      c.modalidade,
      valorAfirmado(c.tipo, c.trecho),
      null,
      c.frase,
      c.natureza,
    );
  }

  const semEvidencia = claims.filter(
    (c) => !c.suportado && c.situacao !== "nao_verificado",
  );
  const naoVerificados = claims.filter((c) => c.situacao === "nao_verificado");

  // FASE 3 — limitações da própria extração ficam registradas: "zero
  // afirmações reconhecidas" nunca é prova de que não havia o que verificar.
  const limitacoes: string[] = [];
  if (truncado) limitacoes.push("avaliação truncada — nem todas as afirmações foram avaliadas");
  if (claims.length === 0 && pareceConterDadoOperacional(textoFinal)) {
    limitacoes.push(
      "a resposta contém dado operacional que o extrator não reconheceu como afirmação",
    );
  }

  return {
    claims,
    total: claims.length,
    suportados: claims.filter((c) => c.suportado).length,
    semEvidencia,
    naoVerificados,
    truncado,
    limitacoes,
  };
}

/** Ações em que uma resposta sem texto ainda assim precisaria de fonte. */
const ACOES_COM_DADO_OFICIAL = new Set([
  "informar_valor",
  "informar_horario",
  "informar_profissional",
  "informar_disponibilidade",
  "informar_preparo",
  "informar_regra",
  "criar_agendamento",
  "cancelar_agendamento",
]);

/**
 * Validador de grounding por afirmação. Substitui a lógica de "muitos fatos =
 * menos confiança": o que derruba a nota é FATO SEM EVIDÊNCIA — e o que não
 * pôde ser verificado vira UNKNOWN, nunca aprovação.
 */
export function ClaimGroundingValidator(ctx: ContextoConfianca): ResultadoValidador {
  const texto = ctx.draftText ?? "";
  const temTexto = texto.trim().length > 0;
  const estruturados = ctx.claims ?? [];

  if (!temTexto && estruturados.length === 0) {
    // Sem texto final não dá para verificar afirmação nenhuma. Se a ação
    // dependeria de dado oficial, isso é UNKNOWN (derruba cobertura), não PASS.
    return ctx.requestedAction !== null && ACOES_COM_DADO_OFICIAL.has(ctx.requestedAction)
      ? res("UNKNOWN", 0, "SEM_TEXTO_PARA_VERIFICAR", { avaliadas: 0 })
      : res("NOT_APPLICABLE", 100, "NADA_A_VERIFICAR", {});
  }

  const r = avaliarGrounding(ctx, texto);

  if (r.semEvidencia.length > 0) {
    return {
      validator: NOME,
      status: "BLOCK",
      score: r.total > 0 ? Math.round((r.suportados / r.total) * 100) : 0,
      reasonCode: r.semEvidencia.some((c) => c.situacao === "divergente")
        ? "AFIRMACAO_DIVERGE_DA_FONTE"
        : "AFIRMACAO_SEM_EVIDENCIA",
      evidence: {
        total: r.total,
        suportados: r.suportados,
        semEvidencia: r.semEvidencia.map((c) => ({
          tipo: c.tipo,
          trecho: c.trecho,
          situacao: c.situacao,
          motivo: c.motivo,
          ...(c.valorDaFonte !== undefined ? { valorDaFonte: c.valorDaFonte } : {}),
        })),
      },
      blocker: "AFIRMACAO_SEM_EVIDENCIA",
    };
  }

  if (r.naoVerificados.length > 0) {
    return res("UNKNOWN", 0, "AFIRMACAO_NAO_VERIFICADA", {
      total: r.total,
      naoVerificados: r.naoVerificados.map((c) => ({ tipo: c.tipo, motivo: c.motivo })),
    });
  }

  if (r.truncado) {
    return res("UNKNOWN", 0, "AVALIACAO_INCOMPLETA", { total: r.total, truncado: true });
  }

  if (r.total === 0) {
    // FASE 3 — extrator não reconheceu nada, mas a resposta tem dado
    // operacional: isso é limitação da extração, não ausência de afirmação.
    if (r.limitacoes.length > 0) {
      return res("UNKNOWN", 0, "AFIRMACAO_NAO_RECONHECIDA_PELO_EXTRATOR", {
        limitacoes: r.limitacoes,
      });
    }
    // Zero afirmações em uma ação que depende de dado oficial não é "nada a
    // verificar": é verificação que não aconteceu.
    // Ações de escrita já são cobertas pelo validador de workflow (prova de
    // gravação); aqui só interessa a resposta que INFORMA algo oficial.
    const acaoInformativa =
      ctx.requestedAction !== null &&
      ACOES_COM_DADO_OFICIAL.has(ctx.requestedAction) &&
      !ctx.requestedAction.startsWith("criar_") &&
      !ctx.requestedAction.startsWith("cancelar_");
    // Negativa apoiada em consulta oficial é resposta correta, não lacuna.
    return acaoInformativa && temTexto && !somenteNegativasApoiadas(ctx, texto)
      ? res("UNKNOWN", 0, "SEM_AFIRMACAO_RECONHECIDA_EM_ACAO_OFICIAL", {
          requestedAction: ctx.requestedAction,
        })
      : res("NOT_APPLICABLE", 100, "SEM_AFIRMACOES_VERIFICAVEIS", { avaliadas: 0 });
  }

  return res("PASS", 100, "TODAS_AS_AFIRMACOES_COM_FONTE", {
    total: r.total,
    claims: r.claims.map((c) => ({ tipo: c.tipo, fonte: c.fonte })),
  });
}

function res(
  status: ResultadoValidador["status"],
  score: number,
  reasonCode: string,
  evidence: Record<string, unknown>,
): ResultadoValidador {
  return { validator: NOME, status, score, reasonCode, evidence, blocker: null };
}

/**
 * FASE 2 — o turno afirma apenas NEGATIVAS já apoiadas em consulta oficial?
 * "Não realizamos esse exame" depois de uma busca que respondeu sem itens é
 * uma resposta correta, não uma afirmação sem fonte.
 */
export function somenteNegativasApoiadas(ctx: ContextoConfianca, texto?: string | null): boolean {
  const t = (texto ?? ctx.draftText ?? "").trim();
  if (!t) return false;
  const r = avaliarGrounding(ctx, t);
  // FASE 3 — só um retorno REALMENTE vazio sustenta a ausência; consulta que
  // trouxe itens, parcial ou truncada não comprova inexistência.
  const consultaVazia = [
    consultaRespondeu(ctx, CAP_CATALOGO),
    consultaRespondeu(ctx, CAP_AGENDA),
  ].find((c) => c !== null && c.status === "vazio" && c.truncado !== true);
  if (r.total === 0) {
    if (r.limitacoes.length > 0) return false;
    // Frase negativa que o extrator não classificou como claim: ainda assim,
    // uma negativa só vale com consulta oficial que respondeu sem itens.
    return Boolean(consultaVazia) && classificarNatureza(t) === "ausencia_afirmada";
  }
  return r.claims.every((c) => c.modalidade === "negacao" && c.suportado);
}
