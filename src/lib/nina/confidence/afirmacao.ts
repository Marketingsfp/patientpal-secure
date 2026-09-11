/**
 * FASE 2 (MOTOR DE CONFIABILIDADE) — CORRESPONDÊNCIA FACTUAL POR AFIRMAÇÃO.
 *
 * O problema corrigido aqui: bastava existir UM fato do tipo certo para uma
 * afirmação ser dada como confirmada. Endereço, preparo, profissional e
 * horário eram aprovados sem que o VALOR afirmado fosse conferido, e um preço
 * correto de um procedimento aprovava o preço errado de outro, porque o
 * assunto era procurado na resposta inteira em vez de na própria afirmação.
 *
 * A partir daqui cada afirmação é lida isoladamente:
 *
 *   entidade + campo + valor + qualificadores (procedimento, profissional,
 *   unidade, data, hora, convênio, condição de pagamento)
 *
 * e comparada com o fato do MESMO escopo. Quando o valor ou a entidade não
 * podem ser extraídos, a afirmação NÃO é confirmada: fica como não verificada.
 *
 * Módulo puro: nenhuma consulta a banco, rede ou modelo. Só o que o servidor
 * já extraiu do retorno real das ferramentas.
 */
import {
  mesmoTexto,
  mesmoValorMonetario,
  normalizarHora,
  normalizarTexto,
  type ChaveFato,
  type FatoRecuperado,
} from "./evidencia";
import type { TipoClaim } from "./types";

// ------------------------------------------------------------ vocabulário

/**
 * Assuntos que o texto pode nomear. Serve só para saber DE QUE a frase fala —
 * não é lista de respostas nem fonte de dado.
 */
export const TERMOS_DE_ASSUNTO = [
  "ultrassonografia",
  "ultrassom",
  "raio x",
  "raio-x",
  "radiografia",
  "ressonancia",
  "tomografia",
  "endoscopia",
  "colonoscopia",
  "mamografia",
  "eletrocardiograma",
  "hemograma",
  "biopsia",
  "vacina",
  "cirurgia",
  "implante",
  "limpeza",
  "clareamento",
  "cardiologia",
  "ginecologia",
  "dermatologia",
  "pediatria",
  "ortopedia",
  "neurologia",
  "oftalmologia",
  "urologia",
  "endocrinologia",
  "psiquiatria",
  "otorrinolaringologia",
  "consulta",
  "retorno",
  "exame",
  "unidade",
];

/**
 * Palavras genéricas de procedimento: não identificam OUTRO procedimento, então
 * não servem para tirar um fato do escopo ("a consulta custa X" continua
 * podendo ser conferida contra o preço da consulta de cardiologia recuperada).
 */
const PROCEDIMENTOS_GENERICOS = new Set(["consulta", "atendimento", "exame", "procedimento"]);

const DIAS_SEMANA = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];

const CONVENIOS = ["unimed", "amil", "bradesco", "sulamerica", "hapvida", "ipasgo", "cassi", "sus"];

// ------------------------------------------------------------- segmentação

/**
 * Uma resposta costuma ter várias afirmações. Cada uma é avaliada no seu
 * próprio segmento: ponto, quebra de linha, ponto e vírgula ou marcador.
 */
export function segmentosDaResposta(texto: string): Array<{ texto: string; inicio: number }> {
  const t = texto ?? "";
  const segmentos: Array<{ texto: string; inicio: number }> = [];
  let inicio = 0;
  const re = /[.!?;\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    segmentos.push({ texto: t.slice(inicio, m.index), inicio });
    inicio = m.index + m[0].length;
  }
  if (inicio < t.length) segmentos.push({ texto: t.slice(inicio), inicio });
  return segmentos.filter((s) => s.texto.trim() !== "");
}

/** Segmento que contém a posição informada (a afirmação avaliada). */
export function segmentoNaPosicao(texto: string, posicao: number): string {
  const s = segmentosDaResposta(texto).find(
    (x) => posicao >= x.inicio && posicao <= x.inicio + x.texto.length,
  );
  return (s?.texto ?? texto).trim();
}

// ------------------------------------------------------- qualificadores

// Prefixo aceito em qualquer caixa; o NOME precisa começar com maiúscula,
// para não capturar palavras comuns ("dra. marina na unidade").
const RE_MEDICO =
  /\b(?:[Dd][Rr][Aa]?|[Dd]outor|[Dd]outora|DRA?|DOUTORA?)\.?\s+([A-ZÀ-Ú][\p{L}]+(?:\s+[A-ZÀ-Ú][\p{L}]+)?)/u;
