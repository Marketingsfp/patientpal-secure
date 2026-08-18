// Cálculo puro de repasse ao médico a partir das regras cadastradas
// (convênio por procedimento, convênio por categoria, cartão consulta,
// fallback pelo padrão do médico). Mesma lógica usada na tela de
// Atendimentos do Financeiro — extraída aqui para ser reutilizada na
// segunda via de comprovantes de repasse.

export interface RepasseMedico {
  id: string;
  tipo_repasse?: string | null;
  percentual_repasse_padrao?: number | null;
  valor_repasse_padrao?: number | null;
  aceita_cartao_beneficios?: boolean | null;
  cb_tipo_repasse?: string | null;
  cb_valor_repasse?: number | null;
  cb_percentual_repasse?: number | null;
}

export interface RepasseConvenio {
  medico_id: string;
  nome: string;
  tipo_repasse: string | null;
  percentual: number | null;
  valor: number | null;
  /** Repasse quando o atendimento é por convênio (nulo = usa padrão) */
  convenio_tipo_repasse?: string | null;
  convenio_percentual?: number | null;
  convenio_valor?: number | null;
  /** Repasse fixo em pagamentos via Cartão Consulta (nulo = usa padrão) */
  cartao_consulta_valor?: number | null;
  /** Repasse fixo em pagamentos via Cartão Desconto (nulo = usa padrão) */
  cartao_desconto_valor?: number | null;
  /**
   * REPASSE TRIPLO — médico terceiro (ex.: dono do equipamento usado no exame)
   * que também recebe por este serviço. Nulo = esta linha não tem terceiro.
   */
  terceiro_id?: string | null;
  /**
   * REPASSE TRIPLO — percentual do VALOR TOTAL do atendimento pago ao terceiro.
   * Vale para qualquer forma de atendimento (particular, convênio, cartões),
   * porque o combinado com o dono do equipamento é sobre o exame, não sobre a
   * forma de pagamento do paciente.
   */
  percentual_terceiro?: number | null;
}

/** Parte do terceiro (dono do equipamento) apurada num atendimento. */
export interface RepasseTerceiro {
  medico_id: string;
  percentual: number;
  valor: number;
}

/** Localiza a linha de repasse cadastrada para o serviço (ou sua categoria). */
function findConvenioRow(
  ctx: RepasseCtx,
  medicoId: string,
  procNome: string | null,
): RepasseConvenio | undefined {
  if (!procNome) return undefined;
  const { convenios, procTipos } = ctx;
  const variants = procVariants(procNome);
  for (const alvo of variants) {
    const c = convenios.find((cv) => cv.medico_id === medicoId && normRepasse(cv.nome) === alvo);
    if (c) return c;
  }
  for (const alvo of variants) {
    const tipo = procTipos.get(alvo);
    if (!tipo) continue;
    const sentinel = `__CAT__:${String(tipo).toUpperCase()}`;
    const c = convenios.find((cv) => cv.medico_id === medicoId && cv.nome === sentinel);
    if (c) return c;
  }
  return undefined;
}

export const isCartaoDescontoDesc = (desc: string | null | undefined): boolean => {
  if (!desc) return false;
  const d = desc.toUpperCase();
  if (d.includes("ADESAO") || d.includes("ADESÃO")) return false;
  return d.includes("CARTAO DESCONTO") || d.includes("CARTÃO DESCONTO");
};

export interface RepasseCtx {
  medicos: RepasseMedico[];
  convenios: RepasseConvenio[];
  /** Mapa key(normalizada) -> tipo do procedimento */
  procTipos: Map<string, string>;
}

export const normRepasse = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Forma de atendimento que decide QUAL coluna da grade de repasse vale. */
export type FormaRepasse = "particular" | "convenio" | "cartao_consulta" | "cartao_desconto";

/**
 * Lê uma célula da grade de repasse (Particular, Convênio, Cartão Consulta,
 * Cartão Desconto).
 *
 * Célula em branco significa "herda o Repasse Padrão do médico" — por isso
 * `null`, `undefined`, string vazia e o texto "padrão" (que a tela mostra no
 * campo vazio e versões antigas chegaram a gravar) devolvem `null`.
 *
 * Só um número conta como valor configurado — inclusive `0`, que é como o
 * usuário diz "este atendimento não gera repasse".
 */
