/**
 * Lançamento retroativo no Movimento de Caixa: o que é dinheiro do dia e o
 * que é ajuste vindo de outro dia.
 *
 * A tela "Movimento de Caixa" lista `fin_lancamentos` pela COMPETÊNCIA
 * (`fin_lancamentos.data`), que é o dia do atendimento. A gaveta da recepção é
 * outra coisa: é a sessão de `caixa_sessoes` em que o dinheiro realmente
 * entrou. Misturar as duas é o que distorce o fechamento — a recepção abre o
 * Movimento de um dia, soma, e o total não bate com o cupom impresso daquele
 * dia, porque tem lá dentro um valor que aquele cupom nunca viu.
 *
 * A pergunta que decide tudo é uma só: **este valor está no cupom impresso
 * daquele dia?** E ela tem duas partes, porque não basta o dinheiro ter caído
 * numa sessão com a data certa:
 *
 *   * `fn_registrar_lancamento_e_caixa` só manda o movimento para a sessão do
 *     dia do atendimento quando ela ainda está ABERTA. Aí o valor entra antes
 *     do cupom ser impresso e faz parte dele de direito.
 *   * Antes da correção de 22/08/2026, porém, a função empurrava o movimento
 *     para dentro de sessões JÁ FECHADAS, e chegava a criar sessões que
 *     nasciam fechadas. Esses movimentos têm a data da sessão certa e mesmo
 *     assim não estão em cupom nenhum: foram digitados depois que a atendente
 *     contou a gaveta e imprimiu. São 98 movimentos entre julho e 24/08/2026.
 *
 * Por isso a comprovação exige as duas coisas: sessão do dia da competência E
 * lançamento digitado antes do fechamento daquela sessão.
 *
 * Nada aqui altera valor, competência ou movimento de caixa. É classificação
 * de leitura, para a tela saber o que somar como caixa da recepção e o que
 * mostrar separado como ajuste gerencial.
 */
import { dataClinicaDe } from "@/lib/date-utils";

/**
 * Tipos de movimento de caixa que efetivamente colocam (ou tiram) dinheiro da
 * gaveta e, portanto, podem provar que o valor pertence àquele dia.
 *
 * `registro` fica DE FORA de propósito: é a linha de histórico da guia já
 * quitada em outro dia, que aparece no extrato mas pesa R$ 0,00 em
 * `SINAL_NO_SALDO`. Se entrasse aqui, uma guia cujo dinheiro entrou lá atrás
 * passaria por dinheiro do dia. `estorno` também fica de fora: ele desfaz um
 * recebimento, não comprova um.
 */
export const TIPOS_QUE_PESAM_NA_GAVETA = ["recebimento", "despesa"] as const;

/** Linha do Movimento de Caixa que precisa ser classificada. */
export interface LinhaClassificavel {
  /** Competência (YYYY-MM-DD): o dia a que a receita/despesa pertence. */
  data: string;
  /** `created_at` do lançamento — o dia e a hora em que alguém digitou. */
  created_at?: string | null;
  /** "caixa" = sangria/suprimento lido direto de `caixa_movimentos`. */
  origem?: "fin" | "caixa";
}

/** A gaveta em que o dinheiro de um lançamento efetivamente entrou. */
export interface GavetaDoLancamento {
  /** Dia (YYYY-MM-DD) da sessão de caixa, pela abertura dela. */
  dia: string;
  /** Quando aquela sessão foi fechada e conferida; null = ainda aberta. */
  fechadaEm: string | null;
}

/**
 * Índice lancamento_id → gaveta em que o dinheiro daquele lançamento entrou.
 *
 * O dia vem da SESSÃO, não do `created_at` do movimento: quando o movimento é
 * lançado numa sessão retroativa ainda aberta, a RPC carimba o horário dele
 * como meio-dia daquele dia, e usar esse carimbo seria circular.
 */
