/**
 * O que o Movimento de Caixa deixa fora do caixa de um período, para as
 * outras telas que dizem "mesma conta do Movimento de Caixa" (Financeiro →
 * Dashboard e o saldo do caixa nos Relatórios) tirarem exatamente o mesmo.
 *
 * Por que existe
 * --------------
 * Em 04/09/2026 o Dashboard mostrava R$ 495,00 a mais de receita e
 * R$ 5.880,12 a mais de despesa que o Movimento de Caixa: uma receita e seis
 * despesas com data de 04/09, digitadas em 08 e 11/09. O Movimento as tira do
 * dia (são ajuste retroativo, fora do cupom impresso); o Dashboard somava. O
 * mesmo valeria para as parcelas de cartão importadas do sistema antigo.
 *
 * A regra é a mesma do Movimento de Caixa, pelas mesmas funções:
 * `ehLancamentoRetroativo` (competência anterior à digitação e dinheiro fora
 * do cupom daquele dia) e `ehParcelaImportada`. Desde 26/09/2026 o Rateio da
 * Receita também usa este recorte por padrão, com o mesmo botão para incluir
 * os retroativos. O Painel Executivo NÃO usa: lá a receita continua pela
 * competência.
 */
import { supabase } from "@/integrations/supabase/client";
import { comCache, TTL_PERIODO } from "@/lib/financeiro/cache-periodo";
import { buscarPaginado } from "@/lib/financeiro/paginacao";
import {
  ehLancamentoRetroativo,
  ehParcelaImportada,
  mapaDaGaveta,
  TIPOS_QUE_PESAM_NA_GAVETA,
  totaisRetroativos,
  type TotaisRetroativos,
} from "@/lib/financeiro/retroativos";

const PAGINA = 1000;
const MAX_PAGINAS = 50;

export interface ForaDoCaixa {
  /** ids de `fin_lancamentos` que não entram na conta do caixa. */
  ids: Set<string>;
  retroativos: TotaisRetroativos;
  importadas: TotaisRetroativos;
}

/** Dia ISO deslocado, sem depender do fuso do navegador. */
function diaDeslocado(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Páginas em ondas paralelas — ver `@/lib/financeiro/paginacao`. */
async function paginado<T>(montar: () => any): Promise<T[]> {
  return buscarPaginado<T>(montar, { pagina: PAGINA, maxPaginas: MAX_PAGINAS });
}

type LancRaw = {
  id: string;
  tipo: string;
  valor: number | string | null;
  data: string;
  created_at: string | null;
  forma_pagamento: string | null;
};

export async function carregarForaDoCaixa(
  clinicaId: string,
  de: string,
  ate: string,
  forcar = false,
): Promise<ForaDoCaixa> {
  return comCache(
    `foraDoCaixa|${clinicaId}|${de}|${ate}`,
    TTL_PERIODO,
    () => lerForaDoCaixa(clinicaId, de, ate),
    forcar,
  );
}

async function lerForaDoCaixa(clinicaId: string, de: string, ate: string): Promise<ForaDoCaixa> {
  // Mesma janela do Movimento de Caixa: um dia a mais de cada lado, porque
  // `created_at` é timestamptz e o dia de Brasília é decidido no cliente.
  const iniJanela = `${diaDeslocado(de, -1)}T00:00:00`;
  const fimJanela = `${diaDeslocado(ate, 1)}T23:59:59`;

  const [lancs, movs, sessoes] = await Promise.all([
    paginado<LancRaw>(() =>
      supabase
        .from("fin_lancamentos")
        .select("id, tipo, valor, data, created_at, forma_pagamento")
        .eq("clinica_id", clinicaId)
        .eq("status", "confirmado")
        .in("tipo", ["receita", "despesa"])
        .gte("data", de)
        .lte("data", ate)
        .order("id"),
    ),
    paginado<{ lancamento_id: string | null; tipo: string; sessao_id: string }>(() =>
      supabase
        .from("caixa_movimentos")
        .select("lancamento_id, tipo, sessao_id")
        .eq("clinica_id", clinicaId)
        .in("tipo", [...TIPOS_QUE_PESAM_NA_GAVETA])
        .not("lancamento_id", "is", null)
        .gte("created_at", iniJanela)
        .lte("created_at", fimJanela)
        .order("id"),
    ),
    paginado<{ id: string; aberto_em: string; fechado_em: string | null }>(() =>
      supabase
        .from("caixa_sessoes")
        .select("id, aberto_em, fechado_em")
        .eq("clinica_id", clinicaId)
        .gte("aberto_em", iniJanela)
        .lte("aberto_em", fimJanela)
        .order("id"),
    ),
  ]);

  const gaveta = mapaDaGaveta(movs, sessoes);
  const ids = new Set<string>();
  const retro: LancRaw[] = [];
  const importadas: LancRaw[] = [];
  for (const l of lancs) {
    if (ehLancamentoRetroativo(l, gaveta.get(l.id) ?? null)) retro.push(l);
    else if (ehParcelaImportada(l)) importadas.push(l);
    else continue;
    ids.add(l.id);
  }
  return {
    ids,
    retroativos: totaisRetroativos(retro),
    importadas: totaisRetroativos(importadas),
  };
}
