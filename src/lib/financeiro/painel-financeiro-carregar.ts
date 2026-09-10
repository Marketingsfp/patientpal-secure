/**
 * Acesso ao banco dos cards do Financeiro → Dashboard. A regra de cada card
 * vive em `painel-financeiro` (módulo puro, testado); aqui só se busca.
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
  rateio: RateioLinha[];
  despesas: DespesaPainel[];
  outrasReceitas: LancamentoPainel[];
}

export async function carregarPainelFinanceiro(
  ctx: RateioContexto,
  clinicaId: string,
  de: string,
  ate: string,
): Promise<DadosPainel> {
  const [rateio, despesasRaw, receitasRaw, manuais] = await Promise.all([
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
    // Receita sem agendamento: é exatamente o que o Rateio deixa de fora.
    paginado(() =>
      supabase
        .from("fin_lancamentos")
        .select(COLUNAS)
        .eq("clinica_id", clinicaId)
        .eq("tipo", "receita")
        .eq("status", "confirmado")
        .is("agendamento_id", null)
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: false })
        .order("id"),
    ),
    // Atendimento lançado à mão pode apontar para um lançamento sem
    // agendamento; esse dinheiro já está no Rateio e não pode entrar de novo
    // em Outras receitas.
    supabase
      .from("fin_atendimentos")
      .select("lancamento_id")
      .eq("clinica_id", clinicaId)
      .gte("data", de)
      .lte("data", ate)
      .not("lancamento_id", "is", null),
  ]);
  if (manuais.error) throw manuais.error;
  const jaNoRateio = new Set(
    ((manuais.data ?? []) as Array<{ lancamento_id: string | null }>)
      .map((m) => m.lancamento_id)
      .filter((x): x is string => !!x),
  );

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
    rateio,
    despesas: classificarDespesas(despesasRaw.map(paraPainel)),
    outrasReceitas: receitasRaw.filter((r) => !jaNoRateio.has(r.id)).map(paraPainel),
  };
}
