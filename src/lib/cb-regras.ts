/** Helpers para regras de preço de convênios do Cartão Benefícios. */

/**
 * Dias corridos de tolerância depois do vencimento da mensalidade.
 *
 * Regra de negócio: dentro da tolerância o cartão funciona NORMALMENTE — os
 * mesmos benefícios, limites e descontos de sempre. Só a partir do 6º dia a
 * parcela conta como atrasada e o convênio é bloqueado no balcão.
 *
 * Fica aqui, e não solto em cada tela, porque a mesma régua precisa valer em
 * dois lugares que antes não conversavam: o bloqueio do atendimento
 * (`info-convenio-paciente`) e o indicador de inadimplentes da tela de Vendas.
 * Com o número repetido, um gestor olhando o card e a recepção olhando a ficha
 * do paciente chegavam a conclusões opostas sobre a mesma pessoa.
 */
export const DIAS_TOLERANCIA_MENSALIDADE = 5;

/** Em qual indicador do topo da tela de Vendas a parcela do mês entra. */
export type SituacaoParcelaMes = "paga" | "cancelada" | "a_vencer" | "inadimplente";

/**
 * Classifica uma parcela com vencimento no mês corrente para os indicadores.
 *
 * Cada parcela cai em exatamente um balde, então os números do topo somam o
 * total do mês sem sobra nem repetição.
 *
 * "A vencer" junta duas situações porque, para quem atende no balcão, elas são
 * a mesma coisa: a parcela que ainda não venceu e a que venceu há poucos dias
 * mas continua dentro da tolerância — nas duas o cartão funciona. Só depois da
 * tolerância a parcela vira inadimplência, exatamente como no bloqueio do
 * atendimento.
 *
 * As datas entram como texto ISO (AAAA-MM-DD) e são comparadas como texto de
 * propósito: `new Date("2026-08-10")` é lido como UTC e, no Brasil, volta como
 * dia 9 — erro que já custou um dia inteiro de diferença em outras telas.
 */
export function classificarParcelaDoMes(
  status: string | null | undefined,
  vencimentoIso: string,
  hojeIso: string,
  diasTolerancia: number = DIAS_TOLERANCIA_MENSALIDADE,
): SituacaoParcelaMes {
  const s = (status ?? "").toLowerCase();
  if (s === "pago") return "paga";
  if (s === "cancelado") return "cancelada";

  const corte = new Date(hojeIso + "T00:00:00");
  corte.setDate(corte.getDate() - diasTolerancia);
  const pad = (n: number) => String(n).padStart(2, "0");
  const corteIso = `${corte.getFullYear()}-${pad(corte.getMonth() + 1)}-${pad(corte.getDate())}`;

  return vencimentoIso.slice(0, 10) < corteIso ? "inadimplente" : "a_vencer";
}

export interface CbRegra {
  id: string;
  convenio_id: string;
  especialidade_id: string | null;
  /** Serviço específico (procedimento) ao qual esta regra se aplica. Null = qualquer serviço. */
  procedimento_id?: string | null;
  tipo: string | null;
  modo: string; // "valor_fixo" | "percentual_desconto"
  valor: number | null;
  percentual: number | null;
  /** Valor fixo cobrado quando o pagamento é em cartão/PIX (não-dinheiro). Se nulo, usa `valor`. */
  valor_cartao?: number | null;
  /** Percentual de desconto quando o pagamento é em cartão/PIX. Se nulo, usa `percentual`. */
  percentual_cartao?: number | null;
  prioridade: number;
  ativo?: boolean;
  limite_qtd?: number | null;
  limite_periodo?: string | null; // "dia" | "semana" | "mes" | "ano" | "contrato"
  limite_escopo?: string | null; // "contrato" | "paciente"
  excedente_modo?: string | null; // "percentual_particular" | "valor_fixo" | "particular" | "bloquear" | "regra_padrao_convenio"
  excedente_percentual?: number | null;
  excedente_valor?: number | null;
  /**
   * Nº de mensalidades pagas que o contrato precisa ter antes desta regra
   * (desconto do convênio) valer. 0 = imediato.
   */
  carencia_mensalidades?: number | null;
  /** Regra é cortesia — exibida como "Gratuito" no sistema. */
  gratuito?: boolean | null;
  /**
   * Identificador do grupo de gratuidade compartilhada. Regras com o mesmo
   * `grupo_gratuidade` dentro do mesmo convênio dividem a mesma cota
   * (limite_qtd) no contrato — ex.: "mama-preventivo" cobre Mamografia OU
   * USG de Mama. `null` = sem compartilhamento.
   */
  grupo_gratuidade?: string | null;
}

