/**
 * Composição da receita do Movimento de Caixa: de onde veio cada real.
 *
 * A tela mostrava só um total de "Receitas". A gestão pediu a mesma leitura
 * que o sistema anterior dava de relance: quanto veio de atendimento
 * Particular (separando Consultas de Exames e Procedimentos) e quanto veio das
 * Mensalidades do Cartão Benefícios, distinguindo o que é do mês, o que é
 * quitação atrasada e o que é pagamento adiantado.
 *
 * Os grupos são EXCLUSIVOS e EXAUSTIVOS: toda linha de receita cai em um e num
 * só grupo, e a soma dos grupos é o total de receitas exibido. É o que torna
 * os cards conferíveis — se sobrasse valor fora deles, os números não
 * fechariam com o card de Receitas logo acima.
 *
 * Nada aqui consulta o banco nem altera lançamento: é classificação de
 * leitura, alimentada pelo que a tela já carregou.
 */
import {
  LABEL_FORMA,
  ORDEM_FORMAS,
  type FormaCanonica,
  type FiltroForma,
} from "@/lib/financeiro/formas-pagamento";

export type GrupoReceita =
  | "consulta"
  | "exame_procedimento"
  | "mensalidade_periodo"
  | "mensalidade_atrasada"
  | "mensalidade_antecipada"
  | "outros";

export const GRUPOS_RECEITA: GrupoReceita[] = [
  "consulta",
  "exame_procedimento",
  "mensalidade_periodo",
  "mensalidade_atrasada",
  "mensalidade_antecipada",
  "outros",
];

export const LABEL_GRUPO: Record<GrupoReceita, string> = {
  consulta: "Consultas",
  exame_procedimento: "Exames / Procedimentos",
  mensalidade_periodo: "Referente ao período",
  mensalidade_atrasada: "Atrasados",
  mensalidade_antecipada: "Antecipados",
  outros: "Outros",
};

/** Explicação curta de cada card, para a gestão saber o que está somando. */
export const AJUDA_GRUPO: Record<GrupoReceita, string> = {
  consulta: "Atendimentos cujo procedimento é cadastrado como consulta.",
  exame_procedimento: "Exames e procedimentos, incluindo laboratório e imagem.",
  mensalidade_periodo: "Mensalidade cujo vencimento cai dentro do período exibido.",
  mensalidade_atrasada: "Quitou agora uma mensalidade vencida antes do período.",
  mensalidade_antecipada: "Pagou adiantado uma mensalidade que vence depois do período.",
  outros:
    "Receita sem atendimento nem mensalidade vinculados: taxa de adesão, lançamento manual, acerto.",
};

/**
 * Tipo cadastrado do procedimento de um atendimento.
 *
 * `agendamentos.procedimento` guarda o nome com a especialidade colada no
 * fim — "CONSULTA (CARDIOLOGIA)" — enquanto `procedimentos.nome` guarda só
 * "CONSULTA". Por isso a busca tem dois passos: tenta o nome inteiro, que é o
 * que resolve os nomes que legitimamente terminam em parênteses
 * ("ELETROCARDIOGRAMA (ECG)"), e só então tenta sem o último parêntese.
 *
 * Com esses dois passos a classificação cobre 99,9% dos atendimentos de
 * agosto/2026; só o nome inteiro cobria 26%.
 */
export function tipoDoProcedimento(
  procedimento: string | null | undefined,
  tiposPorNome: Map<string, string>,
): string | null {
  if (!procedimento) return null;
  const cheio = procedimento.trim().toUpperCase();
  const direto = tiposPorNome.get(cheio);
  if (direto) return direto;
  const semEspecialidade = cheio.replace(/\s*\([^()]*\)\s*$/, "").trim();
  if (!semEspecialidade || semEspecialidade === cheio) return null;
  return tiposPorNome.get(semEspecialidade) ?? null;
}

export interface LinhaReceita {
  /** "receita" | "despesa" | "transferencia". Só receita é classificada. */
  tipo: string;
  /** Nome do procedimento do atendimento vinculado, se houver. */
  procedimento?: string | null;
  /** Vencimento (YYYY-MM-DD) da mensalidade do Cartão Benefícios quitada. */
  mensalidadeVencimento?: string | null;
  /** Nº da parcela; 0 ou negativo é taxa de adesão, não mensalidade. */
  mensalidadeParcela?: number | null;
}

