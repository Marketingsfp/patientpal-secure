/**
 * Cálculo dos valores exibidos na Tabela de Valores (consulta de balcão).
 *
 * A recepção precisa informar preço ao paciente sem simular agendamento nem
 * abrir ordem de serviço. Esta tela é SÓ LEITURA e não grava nada — mas o
 * número que ela mostra tem que ser o mesmo que o caixa vai cobrar, senão a
 * atendente promete um valor e a cobrança sai outro.
 *
 * Por isso a régua aqui repete, na mesma ordem, a do atendimento real
 * (`src/lib/convenio/info-convenio-paciente.ts`):
 *
 *   1. Regra de preço do convênio (aba "Regras de Preço" do Cartão
 *      Benefícios), escolhida pela mesma pontuação de especificidade do
 *      `findRegra` — serviço específico > especialidade > tipo > genérica, e
 *      gratuidade vencendo desconto no mesmo nível.
 *   2. Na falta de regra, o valor digitado à mão na aba "Convênios" do
 *      cadastro do serviço (`procedimento_cb_convenio_valores`, origem
 *      'manual'), com a mesma trava de segurança: o convênio NUNCA encarece
 *      a conta em relação ao particular.
 *   3. Sem nenhum dos dois, o valor particular cheio.
 *
 * O que esta tela NÃO consegue saber, porque depende do paciente concreto
 * (contrato em dia, mensalidades pagas, quantas vezes o benefício já foi
 * usado no período), vira AVISO em texto na linha em vez de virar preço —
 * carência e limite de uso aparecem como observação para a atendente
 * mencionar no balcão.
 */

import { findRegra, computeValor, type CbRegra } from "@/lib/cb-regras";
import {
  primeiroValorValido,
  valorCartaoProcedimento,
} from "@/lib/convenio/info-convenio-paciente";

/** Serviço do catálogo, com os campos de valor que a tabela precisa ler. */
export interface ServicoTabela {
  id: string;
  nome: string;
  codigo: string | null;
  grupo: string | null;
  tipo: string;
  duracao_minutos: number;
  preparo: string | null;
  valor_variavel: boolean;
  valor_padrao: number;
  valor_dinheiro: number;
  valor_dinheiro_pix: number;
  valor_pix: number;
  valor_cartao: number;
  valor_cartao_credito: number;
  valor_cartao_debito: number;
}

/** Linha digitada à mão na aba "Convênios" do cadastro do serviço. */
export interface ValorManualConvenio {
  valor_dinheiro: number;
  valor_outros: number;
}

/** De onde saiu o preço mostrado — usado como legenda na tela. */
export type OrigemValor = "particular" | "regra" | "tabela-convenio";

