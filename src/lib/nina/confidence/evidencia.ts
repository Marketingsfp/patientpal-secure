/**
 * FASE 2 — EVIDÊNCIA FACTUAL DO TURNO (camada pura).
 *
 * Antes: "a consulta ao catálogo funcionou" valia como prova de QUALQUER
 * afirmação do turno (um único `catalogoEncontrou`). Agora cada consulta
 * produz FATOS estruturados, e cada afirmação é confrontada com o fato
 * correspondente — mesmo procedimento, mesmo profissional, mesmo dia,
 * mesma unidade, mesma condição.
 *
 * Este módulo não conhece banco, provedor nem modelo: recebe o que o servidor
 * extraiu do retorno real das ferramentas e oferece a comparação.
 */
import type { TipoFonte } from "./types";

/** O que aconteceu com uma consulta/operação — sucesso técnico não é fato. */
export type StatusConsulta =
  /** Executou e devolveu itens aproveitáveis. */
  | "com_itens"
  /** Executou, respondeu corretamente e não havia nada (prova de ausência). */
  | "vazio"
  /** Executou, devolveu parte do conjunto (limite/truncamento). */
  | "parcial"
  /** Falhou tecnicamente — não prova nada, em nenhuma direção. */
  | "falha"
  /** Não foi possível classificar o retorno. */
  | "nao_verificado";

/** Que tipo de coisa o fato descreve. */
export type EntidadeFato =
  | "procedimento"
  | "servico"
  | "profissional"
  | "vaga"
  | "escala"
  | "unidade"
  | "endereco"
  | "convenio"
  | "restricao"
  | "agendamento"
  | "clinica";

/** Qualificadores que amarram o fato ao caso concreto. */
export type ChaveFato = {
  procedimento?: string | null;
  medicoId?: string | null;
  medicoNome?: string | null;
  especialidade?: string | null;
  data?: string | null;
  hora?: string | null;
  unidadeId?: string | null;
  convenio?: string | null;
  condicoes?: string | null;
};

/** Um fato concreto extraído do retorno REAL de uma consulta. */
export type FatoRecuperado = {
  /** Consulta/operação que produziu o fato. */
  consulta: string;
  capacidade: string | null;
  entidade: EntidadeFato;
  /** Campo do registro: preco, endereco, slot, dia_atendimento, cobertura... */
  campo: string;
  /** Valor normalizado como texto. `null` = campo existe e está vazio. */
  valor: string | null;
  registro?: string | null;
  fonte: TipoFonte;
  clinicaId?: string | null;
  versao?: string | null;
  vigenteAte?: string | null;
  chave?: ChaveFato;
};

/** Uma consulta do turno, com histórico de tentativas (retry). */
export type ConsultaDoTurno = {
  /** Identidade da consulta: mesma ferramenta + mesmos argumentos. */
  id: string;
  consulta: string;
  capacidade: string | null;
  status: StatusConsulta;
  /** Quantas vezes foi executada neste turno. */
  tentativas: number;
  /** Falhas que aconteceram ANTES do resultado vigente. */
  falhasAnteriores: string[];
  /** Erro da tentativa vigente (quando o status é `falha`). */
  erro?: string | null;
  /** O retorno foi cortado por limite — a avaliação é incompleta. */
  truncado?: boolean;
  /** Motivo declarado pela própria ferramenta (AGENDA_CHEIA, etc.). */
  motivo?: string | null;
};

// --------------------------------------------------------------- normalização