/**
 * Em que grupo esta linha entra.
 *
 * A mensalidade é testada ANTES do procedimento porque ela é o vínculo mais
 * específico: um lançamento ligado a `contrato_mensalidades` é mensalidade
 * mesmo que também tenha atendimento. Na prática os dois nunca coincidem —
 * conferido em agosto/2026, sobreposição zero —, mas a ordem deixa a regra
 * determinística de qualquer jeito.
 *
 * Parcela 0 ou negativa é taxa de adesão, cobrada uma única vez na emissão do
 * cartão. Não é mensalidade e cai em "Outros", para não inflar o controle de
 * quem está em dia.
 */
export function classificarReceita(
  l: LinhaReceita,
  periodo: { de: string; ate: string },
  tiposPorNome: Map<string, string>,
): GrupoReceita {
  if (l.tipo !== "receita") return "outros";

  const venc = l.mensalidadeVencimento;
  if (venc && (l.mensalidadeParcela ?? 1) > 0) {
    if (venc < periodo.de) return "mensalidade_atrasada";
    if (venc > periodo.ate) return "mensalidade_antecipada";
    return "mensalidade_periodo";
  }

  const tp = tipoDoProcedimento(l.procedimento, tiposPorNome);
  if (tp === "consulta") return "consulta";
  if (tp === "exame" || tp === "procedimento") return "exame_procedimento";
  return "outros";
}

export interface TotalGrupo {
  qtd: number;
  total: number;
}

/** Quanto e quantos em cada grupo. Grupos sem nada vêm zerados, não ausentes. */
export function totaisPorGrupo(
  linhas: Array<{ grupo: GrupoReceita; valor: number | string | null | undefined }>,
): Record<GrupoReceita, TotalGrupo> {
  const acc = Object.fromEntries(GRUPOS_RECEITA.map((g) => [g, { qtd: 0, total: 0 }])) as Record<
    GrupoReceita,
    TotalGrupo
  >;
  for (const l of linhas) {
    const a = acc[l.grupo];
    if (!a) continue;
    a.qtd += 1;
    a.total += Number(l.valor) || 0;
  }
  for (const g of GRUPOS_RECEITA) acc[g].total = Number(acc[g].total.toFixed(2));
  return acc;
}

export interface TotalForma {
  forma: FormaCanonica;
  label: string;
  qtd: number;
  total: number;
}

/**
 * Quebra do total recebido por forma de pagamento, com quantidade.
 *
 * É o conteúdo do popover do card de Receitas. Formas sem nenhuma transação
 * ficam de fora — a lista existe para ser lida de relance, e linha zerada só
 * atrapalha. A ordem é a de `ORDEM_FORMAS`, a mesma do resto do financeiro.
 */
export function totaisPorForma(
  linhas: Array<{ balde: FormaCanonica; valor: number | string | null | undefined }>,
): { formas: TotalForma[]; qtd: number; total: number } {
  const acc = new Map<FormaCanonica, TotalForma>();
  let qtd = 0;
  let total = 0;
  for (const l of linhas) {
    const v = Number(l.valor) || 0;
    qtd += 1;
    total += v;
    const atual = acc.get(l.balde);
    if (atual) {
      atual.qtd += 1;
      atual.total += v;
    } else {
      acc.set(l.balde, { forma: l.balde, label: LABEL_FORMA[l.balde], qtd: 1, total: v });
    }
  }
  const formas = ORDEM_FORMAS.filter((f) => acc.has(f)).map((f) => {
    const t = acc.get(f)!;
    return { ...t, total: Number(t.total.toFixed(2)) };
  });
  // Balde que não esteja em ORDEM_FORMAS não pode sumir da conta.
  for (const [f, t] of acc) {
    if (!ORDEM_FORMAS.includes(f)) formas.push({ ...t, total: Number(t.total.toFixed(2)) });
  }
  return { formas, qtd, total: Number(total.toFixed(2)) };
}

/**
 * Opção do filtro "Forma" que corresponde a cada balde, para o popover poder
 * filtrar a lista com um clique.
 *
 * Nem todo balde tem opção equivalente no filtro: transferência, convênio,
 * misto e "outros" não são escolhas do seletor. Esses ficam sem link em vez de
 * cair num filtro parecido — mandar o usuário para um recorte que não é o que
 * ele clicou é pior do que não deixar clicar.
 */
export const FILTRO_DA_FORMA: Partial<Record<FormaCanonica, FiltroForma>> = {
  dinheiro: "dinheiro",
  pix: "pix",
  debito: "debito",
  credito: "credito",
  legado_cartao: "legado",
  pago_sistema_anterior: "pago_anterior",
  boleto: "boleto",
  sem_informacao: "sem",
};