/** Retorna true se o contrato já cumpriu a carência exigida pela regra. */
export function carenciaCumprida(regra: CbRegra | null, mensalidadesPagas: number): boolean {
  if (!regra) return true;
  const min = Number(regra.carencia_mensalidades ?? 0) || 0;
  if (min <= 0) return true;
  return mensalidadesPagas >= min;
}

/**
 * Escolhe a regra mais específica e de maior prioridade para a combinação
 * (procedimento, especialidade, tipo). Especificidade: serviço específico >
 * especialidade+tipo > especialidade > tipo > genérica.
 */
export function findRegra(
  regras: CbRegra[],
  especialidadeId: string | null | undefined,
  tipo: string | null | undefined,
  procedimentoId?: string | null,
  opts?: { excludeGratuito?: boolean },
): CbRegra | null {
  const tipoNorm = (tipo ?? "").toLowerCase() || null;
  const espId = especialidadeId || null;
  const procId = procedimentoId || null;
  const candidates = regras.filter((r) => {
    if (r.ativo === false) return false;
    if (opts?.excludeGratuito && r.gratuito) return false;
    if (r.procedimento_id) {
      // regra específica por serviço só bate se o serviço confere
      if (!procId || r.procedimento_id !== procId) return false;
      return true;
    }
    if (r.especialidade_id && r.especialidade_id !== espId) return false;
    if (r.tipo && r.tipo.toLowerCase() !== tipoNorm) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  // Especificidade (serviço > especialidade > tipo) continua mandando. Dentro
  // do MESMO nível de especificidade, uma regra de gratuidade vence qualquer
  // regra de desconto, independentemente da prioridade cadastrada — antes uma
  // regra de 10% com prioridade 100 sobrepunha a gratuidade com prioridade 10
  // no mesmo serviço (ex.: ECG saindo R$ 45,90 em vez de gratuito). A
  // prioridade só desempata entre regras do mesmo tipo.
  const score = (r: CbRegra) =>
    (r.procedimento_id ? 1000 : 0) +
    (r.especialidade_id ? 100 : 0) +
    (r.tipo ? 50 : 0) +
    (r.gratuito ? 10 : 0) +
    (r.prioridade || 0) * 0.001;
  return candidates.slice().sort((a, b) => score(b) - score(a))[0];
}

export function computeValor(
  regra: CbRegra | null,
  baseDinheiro: number,
  baseOutros: number,
): { dinheiro: number; outros: number } | null {
  if (!regra) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (regra.modo === "valor_fixo") {
    const v = Number(regra.valor) || 0;
    const vCartao = regra.valor_cartao != null ? Number(regra.valor_cartao) || 0 : v;
    return { dinheiro: round2(v), outros: round2(vCartao) };
  }
  if (regra.modo === "percentual_desconto") {
    const p = Number(regra.percentual) || 0;
    const pCartao = regra.percentual_cartao != null ? Number(regra.percentual_cartao) || 0 : p;
    const kDin = 1 - p / 100;
    const kOut = 1 - pCartao / 100;
    return { dinheiro: round2(baseDinheiro * kDin), outros: round2(baseOutros * kOut) };
  }
  return null;
}

/**
 * Acréscimo automático aplicado ao valor "outros" (não-dinheiro: PIX, débito,
 * crédito) quando o paciente usa um benefício de um convênio do Cartão
 * Benefícios. Cadastrado por convênio (tabela `cb_convenios`). Nunca vale
 * para o Convênio Funcionário.
 */
export interface CbAcrescimoCartao {
  modo: "percentual" | "valor_fixo" | null;
  percentual: number;
  valor: number;
}

/** True se o nome do convênio identifica o interno "FUNCIONARIO". */
export function isConvenioFuncionarioNome(nome: string | null | undefined): boolean {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .includes("FUNCIONARIO");
}

/**
 * Aplica o acréscimo de cartão sobre o valor "outros" (não-dinheiro).
 * - Convênio Funcionário: nunca acresce.
 * - `valorOutros <= 0` (ex.: gratuidade): não faz sentido acrescer sobre 0.
 * - Sem acréscimo configurado (`modo` nulo): retorna o próprio valor.
 */
export function applyAcrescimoCartao(
  valorOutros: number,
  _acr: CbAcrescimoCartao | null | undefined,
  _convenioNome?: string | null,
): number {
  // Descontinuado: o acréscimo automático de cartão foi substituído pelo
  // campo "valor cartão/PIX" cadastrado diretamente em cada regra
  // (ver `computeValor`). Mantido como no-op para preservar a assinatura
  // usada em telas antigas até serem migradas.
  return valorOutros;
}