const RE_UNIDADE = /\bunidade\s+([\p{L}][\p{L}\d\s]{1,28})/iu;
const RE_DATA_NUM = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/;
const RE_DATA_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;

/** Qualificadores lidos NA PRÓPRIA afirmação (nunca em outro trecho da resposta). */
export function qualificadoresDaAfirmacao(frase: string): ChaveFato {
  const t = normalizarTexto(frase);
  const chave: ChaveFato = {};

  const assunto = TERMOS_DE_ASSUNTO.filter((x) => x !== "unidade").find((x) => t.includes(x));
  if (assunto) chave.procedimento = assunto;

  const medico = frase.match(RE_MEDICO);
  if (medico?.[1]) chave.medicoNome = medico[1].trim();

  const unidade = frase.match(RE_UNIDADE);
  if (unidade?.[1]) chave.unidadeId = unidade[1].trim();

  const convenio = CONVENIOS.find((c) => t.includes(c));
  if (convenio) chave.convenio = convenio;

  const dia = DIAS_SEMANA.find((d) => t.includes(d));
  const iso = frase.match(RE_DATA_ISO);
  const num = frase.match(RE_DATA_NUM);
  if (iso) chave.data = iso[0];
  else if (num) chave.data = num[0];
  else if (dia) chave.data = dia;

  const hora = normalizarHora(frase.match(/\b\d{1,2}\s*(?:h\b|h\d{2}|:\d{2})/)?.[0]);
  if (hora) chave.hora = hora;

  if (/\bpix\b|dinheiro|[àa]\s*vista/.test(t)) chave.condicoes = "dinheiro";
  else if (/cart[ãa]o|parcelad/.test(t)) chave.condicoes = "cartao";

  return chave;
}

// -------------------------------------------------------------- valores

/** Horas de jejum/preparo declaradas ("jejum de 6 horas", "8h de jejum"). */
export function horasDePreparo(v: unknown): number | null {
  const t = normalizarTexto(v);
  const m = t.match(/(\d{1,2})\s*(?:h\b|horas?\b)/);
  return m ? Number(m[1]) : null;
}

/** Endereço reduzido a logradouro + número, para comparação de fato. */
export function enderecoNormalizado(v: unknown): { via: string; numero: string | null } | null {
  const t = normalizarTexto(v).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = t.match(
    /\b(rua|av|avenida|travessa|rodovia|estrada|praca|alameda)\b\s+([\p{L}\d\s]{2,60})/u,
  );
  const corpo = m ? `${m[1]} ${m[2]}` : t;
  const numero = corpo.match(/\b(\d{1,6})\b/)?.[1] ?? null;
  const via = corpo
    .replace(/\b\d{1,6}\b.*$/, "")
    .replace(/\b(av)\b/, "avenida")
    .trim();
  return via ? { via, numero } : null;
}

function mesmoEndereco(a: unknown, b: unknown): boolean {
  const x = enderecoNormalizado(a);
  const y = enderecoNormalizado(b);
  if (!x || !y) return false;
  if (x.numero && y.numero && x.numero !== y.numero) return false;
  return x.via.includes(y.via) || y.via.includes(x.via);
}

/** Valor afirmado, por tipo de afirmação. `null` = a frase não cita valor. */
export function valorDaAfirmacao(tipo: TipoClaim, frase: string): string | null {
  const t = frase ?? "";
  if (tipo === "valor") return t.match(/R\$\s?[\d.,]+|\b\d[\d.]*,\d{2}\b/)?.[0] ?? null;
  if (tipo === "preparo") {
    const h = horasDePreparo(t);
    return h === null ? null : `${h}h`;
  }
  if (tipo === "endereco" || tipo === "unidade") {
    const e = enderecoNormalizado(t);
    return e ? [e.via, e.numero].filter(Boolean).join(" ") : null;
  }
  if (tipo === "disponibilidade" || tipo === "escala") {
    const q = qualificadoresDaAfirmacao(t);
    return [q.data, q.hora].filter(Boolean).join(" ") || null;
  }
  if (tipo === "profissional") return t.match(RE_MEDICO)?.[1]?.trim() ?? null;
  return null;
}

/**
 * A frase promete um valor específico? Serve para separar "há preparo para
 * este exame" (genérica) de "o jejum é de 12 horas" (específica).
 */
