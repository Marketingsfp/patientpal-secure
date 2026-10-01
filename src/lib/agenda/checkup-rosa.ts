/**
 * Pacotes "CHECKUP ROSA" — preço fechado para um conjunto de atendimentos da
 * mesma paciente, cobrados juntos pela cobrança agrupada da Agenda
 * ("Cobrar selecionados").
 *
 * Os atendimentos continuam sendo agendados um a um, cada um na agenda do
 * profissional que executa (ginecologista, ultrassom, mamografia). O pacote só
 * decide QUANTO cada um custa quando cobrados juntos:
 *
 *   - o PREVENTIVO sai a R$ 0,00 dentro de qualquer pacote. A clínica assume o
 *     custo: a ginecologista e o DU PREVENTIVO continuam recebendo o repasse
 *     normal (decisão do dono em 01/10/2026). O lançamento de R$ 0,00 segue
 *     pelo caminho já existente de "atendimento sem dinheiro no caixa", que
 *     calcula o repasse sobre a tabela — ver `repasseDoTerceiro`.
 *   - no COMPLETO a mamografia sai com desconto. O desconto sai só da parte da
 *     clínica: o repasse do prestador da mamografia é valor fixo e não muda.
 *
 * Os preços são os da tabela da campanha e valem para todas as unidades, mesmo
 * onde o cadastro do serviço tem outro preço (a mamografia de uma unidade está
 * a R$ 147 / R$ 175 no cadastro).
 *
 * Dinheiro = coluna "D" da tabela; Pix, débito e crédito = coluna "C" (mesma
 * regra do cadastro de serviços: pix = débito = crédito).
 */

export type ItemCheckupRosa =
  | "consulta"
  | "preventivo"
  | "transvaginal"
  | "usg_mama"
  | "mamografia";

/**
 * Período da campanha (Outubro Rosa de 2026), em dias da clínica (Brasília).
 * Fora dele nada do Checkup Rosa aparece — botão, tabela, avisos e o
 * "Aplicar pacote" — e a cobrança volta ao preço normal. Na cobrança e nos
 * avisos vale a DATA DO ATENDIMENTO; no botão da barra, o dia de hoje.
 * Para repetir a campanha em outro ano, basta trocar as duas datas.
 */
export const VIGENCIA_CHECKUP_ROSA = { inicio: "2026-10-01", fim: "2026-10-31" } as const;