export function normalizarTexto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai o número de um valor monetário em pt-BR ("R$ 1.250,00" -> 1250). */
export function valorMonetario(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const bruto = String(v ?? "").trim();
  if (!bruto) return null;
  const m = bruto.match(/-?\d[\d.\s]*(,\d{1,2})?|-?\d+(\.\d{1,2})?/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Dois valores monetários são o mesmo fato? (tolerância de 1 centavo) */
export function mesmoValorMonetario(a: unknown, b: unknown): boolean {
  const x = valorMonetario(a);
  const y = valorMonetario(b);
  if (x === null || y === null) return false;
  return Math.abs(x - y) < 0.01;
}

/** Comparação de textos de negócio: acentos, caixa e espaços não importam. */
export function mesmoTexto(a: unknown, b: unknown): boolean {
  const x = normalizarTexto(a);
  const y = normalizarTexto(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Hora normalizada em HH:MM (aceita "9h", "09:00", "9:00"). */
export function normalizarHora(v: unknown): string | null {
  const m = String(v ?? "").match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?/);
  if (!m) return null;
  const h = String(Number(m[1])).padStart(2, "0");
  const min = (m[2] ?? "00").padStart(2, "0");
  return `${h}:${min}`;
}

// ------------------------------------------------------------- correspondência

export type ResultadoCorrespondencia =
  /** Existe fato equivalente que sustenta a afirmação. */
  | { situacao: "confirmado"; fato: FatoRecuperado }
  /** Existe fato do mesmo campo, com valor DIFERENTE. */
  | { situacao: "divergente"; fato: FatoRecuperado; esperado: string | null }
  /** Existem fatos, mas nenhum para este caso (outro procedimento/dia/médico). */
  | { situacao: "fora_do_escopo" }
  /** Nenhum fato desse tipo foi recuperado neste turno. */
  | { situacao: "sem_fato" };

/** A chave do fato é compatível com a chave da afirmação? */
export function chaveCompativel(fato: FatoRecuperado, chave?: ChaveFato | null): boolean {
  if (!chave) return true;
  const f = fato.chave ?? {};
  const pares: Array<[unknown, unknown]> = [
    [chave.procedimento, f.procedimento],
    [chave.medicoId, f.medicoId],
    [chave.medicoNome, f.medicoNome],
    [chave.especialidade, f.especialidade],
    [chave.unidadeId, f.unidadeId],
    [chave.convenio, f.convenio],
  ];
  for (const [pedido, doFato] of pares) {
    if (pedido === undefined || pedido === null || String(pedido).trim() === "") continue;
    if (doFato === undefined || doFato === null || String(doFato).trim() === "") return false;
    if (!mesmoTexto(pedido, doFato)) return false;
  }
  if (chave.data && f.data && normalizarTexto(chave.data) !== normalizarTexto(f.data)) return false;
  if (chave.data && !f.data) return false;
  if (chave.hora) {
    const h = normalizarHora(chave.hora);
    const hf = normalizarHora(f.hora);
    if (!hf || h !== hf) return false;
  }
  return true;
}

export type PedidoCorrespondencia = {
  entidades: EntidadeFato[];
  campo: string;
  /** Valor afirmado pela Nina. `null` = a afirmação não cita valor. */
  valor?: string | null;
  /** Comparação numérica de dinheiro em vez de texto. */
  monetario?: boolean;
  chave?: ChaveFato | null;
};

/** Confronta a afirmação com os fatos recuperados. */
export function corresponder(
  fatos: FatoRecuperado[],
  pedido: PedidoCorrespondencia,
): ResultadoCorrespondencia {
  const doCampo = fatos.filter(
    (f) => pedido.entidades.includes(f.entidade) && mesmoTexto(f.campo, pedido.campo),
  );
  if (doCampo.length === 0) return { situacao: "sem_fato" };

  const noEscopo = doCampo.filter((f) => chaveCompativel(f, pedido.chave));
  if (noEscopo.length === 0) return { situacao: "fora_do_escopo" };

  // Afirmação sem valor específico: basta existir o fato no escopo.
  if (pedido.valor === undefined || pedido.valor === null || String(pedido.valor).trim() === "") {
    return { situacao: "confirmado", fato: noEscopo[0]! };
  }

  const igual = (f: FatoRecuperado) =>
    pedido.monetario ? mesmoValorMonetario(f.valor, pedido.valor) : mesmoTexto(f.valor, pedido.valor);

  const batendo = noEscopo.find(igual);
  if (batendo) return { situacao: "confirmado", fato: batendo };
  const primeiro = noEscopo[0]!;
  return { situacao: "divergente", fato: primeiro, esperado: primeiro.valor };
}

// ------------------------------------------------------------------ consultas

/** Consulta vigente por identidade, já com o histórico de tentativas somado. */
export function consolidarTentativas(consultas: ConsultaDoTurno[]): ConsultaDoTurno[] {
  const porId = new Map<string, ConsultaDoTurno>();
  for (const c of consultas) {
    const anterior = porId.get(c.id);
    if (!anterior) {
      porId.set(c.id, { ...c });
      continue;
    }
    const falhasAnteriores = [...anterior.falhasAnteriores];
    if (anterior.status === "falha" && anterior.erro) falhasAnteriores.push(anterior.erro);
    porId.set(c.id, {
      ...c,
      tentativas: anterior.tentativas + c.tentativas,
      falhasAnteriores: [...falhasAnteriores, ...c.falhasAnteriores],
    });
  }
  return [...porId.values()];
}

/** Falha que continua valendo: a última tentativa daquela consulta falhou. */
export function falhasVigentes(consultas: ConsultaDoTurno[]): ConsultaDoTurno[] {
  return consolidarTentativas(consultas).filter((c) => c.status === "falha");
}

/** Alguma consulta teve retorno cortado por limite? */
export function houveTruncamento(consultas: ConsultaDoTurno[]): boolean {
  return consultas.some((c) => c.truncado === true || c.status === "parcial");
}