export function afirmacaoEspecifica(tipo: TipoClaim, frase: string): boolean {
  const t = normalizarTexto(frase);
  if (tipo === "valor") return /r\$|\d/.test(t);
  if (tipo === "preparo") return /\d/.test(t);
  if (tipo === "endereco" || tipo === "unidade")
    return /\b(rua|av|avenida|travessa|rodovia|estrada|praca|alameda)\b/.test(t);
  if (tipo === "disponibilidade" || tipo === "escala")
    return DIAS_SEMANA.some((d) => t.includes(d)) || /\d{1,2}\s*(h|:\d{2})|\d{1,2}\/\d{1,2}/.test(t);
  if (tipo === "profissional") return /\b(dr|dra|doutor|doutora)\b/.test(t);
  return false;
}

// ------------------------------------------------------------ comparação

function diaDaSemanaDeISO(v: string): string | null {
  const m = v.match(RE_DATA_ISO);
  if (!m) return null;
  const d = new Date(`${m[0]}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return DIAS_SEMANA[d.getUTCDay()] ?? null;
}

/** Datas comparáveis: ISO, dd/mm e nome do dia da semana. */
export function mesmaData(afirmada: unknown, doFato: unknown): boolean {
  const a = normalizarTexto(afirmada);
  const b = normalizarTexto(doFato);
  if (!a || !b) return false;
  if (a === b) return true;

  const diaA = DIAS_SEMANA.find((d) => a.includes(d)) ?? diaDaSemanaDeISO(a);
  const diaB = DIAS_SEMANA.find((d) => b.includes(d)) ?? diaDaSemanaDeISO(b);
  if (diaA && diaB) return diaA === diaB;

  const na = a.match(RE_DATA_NUM);
  const nb = b.match(RE_DATA_ISO);
  if (na && nb) return Number(na[1]) === Number(nb[3]) && Number(na[2]) === Number(nb[2]);
  const nb2 = b.match(RE_DATA_NUM);
  if (na && nb2) return Number(na[1]) === Number(nb2[1]) && Number(na[2]) === Number(nb2[2]);
  return false;
}

function mesmoQualificador(campo: keyof ChaveFato, afirmado: unknown, doFato: unknown): boolean {
  if (campo === "data") return mesmaData(afirmado, doFato);
  if (campo === "hora") {
    const h = normalizarHora(afirmado);
    const hf = normalizarHora(doFato);
    return h !== null && hf !== null && h === hf;
  }
  return mesmoTexto(afirmado, doFato);
}

const QUALIFICADORES: Array<keyof ChaveFato> = [
  "procedimento",
  "medicoNome",
  "unidadeId",
  "convenio",
  "condicoes",
  "data",
  "hora",
];

/**
 * Qualificadores que RESTRINGEM o caso: se a afirmação cita unidade ou
 * convênio e o dado recuperado não diz a que unidade/convênio pertence, não é
 * possível ligar a afirmação à fonte — e ausência de informação não confirma.
 */
const QUALIFICADORES_ESTRITOS = new Set<keyof ChaveFato>(["unidadeId", "convenio"]);

/** O fato pertence ao mesmo caso que a afirmação descreve? */
function noEscopoDaAfirmacao(
  fato: FatoRecuperado,
  chave: ChaveFato,
  discriminaveis: Set<keyof ChaveFato>,
  avalizados: Set<keyof ChaveFato>,
): boolean {
  const f = fato.chave ?? {};
  for (const campo of QUALIFICADORES) {
    const pedido = chave[campo];
    if (pedido === undefined || pedido === null || String(pedido).trim() === "") continue;
    if (campo === "procedimento" && PROCEDIMENTOS_GENERICOS.has(normalizarTexto(String(pedido))))
      continue;
    // Nenhum fato deste campo traz o qualificador: ele não discrimina nada
    // neste turno, então não serve nem para aprovar nem para reprovar —
    // exceto unidade e convênio, que restringem o caso afirmado e só podem
    // ser ignorados quando outro fato do turno avaliza aquela unidade/convênio.
    if (!discriminaveis.has(campo)) {
      if (!QUALIFICADORES_ESTRITOS.has(campo) || avalizados.has(campo)) continue;
      return false;
    }
    const doFato =
      campo === "procedimento"
        ? (f.procedimento ?? f.especialidade)
        : campo === "medicoNome"
          ? (f.medicoNome ?? f.medicoId)
          : f[campo];
    if (doFato === undefined || doFato === null || String(doFato).trim() === "") return false;
    if (!mesmoQualificador(campo, pedido, doFato)) return false;
  }
  return true;
}

function valoresIguais(tipo: TipoClaim, afirmado: string, doFato: unknown): boolean {
  if (tipo === "valor") return mesmoValorMonetario(afirmado, doFato);
  if (tipo === "preparo") {
    const a = horasDePreparo(afirmado);
    const b = horasDePreparo(doFato);
    if (a !== null && b !== null) return a === b;
    return mesmoTexto(afirmado, doFato);
  }
  if (tipo === "endereco" || tipo === "unidade") return mesmoEndereco(afirmado, doFato);
  if (tipo === "disponibilidade" || tipo === "escala") {
    // Dia e hora já foram conferidos como escopo; aqui basta o fato existir
    // com conteúdo (o slot concreto).
    return String(doFato ?? "").trim() !== "";
  }
  return mesmoTexto(afirmado, doFato);
}

export type CorrespondenciaAfirmacao =
  | { situacao: "confirmado"; fato: FatoRecuperado; referencia: string }
  | { situacao: "divergente"; fato: FatoRecuperado; referencia: string; valorDaFonte: string | null }
  | { situacao: "fora_do_escopo" }
  | { situacao: "indeterminado"; motivo: string }
  | { situacao: "sem_fato" };

export type PedidoAfirmacao = {
  tipo: TipoClaim;
  entidades: FatoRecuperado["entidade"][];
  campos: string[];
  frase: string;
  chave: ChaveFato;
  valor: string | null;
};

/** Referência auditável do fato usado na conferência. */
export function referenciaDoFato(f: FatoRecuperado): string {
  return `${f.fonte}:${f.consulta}${f.registro ? `#${f.registro}` : ""}${f.versao ? `@${f.versao}` : ""}`;
}

/**
 * Confronta UMA afirmação com os fatos do mesmo escopo.
 *
 * - `confirmado`: existe fato do mesmo escopo com o mesmo valor.
 * - `divergente`: existe fato do mesmo escopo com valor diferente.
 * - `fora_do_escopo`: há fatos do campo, mas nenhum do caso afirmado.
 * - `indeterminado`: a frase promete um valor específico que não foi possível
 *   extrair — não dá para confirmar nem contradizer.
 * - `sem_fato`: nenhum fato desse campo neste turno.
 */
export function correspondenciaDaAfirmacao(
  fatos: FatoRecuperado[],
  pedido: PedidoAfirmacao,
): CorrespondenciaAfirmacao {
  const doCampo = fatos.filter(
    (f) => pedido.entidades.includes(f.entidade) && pedido.campos.some((c) => mesmoTexto(f.campo, c)),
  );
  if (doCampo.length === 0) return { situacao: "sem_fato" };

  const discriminaveis = new Set<keyof ChaveFato>();
  for (const campo of QUALIFICADORES) {
    const temAlgum = doCampo.some((f) => {
      const c = f.chave ?? {};
      const v =
        campo === "procedimento"
          ? (c.procedimento ?? c.especialidade)
          : campo === "medicoNome"
            ? (c.medicoNome ?? c.medicoId)
            : c[campo];
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    if (temAlgum) discriminaveis.add(campo);
  }

  // Unidade e convênio citados na frase podem estar avalizados por OUTRO fato
  // do mesmo turno (ex.: um fato da entidade "unidade" com aquele nome).
  const avalizados = new Set<keyof ChaveFato>();
  for (const campo of QUALIFICADORES_ESTRITOS) {
    const pedida = pedido.chave[campo];
    if (pedida === undefined || pedida === null || String(pedida).trim() === "") continue;
    const entidadeDoCampo = campo === "unidadeId" ? "unidade" : "convenio";
    const ok = fatos.some((f) => {
      const c = f.chave ?? {};
      if (c[campo] !== undefined && mesmoQualificador(campo, pedida, c[campo])) return true;
      return f.entidade === entidadeDoCampo && mesmoTexto(pedida, f.valor);
    });
    if (ok) avalizados.add(campo);
  }

  const noEscopo = doCampo.filter((f) =>
    noEscopoDaAfirmacao(f, pedido.chave, discriminaveis, avalizados),
  );
  if (noEscopo.length === 0) return { situacao: "fora_do_escopo" };

  if (pedido.valor === null || pedido.valor.trim() === "") {
    if (afirmacaoEspecifica(pedido.tipo, pedido.frase)) {
      return {
        situacao: "indeterminado",
        motivo: "a afirmação cita um dado específico que não foi possível extrair para conferência",
      };
    }
    return { situacao: "confirmado", fato: noEscopo[0]!, referencia: referenciaDoFato(noEscopo[0]!) };
  }

  const batendo = noEscopo.find((f) => valoresIguais(pedido.tipo, pedido.valor!, f.valor));
  if (batendo) return { situacao: "confirmado", fato: batendo, referencia: referenciaDoFato(batendo) };

  const primeiro = noEscopo[0]!;
  return {
    situacao: "divergente",
    fato: primeiro,
    referencia: referenciaDoFato(primeiro),
    valorDaFonte: primeiro.valor,
  };
}