/** `dia` no formato AAAA-MM-DD (ou data e hora, que é cortada no dia). */
export function checkupRosaVigente(dia: string | null | undefined): boolean {
  const d = (dia ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d >= VIGENCIA_CHECKUP_ROSA.inicio && d <= VIGENCIA_CHECKUP_ROSA.fim;
}

/** Nome curto de cada item, para listar o conteúdo dos pacotes na tela. */
export const NOME_ITEM_CHECKUP_ROSA: Record<ItemCheckupRosa, string> = {
  consulta: "Consulta",
  preventivo: "Preventivo (grátis)",
  transvaginal: "USG Transvaginal",
  usg_mama: "USG Mamas",
  mamografia: "Mamografia",
};

export interface PrecoItemPacote {
  dinheiro: number;
  cartao: number;
}

export interface PacoteCheckupRosa {
  id: "basico" | "prevencao" | "essencial" | "completo";
  nome: string;
  itens: Partial<Record<ItemCheckupRosa, PrecoItemPacote>>;
}

const CONSULTA: PrecoItemPacote = { dinheiro: 120, cartao: 145 };
const PREVENTIVO_GRATUITO: PrecoItemPacote = { dinheiro: 0, cartao: 0 };
const TRANSVAGINAL: PrecoItemPacote = { dinheiro: 102, cartao: 120 };
const USG_MAMA: PrecoItemPacote = { dinheiro: 114, cartao: 135 };
const MAMOGRAFIA: PrecoItemPacote = { dinheiro: 137, cartao: 165 };

/**
 * Preço de cada item como a tabela da campanha mostra, ANTES do desconto do
 * Completo. Serve só para a "colinha" na tela (linhas da tabela e total
 * cheio); o que se cobra é o preço de cada pacote em `PACOTES_CHECKUP_ROSA`.
 */
export const PRECO_TABELA_CHECKUP_ROSA: Record<ItemCheckupRosa, PrecoItemPacote> = {
  consulta: CONSULTA,
  preventivo: PREVENTIVO_GRATUITO,
  transvaginal: TRANSVAGINAL,
  usg_mama: USG_MAMA,
  mamografia: MAMOGRAFIA,
};

export const PACOTES_CHECKUP_ROSA: PacoteCheckupRosa[] = [
  {
    id: "basico",
    nome: "CHECKUP ROSA BÁSICO",
    itens: { consulta: CONSULTA, preventivo: PREVENTIVO_GRATUITO, transvaginal: TRANSVAGINAL },
  },
  {
    id: "prevencao",
    nome: "CHECKUP ROSA PREVENÇÃO",
    itens: { consulta: CONSULTA, preventivo: PREVENTIVO_GRATUITO, mamografia: MAMOGRAFIA },
  },
  {
    id: "essencial",
    nome: "CHECKUP ROSA ESSENCIAL",
    itens: {
      consulta: CONSULTA,
      preventivo: PREVENTIVO_GRATUITO,
      usg_mama: USG_MAMA,
      mamografia: MAMOGRAFIA,
    },
  },
  {
    // Total promocional da tabela: R$ 463,00 (D) / R$ 543,00 (C). O desconto
    // fica todo na mamografia: R$ 10,00 no dinheiro e R$ 22,00 no cartão —
    // a tabela fala em R$ 20,50, mas é o total de R$ 543,00 que vale.
    id: "completo",
    nome: "CHECKUP ROSA COMPLETO",
    itens: {
      consulta: CONSULTA,
      preventivo: PREVENTIVO_GRATUITO,
      transvaginal: TRANSVAGINAL,
      usg_mama: USG_MAMA,
      mamografia: { dinheiro: 127, cartao: 143 },
    },
  },
];

/** Maiúsculas, sem acento, sem o sufixo entre parênteses e sem espaço duplo. */
function nomeBase(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s*\([^()]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semAcento(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

const NOMES_TRANSVAGINAL = new Set([
  "USG TRANSVAGINAL",
  "ULTRASSONOGRAFIA TRANSVAGINAL",
  "TRANSVAGINAL",
]);
const NOMES_USG_MAMA = new Set([
  "USG MAMA",
  "USG MAMAS",
  "USG DE MAMA",
  "USG DE MAMAS",
  "ULTRASSONOGRAFIA DE MAMA",
  "ULTRASSONOGRAFIA DE MAMAS",
  "ULTRASSONOGRAFIA MAMARIA",
]);
const NOMES_MAMOGRAFIA = new Set(["MAMOGRAFIA", "MAMOGRAFIA BILATERAL"]);

/**
 * Qual item do pacote é este atendimento — ou `null` quando não faz parte de
 * nenhum. A consulta precisa ser de ginecologia (pelo nome do serviço ou pela
 * especialidade do profissional): "CONSULTA" sozinho é o nome usado por quase
 * todas as especialidades. "PREVENTIVO DE FORA" e "PREVENTIVO EXTERNO" não
 * entram: são coleta de laboratório, não o preventivo da ginecologista.
 */
export function itemCheckupRosa(
  procedimento: string | null | undefined,
  especialidadeMedico?: string | null,
): ItemCheckupRosa | null {
  const bruto = (procedimento ?? "").trim();
  if (!bruto) return null;
  const base = nomeBase(bruto);
  if (base === "PREVENTIVO") return "preventivo";
  if (NOMES_TRANSVAGINAL.has(base)) return "transvaginal";
  if (NOMES_USG_MAMA.has(base)) return "usg_mama";
  if (NOMES_MAMOGRAFIA.has(base)) return "mamografia";
  if (base === "CONSULTA") {
    const ginecologia =
      semAcento(bruto).includes("GINECO") || semAcento(especialidadeMedico).includes("GINECO");
    return ginecologia ? "consulta" : null;
  }
  return null;
}

export interface AtendimentoParaPacote {
  id: string;
  procedimento: string | null;
  especialidade?: string | null;
  /** Dia do atendimento (AAAA-MM-DD, horário de Brasília) — tem de cair na campanha. */
  dia: string | null;
}

export interface PacoteAplicado {
  pacote: PacoteCheckupRosa;
  /** Preço de cada atendimento selecionado dentro do pacote, por id. */
  precoPorAtendimento: Record<string, PrecoItemPacote>;
  totalDinheiro: number;
  totalCartao: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Procura o pacote que corresponde EXATAMENTE aos atendimentos selecionados:
 * cada um precisa ser um item de pacote, sem repetição, e o conjunto tem que
 * ser o de um dos quatro pacotes. Qualquer atendimento a mais ou a menos
 * devolve `null` — o pacote é um preço fechado, não um desconto por item.
 */
export function detectarCheckupRosa(atendimentos: AtendimentoParaPacote[]): PacoteAplicado | null {
  if (atendimentos.length < 2) return null;
  // Campanha encerrada (ou ainda não começou) para qualquer um deles: preço normal.
  if (!atendimentos.every((a) => checkupRosaVigente(a.dia))) return null;
  const porItem = new Map<ItemCheckupRosa, string>();
  for (const a of atendimentos) {
    const item = itemCheckupRosa(a.procedimento, a.especialidade);
    if (!item || porItem.has(item)) return null;
    porItem.set(item, a.id);
  }
  for (const pacote of PACOTES_CHECKUP_ROSA) {
    const itensPacote = Object.keys(pacote.itens) as ItemCheckupRosa[];
    if (itensPacote.length !== porItem.size) continue;
    if (!itensPacote.every((i) => porItem.has(i))) continue;
    const precoPorAtendimento: Record<string, PrecoItemPacote> = {};
    let totalDinheiro = 0;
    let totalCartao = 0;
    for (const item of itensPacote) {
      const preco = pacote.itens[item]!;
      precoPorAtendimento[porItem.get(item)!] = preco;
      totalDinheiro += preco.dinheiro;
      totalCartao += preco.cartao;
    }
    return {
      pacote,
      precoPorAtendimento,
      totalDinheiro: round2(totalDinheiro),
      totalCartao: round2(totalCartao),
    };
  }
  return null;
}

/**
 * Divide o valor pago entre os atendimentos do pacote.
 *
 * Quando o total pago é exatamente o do pacote em dinheiro ou em cartão, cada
 * atendimento recebe o preço da sua coluna — o preventivo fica em R$ 0,00 e a
 * mamografia do Completo com o desconto. Qualquer outro total (pagamento em
 * mais de uma forma, desconto manual por cima) cai na proporção dos preços de
 * cartão, e o centavo do arredondamento vai para o primeiro atendimento.
 */
export function ratearPacote(aplicado: PacoteAplicado, ids: string[], valorPago: number): number[] {
  const total = round2(valorPago);
  const coluna: keyof PrecoItemPacote | null =
    Math.abs(total - aplicado.totalDinheiro) < 0.005
      ? "dinheiro"
      : Math.abs(total - aplicado.totalCartao) < 0.005
        ? "cartao"
        : null;
  const valores = coluna
    ? ids.map((id) => aplicado.precoPorAtendimento[id]?.[coluna] ?? 0)
    : ids.map((id) =>
        aplicado.totalCartao > 0
          ? round2(((aplicado.precoPorAtendimento[id]?.cartao ?? 0) / aplicado.totalCartao) * total)
          : 0,
      );
  const diff = round2(total - valores.reduce((s, v) => s + v, 0));
  if (valores.length > 0) valores[0] = round2(valores[0] + diff);
  return valores;
}