export interface LinhaValor {
  /** Valor à vista em dinheiro. */
  dinheiro: number;
  /** Valor em PIX, débito ou crédito. */
  outros: number;
  /** Cortesia do convênio: sai R$ 0,00 para o paciente. */
  gratuito: boolean;
  origem: OrigemValor;
  /**
   * Condições que dependem do paciente e que a tela não tem como conferir
   * (carência, limite de uso). Texto pronto para a atendente ler em voz alta.
   */
  avisos: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Valores particulares de referência (dinheiro / PIX·débito·crédito). */
export function baseParticular(s: ServicoTabela): { dinheiro: number; outros: number } {
  const dinheiro = primeiroValorValido(s.valor_dinheiro, s.valor_dinheiro_pix, s.valor_padrao);
  const outros = valorCartaoProcedimento(s);
  return { dinheiro: round2(dinheiro), outros: round2(outros || dinheiro) };
}

export function calcularParticular(s: ServicoTabela): LinhaValor {
  const base = baseParticular(s);
  return {
    dinheiro: base.dinheiro,
    outros: base.outros,
    gratuito: false,
    origem: "particular",
    avisos: [],
  };
}

/**
 * Mesma pontuação do `findRegra` (src/lib/cb-regras.ts). Repetida aqui porque
 * a tabela testa VÁRIAS especialidades do mesmo serviço e precisa comparar as
 * regras vencedoras de cada tentativa entre si.
 */
const scoreRegra = (r: CbRegra) =>
  (r.procedimento_id ? 1000 : 0) +
  (r.especialidade_id ? 100 : 0) +
  (r.tipo ? 50 : 0) +
  (r.gratuito ? 10 : 0) +
  (Number(r.prioridade) || 0) * 0.001;

/**
 * Escolhe a regra do convênio que vale para o serviço.
 *
 * Sem paciente e sem médico escolhidos, as especialidades candidatas são as
 * do próprio serviço mais a busca genérica (`null`) — exatamente as mesmas
 * que o atendimento tentaria quando o médico não acrescenta nenhuma.
 */
export function escolherRegraServico(
  regras: CbRegra[],
  especialidadesDoServico: string[],
  tipo: string | null,
  procedimentoId: string,
): CbRegra | null {
  const candidatas: (string | null)[] = [...especialidadesDoServico, null];
  let melhor: CbRegra | null = null;
  for (const espId of candidatas) {
    const r = findRegra(regras, espId, tipo, procedimentoId);
    if (r && (!melhor || scoreRegra(r) > scoreRegra(melhor))) melhor = r;
  }
  return melhor;
}

const PERIODO_LABEL: Record<string, string> = {
  dia: "por dia",
  semana: "por semana",
  mes: "por mês",
  ano: "por ano",
  contrato: "por contrato (uma vez só)",
};

function avisosDaRegra(r: CbRegra): string[] {
  const avisos: string[] = [];
  const carencia = Number(r.carencia_mensalidades ?? 0) || 0;
  if (carencia > 0) {
    avisos.push(
      `Só a partir da ${carencia}ª mensalidade paga — antes disso o paciente paga o particular.`,
    );
  }
  const qtd = Number(r.limite_qtd ?? 0) || 0;
  if (qtd > 0) {
    const periodo = PERIODO_LABEL[String(r.limite_periodo ?? "dia")] ?? "por dia";
    avisos.push(`Limite de ${qtd}x ${periodo}; passando disso volta ao particular.`);
  }
  return avisos;
}

export interface EntradaConvenio {
  servico: ServicoTabela;
  /** Regras ATIVAS do convênio escolhido (já filtradas por convenio_id). */
  regras: CbRegra[];
  /** Especialidades vinculadas ao serviço no cadastro. */
  especialidadesDoServico: string[];
  /** Linha 'manual' de `procedimento_cb_convenio_valores`, se houver. */
  valorManual: ValorManualConvenio | null;
}

/** Valor do serviço para um convênio do Cartão Benefícios. */
export function calcularConvenio({
  servico,
  regras,
  especialidadesDoServico,
  valorManual,
}: EntradaConvenio): LinhaValor {
  const base = baseParticular(servico);
  const regra = escolherRegraServico(regras, especialidadesDoServico, servico.tipo, servico.id);

  if (regra) {
    if (regra.gratuito) {
      return {
        dinheiro: 0,
        outros: 0,
        gratuito: true,
        origem: "regra",
        avisos: avisosDaRegra(regra),
      };
    }
    const v = computeValor(regra, base.dinheiro, base.outros);
    if (v) {
      return {
        dinheiro: round2(v.dinheiro),
        outros: round2(v.outros),
        gratuito: false,
        origem: "regra",
        avisos: avisosDaRegra(regra),
      };
    }
  }

  // Reserva: preço digitado à mão na aba "Convênios" do cadastro do serviço.
  const vDin = Number(valorManual?.valor_dinheiro) || 0;
  const vOut = Number(valorManual?.valor_outros) || 0;
  if (vDin > 0 || vOut > 0) {
    // Trava: parte dessas linhas antigas está ACIMA do particular de hoje. O
    // convênio nunca pode sair mais caro, então a forma afetada volta ao
    // particular — igual ao atendimento real.
    const candDin = vDin > 0 ? vDin : vOut;
    const candOut = vOut > 0 ? vOut : vDin;
    const finalDin = base.dinheiro > 0 && candDin > base.dinheiro ? base.dinheiro : candDin;
    const finalOut = base.outros > 0 && candOut > base.outros ? base.outros : candOut;
    const houveDesconto =
      (base.dinheiro > 0 && finalDin < base.dinheiro) ||
      (base.outros > 0 && finalOut < base.outros);
    if (houveDesconto) {
      return {
        dinheiro: round2(finalDin),
        outros: round2(finalOut),
        gratuito: false,
        origem: "tabela-convenio",
        avisos: [],
      };
    }
  }

  return calcularParticular(servico);
}

/** Formata em Real. Centralizado para a tela inteira falar a mesma língua. */
export const formatarReal = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Texto de busca de um serviço. Sem acento e em minúsculas, para "ULTRASSOM"
 * achar "ultrassonografia" digitado com ou sem acento no balcão.
 */
export const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Casa todos os termos digitados (ordem livre) contra nome, código e grupo. */
export function casaBusca(termo: string, alvos: Array<string | null | undefined>): boolean {
  const t = normalizar(termo);
  if (!t) return true;
  const texto = alvos.map(normalizar).join(" ");
  return t.split(/\s+/).every((parte) => texto.includes(parte));
}