export function mapaDaGaveta(
  movs: Array<{ lancamento_id?: string | null; tipo: string; sessao_id: string }>,
  sessoes: Array<{ id: string; aberto_em: string; fechado_em?: string | null }>,
): Map<string, GavetaDoLancamento> {
  const porSessao = new Map<string, GavetaDoLancamento>();
  for (const s of sessoes) {
    const dia = dataClinicaDe(s.aberto_em);
    if (dia) porSessao.set(s.id, { dia, fechadaEm: s.fechado_em ?? null });
  }
  const mapa = new Map<string, GavetaDoLancamento>();
  for (const m of movs) {
    if (!m.lancamento_id) continue;
    if (!(TIPOS_QUE_PESAM_NA_GAVETA as readonly string[]).includes(m.tipo)) continue;
    const g = porSessao.get(m.sessao_id);
    if (g) mapa.set(m.lancamento_id, g);
  }
  return mapa;
}

/**
 * Esta linha é um ajuste retroativo — competência de um dia, digitação de
 * outro, sem dinheiro no cupom daquele dia?
 *
 * São duas condições, e as duas precisam valer:
 *
 *   1. A competência é ANTERIOR ao dia em que a linha foi digitada. Um
 *      lançamento manual feito no próprio dia é movimento normal, mesmo sem
 *      movimento de caixa nenhum (despesa paga pelo banco, por exemplo) — por
 *      isso a ausência de gaveta, sozinha, nunca classifica como retroativo.
 *   2. O dinheiro NÃO entrou na gaveta daquele mesmo dia enquanto ela ainda
 *      estava aberta. Movimento empurrado para dentro de uma sessão já
 *      fechada não está no cupom que a atendente imprimiu, mesmo tendo a data
 *      certa gravada.
 *
 * Uma sessão que segue ABERTA conta como dinheiro do dia mesmo quando a
 * digitação foi dias depois: o cupom dela ainda não existe e vai sair com esse
 * valor dentro. É o caso do caixa que a recepção deixa aberto de um dia para o
 * outro, e a tela precisa continuar batendo com o cupom que será impresso.
 *
 * Sangria e suprimento (`origem: "caixa"`) nunca são retroativos: são o
 * próprio dinheiro físico se mexendo, sempre no dia em que aconteceram.
 */
export function ehLancamentoRetroativo(
  l: LinhaClassificavel,
  gaveta: GavetaDoLancamento | null,
): boolean {
  if (l.origem === "caixa") return false;
  const digitadoEm = dataClinicaDe(l.created_at);
  if (!digitadoEm || !l.data) return false;
  if (l.data >= digitadoEm) return false;
  return !estaNoCupomDoDia(l, gaveta);
}

/** O valor entrou na gaveta daquele dia a tempo de sair no cupom dele? */
function estaNoCupomDoDia(l: LinhaClassificavel, gaveta: GavetaDoLancamento | null): boolean {
  if (!gaveta) return false;
  if (gaveta.dia !== l.data) return false;
  if (gaveta.fechadaEm === null) return true;
  if (!l.created_at) return false;
  return new Date(l.created_at).getTime() <= new Date(gaveta.fechadaEm).getTime();
}

export interface TotaisRetroativos {
  /** Receitas retroativas somadas. */
  receitas: number;
  /** Despesas retroativas somadas. */
  despesas: number;
  /** Receitas − despesas: o quanto o caixa do dia deixa de ser inflado. */
  saldo: number;
  quantidade: number;
  /** Dias de competência atingidos (YYYY-MM-DD), do mais antigo ao mais novo. */
  dias: string[];
}

/** Quanto do período exibido é ajuste retroativo, separado por tipo. */
export function totaisRetroativos(
  linhas: Array<{ tipo: string; valor: number | string | null | undefined; data: string }>,
): TotaisRetroativos {
  let receitas = 0;
  let despesas = 0;
  const dias = new Set<string>();
  for (const l of linhas) {
    const v = Number(l.valor) || 0;
    if (l.tipo === "receita") receitas += v;
    else if (l.tipo === "despesa") despesas += v;
    if (l.data) dias.add(l.data);
  }
  receitas = Number(receitas.toFixed(2));
  despesas = Number(despesas.toFixed(2));
  return {
    receitas,
    despesas,
    saldo: Number((receitas - despesas).toFixed(2)),
    quantidade: linhas.length,
    dias: Array.from(dias).sort(),
  };
}

/** "19/08/2026" a partir de "2026-08-19", para exibição. */
export function diaBR(iso: string): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}
