/**
 * Regra do aviso "Existem N agendamentos pendentes com este benefício no
 * período…" para o ramo em que a cota ainda não foi consumida, mas
 * existem outros agendamentos pendentes que compartilham a cota.
 *
 * - Gratuidade (beneficio.gratuito === true): só avisa quando houver
 *   pendente do MESMO serviço/procedimento do atendimento atual.
 * - Demais benefícios: só avisa se o total (usados + pendentes + 1)
 *   estourar o limite_qtd.
 */

export interface BeneficioAviso {
  gratuito?: boolean | null;
  limite_qtd?: number | null;
  excedente_modo?: string | null; // "particular" | "percentual_particular" | "valor_fixo" | "bloquear" | "regra_padrao_convenio"
  excedente_percentual?: number | null;
  excedente_valor?: number | null;
}

export interface PendenteAviso {
  procedimento?: string | null;
}

export function normalizarProcedimento(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function calcularAvisoLimitePendentes(params: {
  beneficio: BeneficioAviso;
  pendentes: PendenteAviso[];
  usados: number;
  procedimentoNome: string | null | undefined;
}): string | null {
  const { beneficio, pendentes, usados, procedimentoNome } = params;
  if (!pendentes || pendentes.length === 0) return null;

  let pendentesRelevantes: PendenteAviso[] = pendentes;
  let deveAvisar = false;

  if (beneficio.gratuito) {
    const procAtual = normalizarProcedimento(procedimentoNome);
    pendentesRelevantes = pendentes.filter(
      (a) => normalizarProcedimento(a.procedimento) === procAtual,
    );
    deveAvisar = pendentesRelevantes.length >= 1;
  } else {
    const limite = Number(beneficio.limite_qtd) || 0;
    deveAvisar = limite > 0 && usados + pendentes.length + 1 > limite;
  }

  if (!deveAvisar) return null;

  const modo = beneficio.excedente_modo;
  let excedenteTxt = "sairão sem o benefício";
  if (modo === "particular") {
    excedenteTxt = "sairão pelo valor particular cheio";
  } else if (modo === "percentual_particular") {
    const pct = Number(beneficio.excedente_percentual) || 0;
    excedenteTxt = `sairão com ${pct}% de desconto sobre o particular`;
  } else if (modo === "valor_fixo") {
    const v = Number(beneficio.excedente_valor) || 0;
    excedenteTxt = `sairão pelo valor fixo excedente de R$ ${v.toFixed(2)}`;
  } else if (modo === "bloquear") {
    excedenteTxt = "serão bloqueados pelo convênio";
  } else if (modo === "regra_padrao_convenio") {
    excedenteTxt = "sairão pela regra padrão do convênio";
  }
  const total = pendentesRelevantes.length + 1;
  return `Existem ${total} agendamentos pendentes com este benefício no período. Apenas ${beneficio.limite_qtd} será cobrado com o benefício; os demais ${excedenteTxt} quando pagos.`;
}