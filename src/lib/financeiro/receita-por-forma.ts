/**
 * Composição da receita por forma de pagamento — o mini-detalhamento que
 * aparece embaixo do total no card de "Receita bruta" e nos fechamentos
 * impressos.
 *
 * Por que existe
 * -------------
 * O card mostrava só o total do período. Para saber quanto daquilo passou na
 * maquininha, quanto entrou em PIX e quanto era dinheiro na gaveta, era
 * preciso exportar o relatório ou abrir o Movimento de Caixa em outra aba —
 * exatamente a conferência que a recepção faz todo dia. As quatro linhas
 * ficam agora debaixo do valor.
 *
 * O que é garantido
 * -----------------
 * A soma das fatias é igual ao total exibido. Cada atendimento já chega com
 * sua receita repartida (`RateioLinha.formas`, montada por `repartirPorForma`),
 * inclusive quando o pagamento foi misto; aqui só se somam as partes por
 * balde. Nenhum centavo é descartado: baldes fora dos quatro principais —
 * "Parcelas do sistema antigo", "Convênio / Gratuidade", "Sem informação" —
 * aparecem em linha própria quando têm valor, em vez de sumirem e deixarem o
 * detalhamento sem fechar com o total.
 *
 * Débito e crédito são baldes independentes, pela mesma razão de
 * `@/lib/financeiro/formas-pagamento`: é assim que a recepção confere contra o
 * comprovante da maquininha.
 */
import {
  FORMAS_SEMPRE_VISIVEIS,
  LABEL_FORMA,
  ORDEM_FORMAS,
  type FormaCanonica,
  type ParteMisto,
} from "@/lib/financeiro/formas-pagamento";

/** Uma linha do mini-detalhamento. */
export interface FatiaDaReceita {
  forma: FormaCanonica;
  /** Rótulo exibido ("Cartão de Crédito", "PIX"…). */
  rotulo: string;
  valor: number;
  /** Fatia do total, em %. Zero quando não houve receita no período. */
  percentual: number;
}

/**
 * Cor do pontinho ao lado de cada forma.
 *
 * Só as quatro formas do dia a dia — dinheiro, PIX, débito e crédito — têm cor
 * própria; elas são as que a recepção procura de relance. O passo 600 do
 * Tailwind foi escolhido porque a paleta inteira passa nas checagens de
 * daltonismo e de contraste contra o fundo branco do card (o passo 500
 * reprovava: verde e ciano ficavam indistinguíveis, e nenhuma das quatro
 * alcançava 3:1 de contraste).
 *
 * Os baldes de exceção ficam todos no mesmo cinza de propósito: são raros,
 * aparecem só quando têm valor, e inventar uma sétima ou oitava cor faria a
 * lista parecer um gráfico. Quem identifica essas linhas é o rótulo escrito ao
 * lado — que, aliás, é o que identifica TODAS as linhas: a cor é reforço, e
 * nunca a única pista, para o detalhamento continuar legível em impressão
 * preto e branco e para quem não distingue as cores.
 */
export const COR_FORMA: Record<FormaCanonica, string> = {
  dinheiro: "bg-emerald-600",
  pix: "bg-violet-600",
  debito: "bg-sky-600",
  credito: "bg-amber-600",
  legado_cartao: "bg-slate-400",
  pago_sistema_anterior: "bg-slate-400",
  boleto: "bg-slate-400",
  transferencia: "bg-slate-400",
  convenio: "bg-slate-400",
  misto: "bg-slate-400",
  outros: "bg-slate-400",
  sem_informacao: "bg-slate-400",
};

const round2 = (v: number) => +v.toFixed(2);

/** O mínimo que uma linha precisa ter para entrar na conta. */
export type LinhaComFormas = { formas: ParteMisto[] };

/**
 * Soma a receita por forma de pagamento.
 *
 * As quatro formas do dia a dia saem sempre, mesmo zeradas — "Cartão de
 * Crédito R$ 0,00" é informação: significa que nada passou no crédito naquele
 * período, e é diferente de a linha não existir. As demais só aparecem quando
 * têm valor. A ordem é a mesma do Fechamento de Caixa.
 */
export function receitaPorForma(linhas: LinhaComFormas[]): FatiaDaReceita[] {
  const soma = new Map<FormaCanonica, number>();
  for (const l of linhas) {
    for (const p of l.formas ?? []) {
      soma.set(p.forma, (soma.get(p.forma) ?? 0) + p.valor);
    }
  }
  const total = round2(Array.from(soma.values()).reduce((s, v) => s + v, 0));
  const saida: FatiaDaReceita[] = [];
  for (const forma of ORDEM_FORMAS) {
    const valor = round2(soma.get(forma) ?? 0);
    if (valor === 0 && !FORMAS_SEMPRE_VISIVEIS.includes(forma)) continue;
    saida.push({
      forma,
      rotulo: LABEL_FORMA[forma],
      valor,
      percentual: total === 0 ? 0 : round2((valor / total) * 100),
    });
  }
  return saida;
}

/** Total do detalhamento — deve bater com a receita bruta do período. */
export const totalDasFatias = (fatias: FatiaDaReceita[]): number =>
  round2(fatias.reduce((s, f) => s + f.valor, 0));
