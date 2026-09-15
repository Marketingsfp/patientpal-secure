/**
 * Aplica o repasse "por serviço" de uma planilha na grade de repasse dos
 * médicos.
 *
 * Na planilha da São Francisco o repasse é do serviço (VALOR DO MÉDICO ou
 * % MÉDICO vale para qualquer médico que faça aquele item). O sistema, porém,
 * só paga o que está na grade de cada médico (`medico_convenios`, uma linha por
 * médico e serviço) — é ela que o Financeiro, o Rateio e a GR leem. Então o
 * repasse do serviço vira uma linha na grade de cada médico que atende o
 * serviço (vínculo `medico_procedimentos`).
 *
 * Regra fixa: acordo individual nunca é sobrescrito. Se o médico já tem QUALQUER
 * número na linha daquele serviço (inclusive 0, que é "não paga repasse"), a
 * linha fica como está. Só entra linha nova ou linha que existe toda em branco.
 *
 * Este arquivo não fala com o banco — só monta o plano, para ser testado.
 */

import { normRepasse } from "./repasse-calc";
import type { RepasseDoServico } from "./importar-servicos";

export interface RegraDoServico {
  procedimentoId: string;
  /** Nome exato do serviço no catálogo — é a chave que o cálculo usa. */
  procedimentoNome: string;
  repasse: RepasseDoServico;
}

export interface VinculoMedicoServico {
  medicoId: string;
  medicoNome: string;
  procedimentoId: string;
}

/** Linha que já existe na grade de repasse de algum médico. */
export interface LinhaGradeExistente {
  id: string;
  medicoId: string;
  nome: string;
  percentual: number | null;
  valor: number | null;
  convenio_percentual: number | null;
  convenio_valor: number | null;
  cartao_consulta_valor: number | null;
  cartao_desconto_valor: number | null;
}

export interface ItemPlano {
  medicoId: string;
  medicoNome: string;
  procedimentoNome: string;
  repasse: RepasseDoServico;
}

export interface PlanoRepasse {
  /** Médico sem linha para o serviço: cria. */
  inserir: ItemPlano[];
  /** Linha existe, mas toda em branco: preenche. */
  atualizar: Array<ItemPlano & { linhaId: string }>;
  /** Médico já tem acordo para o serviço: não mexe. */
  mantidos: Array<ItemPlano & { atual: string }>;
  /** Serviços com repasse na planilha, mas sem nenhum médico vinculado ainda. */
  semMedico: string[];
}

const temNumero = (v: number | null | undefined) => v !== null && v !== undefined;

/** Resumo legível do que o médico já tem, para a conferência. */
function descreverAtual(l: LinhaGradeExistente): string {
  const partes: string[] = [];
  if (temNumero(l.valor)) partes.push(`R$ ${Number(l.valor).toFixed(2).replace(".", ",")}`);
  if (temNumero(l.percentual)) partes.push(`${String(l.percentual).replace(".", ",")}%`);
  if (temNumero(l.convenio_valor) || temNumero(l.convenio_percentual)) partes.push("convênio");
  if (temNumero(l.cartao_consulta_valor)) partes.push("cartão consulta");
  if (temNumero(l.cartao_desconto_valor)) partes.push("cartão desconto");
  return partes.join(" · ") || "regra própria";
}

export function linhaEmBranco(l: LinhaGradeExistente): boolean {
  return ![
    l.percentual,
    l.valor,
    l.convenio_percentual,
    l.convenio_valor,
    l.cartao_consulta_valor,
    l.cartao_desconto_valor,
  ].some(temNumero);
}

export function planejarRepasseServicos(
  regras: RegraDoServico[],
  vinculos: VinculoMedicoServico[],
  grade: LinhaGradeExistente[],
): PlanoRepasse {
  const plano: PlanoRepasse = { inserir: [], atualizar: [], mantidos: [], semMedico: [] };

  const gradePorChave = new Map<string, LinhaGradeExistente>();
  for (const l of grade) {
    const k = `${l.medicoId}|${normRepasse(l.nome)}`;
    if (!gradePorChave.has(k)) gradePorChave.set(k, l);
  }

  const vinculosPorServico = new Map<string, VinculoMedicoServico[]>();
  for (const v of vinculos) {
    const lista = vinculosPorServico.get(v.procedimentoId) ?? [];
    // O mesmo médico pode estar vinculado duas vezes (uma por especialidade).
    if (!lista.some((x) => x.medicoId === v.medicoId)) lista.push(v);
    vinculosPorServico.set(v.procedimentoId, lista);
  }

  for (const regra of regras) {
    const medicos = vinculosPorServico.get(regra.procedimentoId) ?? [];
    if (!medicos.length) {
      plano.semMedico.push(regra.procedimentoNome);
      continue;
    }
    for (const m of medicos) {
      const item: ItemPlano = {
        medicoId: m.medicoId,
        medicoNome: m.medicoNome,
        procedimentoNome: regra.procedimentoNome,
        repasse: regra.repasse,
      };
      const existente = gradePorChave.get(`${m.medicoId}|${normRepasse(regra.procedimentoNome)}`);
      if (!existente) plano.inserir.push(item);
      else if (linhaEmBranco(existente)) plano.atualizar.push({ ...item, linhaId: existente.id });
      else plano.mantidos.push({ ...item, atual: descreverAtual(existente) });
    }
  }

  const porNome = (a: ItemPlano, b: ItemPlano) =>
    a.medicoNome.localeCompare(b.medicoNome, "pt-BR") ||
    a.procedimentoNome.localeCompare(b.procedimentoNome, "pt-BR");
  plano.inserir.sort(porNome);
  plano.atualizar.sort(porNome);
  plano.mantidos.sort(porNome);
  plano.semMedico.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return plano;
}

/**
 * Campos da grade para o repasse do serviço. Só a coluna Particular recebe o
 * número; Convênio e Cartões ficam em branco e seguem o padrão do médico,
 * porque a planilha não diz nada sobre eles.
 */
export function camposDaGrade(repasse: RepasseDoServico) {
  return {
    tipo_repasse: repasse.tipo,
    percentual: repasse.tipo === "percentual" ? repasse.valor : null,
    valor: repasse.tipo === "valor" ? repasse.valor : null,
  };
}