export const valorCelulaRepasse = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const bruto = String(v).trim();
  if (!bruto) return null;
  if (normRepasse(bruto) === "padrao") return null;
  const n = Number(bruto.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Repasse padrão do médico (o fundo do poço da herança). */
export function repassePadraoDoMedico(med: RepasseMedico | null | undefined, base: number): number {
  if (!med) return 0;
  const valor = valorCelulaRepasse(med.valor_repasse_padrao);
  if (med.tipo_repasse === "valor" && valor != null) {
    // Sem pagamento no caixa (convênio cobra direto da clínica) o fixo é pago
    // integral; com pagamento, nunca passa do que entrou.
    return base > 0 ? Math.min(valor, base) : valor;
  }
  const pct = valorCelulaRepasse(med.percentual_repasse_padrao) ?? 0;
  return +((base * pct) / 100).toFixed(2);
}

/** Repasse de cartão benefício cadastrado no próprio médico (null = não configurado). */
function repasseCartaoBeneficios(
  med: RepasseMedico | null | undefined,
  base: number,
): number | null {
  if (!med?.aceita_cartao_beneficios) return null;
  if (med.cb_tipo_repasse === "valor") return valorCelulaRepasse(med.cb_valor_repasse);
  if (med.cb_tipo_repasse === "percentual") {
    const pct = valorCelulaRepasse(med.cb_percentual_repasse);
    return pct == null ? null : +((base * pct) / 100).toFixed(2);
  }
  return null;
}

/** Lê a coluna pedida da linha do serviço. `null` = coluna em branco. */
function repasseDaColuna(
  linha: RepasseConvenio | null | undefined,
  coluna: FormaRepasse,
  base: number,
): { repasse: number; inflaTotal: boolean } | null {
  if (!linha) return null;
  if (coluna === "cartao_consulta") {
    const v = valorCelulaRepasse(linha.cartao_consulta_valor);
    return v == null ? null : { repasse: v, inflaTotal: false };
  }
  if (coluna === "cartao_desconto") {
    const v = valorCelulaRepasse(linha.cartao_desconto_valor);
    return v == null ? null : { repasse: v, inflaTotal: false };
  }
  const tipo = coluna === "convenio" ? linha.convenio_tipo_repasse : linha.tipo_repasse;
  const valor = valorCelulaRepasse(coluna === "convenio" ? linha.convenio_valor : linha.valor);
  const pct = valorCelulaRepasse(
    coluna === "convenio" ? linha.convenio_percentual : linha.percentual,
  );
  if (tipo === "valor" && valor != null) return { repasse: valor, inflaTotal: true };
  if (tipo === "percentual" && pct != null) {
    return { repasse: +((base * pct) / 100).toFixed(2), inflaTotal: false };
  }
  return null;
}

/**
 * Herança do repasse, do mais específico para o mais geral:
 *
 * 1. coluna da forma de pagamento na linha do serviço (Cartão Consulta /
 *    Cartão Desconto / Convênio / Particular);
 * 2. para atendimento de convênio, a coluna Convênio da mesma linha;
 * 3. o repasse de cartão benefício cadastrado no médico;
 * 4. o Repasse Padrão do médico.
 *
 * Uma coluna em branco (vazia, nula ou "padrão") NÃO zera nada: só passa a vez
 * para o próximo degrau. O repasse só fica zerado quando alguém gravou o
 * número 0 de propósito.
 */
export function resolverRepasse(params: {
  linha?: RepasseConvenio | null;
  med?: RepasseMedico | null;
  base: number;
  forma: FormaRepasse;
}): { total: number; repasse: number; terceiro: RepasseTerceiro | null } {
  const bruto = resolverRepasseExecutante(params);
  return { ...bruto, terceiro: repasseDoTerceiro(params.linha, bruto.total) };
}

/**
 * REPASSE TRIPLO — parte do médico terceiro (dono do equipamento).
 *
 * É sempre um percentual do VALOR TOTAL do atendimento, igual ao percentual do
 * executante: numa regra de 30% clínica / 40% executante / 30% terceiro os três
 * pedaços somam o total. Devolve `null` quando a linha não tem terceiro
 * configurado ou quando o percentual é zero.
 */
export function repasseDoTerceiro(
  linha: RepasseConvenio | null | undefined,
  total: number,
): RepasseTerceiro | null {
  if (!linha?.terceiro_id) return null;
  const pct = valorCelulaRepasse(linha.percentual_terceiro);
  if (pct == null || pct <= 0) return null;
  return {
    medico_id: linha.terceiro_id,
    percentual: pct,
    valor: +((total * pct) / 100).toFixed(2),
  };
}

function resolverRepasseExecutante(params: {
  linha?: RepasseConvenio | null;
  med?: RepasseMedico | null;
  base: number;
  forma: FormaRepasse;
}): { total: number; repasse: number } {
  const { linha, med, base, forma } = params;
  const colunas: FormaRepasse[] =
    forma === "cartao_consulta"
      ? ["cartao_consulta", "convenio"]
      : forma === "cartao_desconto"
        ? ["cartao_desconto", "convenio"]
        : forma === "convenio"
          ? ["convenio"]
          : ["particular"];
  for (const coluna of colunas) {
    const cel = repasseDaColuna(linha, coluna, base);
    if (cel) {
      return {
        total: cel.inflaTotal ? Math.max(base, cel.repasse) : base,
        repasse: cel.repasse,
      };
    }
  }
  // Cartão benefício do médico. Também vale para atendimento sem pagamento
  // registrado, que historicamente era tratado como cartão consulta.
  if (forma !== "particular" || base === 0) {
    const cb = repasseCartaoBeneficios(med, base);
    if (cb != null) return { total: base, repasse: cb };
  }
  return { total: base, repasse: repassePadraoDoMedico(med, base) };
}

export const procVariants = (nome: string): string[] => {
  const base = normRepasse(nome);
  const out = new Set<string>([base]);
  let cur = base;
  for (let i = 0; i < 3; i++) {
    const m = cur.match(/^(.*)\s*\([^()]*\)\s*$/);
    if (!m) break;
    cur = m[1].trim();
    if (cur) out.add(cur);
  }
  const semParens = base
    .replace(/\s*\([^()]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (semParens) out.add(semParens);
  return Array.from(out).filter(Boolean);
};

export const isCartaoConsultaDesc = (desc: string | null | undefined): boolean => {
  if (!desc) return false;
  const d = desc.toUpperCase();
  if (d.includes("ADESAO") || d.includes("ADESÃO")) return false;
  return (
    d.includes("CARTAO CONSULTA") ||
    d.includes("CARTÃO CONSULTA") ||
    d.includes("CONSULTA CARTAO") ||
    d.includes("CONSULTA CARTÃO")
  );
};

export function calcRepasseFull(
  ctx: RepasseCtx,
  medicoId: string | null,
  totalPago: number,
  procNome: string | null,
  descricao?: string | null,
  /**
   * Modalidade do convênio vinda do CADASTRO (contrato ativo do paciente ou
   * campo gravado no lançamento). Quando informada, tem prioridade sobre a
   * leitura do texto da descrição, que fica só como fallback histórico.
   */
  modalidade?: "cartao_consulta" | "cartao_desconto" | null,
): { total: number; repasse: number; terceiro: RepasseTerceiro | null } {
  if (!medicoId) return { total: totalPago, repasse: 0, terceiro: null };
  const med = ctx.medicos.find((m) => m.id === medicoId) ?? null;
  return resolverRepasse({
    linha: findConvenioRow(ctx, medicoId, procNome),
    med,
    base: totalPago,
    forma: formaDoAtendimento(descricao, modalidade),
  });
}

/** Descobre qual coluna da grade vale para este atendimento. */
export function formaDoAtendimento(
  descricao?: string | null,
  modalidade?: "cartao_consulta" | "cartao_desconto" | null,
): FormaRepasse {
  if (modalidade === "cartao_consulta") return "cartao_consulta";
  if (modalidade === "cartao_desconto") return "cartao_desconto";
  if (modalidade == null && isCartaoConsultaDesc(descricao)) return "cartao_consulta";
  if (modalidade == null && isCartaoDescontoDesc(descricao)) return "cartao_desconto";
  return "particular";
}
