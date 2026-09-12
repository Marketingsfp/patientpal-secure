/**
 * Acesso ao banco dos cards do Financeiro → Dashboard. A regra de cada card
 * vive em `painel-financeiro` (módulo puro, testado); aqui só se busca.
 *
 * Desde 12/09/2026 a receita inteira — atendimentos e recebimentos sem
 * agendamento — vem de uma fonte só, `carregarRateio`, pelo dia em que o
 * dinheiro entrou no caixa. Antes as mensalidades e os avulsos eram buscados
 * aqui à parte, e era isso que fazia o Dashboard, o Movimento de Caixa e o
 * relatório de Rateio mostrarem três números diferentes para o mesmo dia.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  carregarRateio,
  type RateioContexto,
  type RateioLinha,
} from "@/lib/financeiro/rateio-receita";
import { SEM_CATEGORIA } from "@/lib/financeiro/filtro-categoria";
import {
  classificarDespesas,
  type DespesaPainel,
  type LancamentoPainel,
} from "@/lib/financeiro/painel-financeiro";

/** O PostgREST devolve no máximo 1.000 linhas por requisição. */
const PAGINA = 1000;
const MAX_PAGINAS = 50;

type LancRaw = {
  id: string;
  data: string | null;
  descricao: string | null;
  valor: number | string | null;
  categoria_id: string | null;
  forma_pagamento: string | null;
};

const COLUNAS = "id, data, descricao, valor, categoria_id, forma_pagamento";

async function paginado(montar: () => any): Promise<LancRaw[]> {
  const out: LancRaw[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await montar().range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as LancRaw[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

export interface DadosPainel {
  /** Só as linhas de atendimento (com prestador). */
  rateio: RateioLinha[];
  despesas: DespesaPainel[];
  /** Mensalidades, adesões e avulsos — as linhas `avulso` do mesmo rateio. */
  outrasReceitas: LancamentoPainel[];
}

export async function carregarPainelFinanceiro(
  ctx: RateioContexto,
  clinicaId: string,
  de: string,
  ate: string,
): Promise<DadosPainel> {
  const [todasAsLinhas, despesasRaw] = await Promise.all([
    carregarRateio(ctx, { clinicaId, de, ate }),
    paginado(() =>
      supabase
        .from("fin_lancamentos")
        .select(COLUNAS)
        .eq("clinica_id", clinicaId)
        .eq("tipo", "despesa")
        .eq("status", "confirmado")
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: false })
        .order("id"),
    ),
  ]);

  const paraPainel = (r: LancRaw): LancamentoPainel => ({
    id: r.id,
    data: String(r.data ?? "").slice(0, 10),
    descricao: r.descricao ?? "",
    valor: Number(r.valor ?? 0) || 0,
    categoria_nome:
      (r.categoria_id ? ctx.categoriaNomePorId.get(r.categoria_id) : "")?.trim().toUpperCase() ||
      SEM_CATEGORIA,
    forma_pagamento: r.forma_pagamento,
  });

  return {
    rateio: todasAsLinhas.filter((l) => l.origem === "atendimento"),
    despesas: classificarDespesas(despesasRaw.map(paraPainel)),
    outrasReceitas: todasAsLinhas
      .filter((l) => l.origem === "avulso")
      .map((l) => ({
        id: l.id,
        data: l.data,
        descricao: l.servico_nome,
        valor: l.receita,
        categoria_nome: l.categoria_nome,
        forma_pagamento: l.formas[0]?.forma ?? null,
      })),
  };
}

/**
 * Quanto saiu do caixa para médicos e prestadores no período: repasse pago
 * MAIS o complemento médico pago. Desde 12/09/2026 os dois andam juntos —
 * se saiu no dia, entra na mesma soma, no Dashboard, no Movimento de Caixa
 * e no Rateio.
 */
export async function carregarRepassePago(
  ctx: RateioContexto,
  clinicaId: string,
  de: string,
  ate: string,
): Promise<number> {
  const linhas = await paginado(() =>
    supabase
      .from("fin_lancamentos")
      .select(COLUNAS)
      .eq("clinica_id", clinicaId)
      .eq("tipo", "despesa")
      .eq("status", "confirmado")
      .gte("data", de)
      .lte("data", ate)
      .order("id"),
  );
  const despesas = classificarDespesas(
    linhas.map((r) => ({
      id: r.id,
      data: String(r.data ?? "").slice(0, 10),
      descricao: r.descricao ?? "",
      valor: Number(r.valor ?? 0) || 0,
      categoria_nome:
        (r.categoria_id ? ctx.categoriaNomePorId.get(r.categoria_id) : "")?.trim().toUpperCase() ||
        SEM_CATEGORIA,
      forma_pagamento: r.forma_pagamento,
    })),
  );
  const total = despesas
    .filter((d) => d.grupo === "repasse_pago" || d.grupo === "complemento_medico")
    .reduce((s, d) => s + d.valor, 0);
  return Math.round(total * 100) / 100;
}
