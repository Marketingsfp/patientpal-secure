/**
 * Dados dos blocos temáticos do Painel Executivo.
 *
 * Reúne num só lugar tudo o que os três blocos precisam ler do banco:
 *
 *   Bloco 1 (topo)   — contratos e mensalidades do Cartão.
 *   Bloco 2 (visão)  — série financeira do ano, Consultas x Exames,
 *                      aniversariantes.
 *   Bloco 3 (Cartão) — os mesmos contratos e mensalidades do Bloco 1.
 *
 * Os blocos 1 e 3 saem da MESMA leitura de propósito: se cada um fizesse a sua,
 * o topo poderia mostrar 1.882 contratos ativos e a grade lá embaixo 1.879,
 * porque as duas consultas cairiam em instantes diferentes.
 *
 * ------------------------ O CORTE DE 1.000 LINHAS -------------------------
 * O banco devolve no máximo 1.000 linhas por consulta e NÃO avisa quando corta.
 * A clínica tem mais de 1.800 contratos, então uma leitura simples somaria só
 * um pedaço e mostraria um total menor com cara de certo. Por isso as duas
 * leituras do Cartão são paginadas até acabar, e um erro no meio da paginação
 * zera o indicador em vez de publicar um total incompleto.
 *
 * As demais contas (financeiro do ano, atendimentos, aniversariantes) são
 * feitas DENTRO do banco, por funções que já devolvem o resultado somado.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hojeBR, zonedDateStringToUtcISO } from "@/lib/date-utils";
import {
  limitesDoMes,
  resumirContratos,
  resumirMensalidades,
  type ContratoIndicadorRow,
  type MensalidadeIndicadorRow,
  type ResumoContratos,
  type ResumoMensalidades,
} from "@/lib/cartao/indicadores";
import {
  agruparEvolucaoMensal,
  type EvolucaoMensal,
  type SerieDiariaRow,
} from "@/lib/dashboard/evolucao-financeira";

/** Linhas por ida ao banco na paginação. É o teto que o PostgREST aceita. */
const PAGINA = 1000;
/** Trava contra laço infinito se o banco passar a repetir a mesma página. */
const MAX_PAGINAS = 50;

export interface AtendimentosPorCategoria {
  consultas: number;
  /** Imagem (1 por linha) + laboratório (1 por paciente/dia). */
  exames: number;
  procedimentos: number;
  /**
   * Atendimentos cujo serviço está cadastrado SEM o campo "tipo de
   * procedimento". Não é sobra de conta nem erro: em agosto de 2026 são 623 de
   * 2.147, porque 2.512 dos 4.520 serviços ativos da clínica estão sem tipo
   * (ECOCARDIOGRAMA, PREVENTIVO, ELETROCARDIOGRAMA e outros). Fica visível na
   * tela em vez de ser jogado dentro de "consultas" ou "exames" — chutar o
   * tipo seria inventar regra de negócio. Some sozinho conforme o cadastro
   * for preenchido.
   */
  semTipo: number;
  /** Todos os realizados: consultas + exames + procedimentos + semTipo. */
  total: number;
}

export interface Aniversariantes {
  hoje: number;
  mes: number;
}

/**
 * Inadimplência real do Cartão — TODA parcela já vencida, de qualquer mês.
 *
 * É diferente de `mensalidades`, que fala só do mês corrente e alimenta os
 * cards "pagas / a vencer / em atraso" do bloco do Cartão. O card do topo
 * precisa da carteira inteira: olhando só o mês, no dia 1º nenhuma parcela
 * ainda passou dos 5 dias de tolerância e o indicador mostrava 0,0% com 1.881
 * contratos ativos e 2.150 parcelas de fato vencidas.
 *
 * Vem somada de dentro do banco (`dashboard_blocos_periodo`) porque são
 * milhares de parcelas e o número cresce todo mês — trazer as linhas para o
 * navegador custaria uma paginação cada vez mais longa a cada carga da tela.
 */
export interface InadimplenciaCartao {
  /** Parcelas vencidas há mais de 5 dias e não pagas. */
  atrasadas: number;
  atrasadasValor: number;
  /** Tudo o que já venceu até hoje, pago ou não. É o divisor do percentual. */
  baseValor: number;
  /** Quantos contratos distintos têm ao menos uma parcela nessa situação. */
  contratos: number;
  pct: number;
}

/**
 * Taxas operacionais do mês. Saem da MESMA função que alimenta a aba Produção
 * (`painel_executivo_periodo`) — chamada aqui com o intervalo do mês, para que
 * o bloco não dependa do filtro de período do topo da tela.
 */
export interface ProducaoMes {
  agendados: number;
  confirmados: number;
  compareceram: number;
  faltaram: number;
  cancelaram: number;
  /** Minutos agendados sobre minutos publicados na agenda, em %. */
  ocupacaoPct: number;
  /** Comparecimentos sobre agendados, em %. 0 quando não houve agendamento. */
  comparecimentoPct: number;
}

export interface DashboardBlocos {
  /** Contratos do Cartão na clínica inteira. `null` = não foi possível somar. */
  contratos: ResumoContratos | null;
  /** Mensalidades com vencimento no mês corrente. `null` = não foi possível somar. */
  mensalidades: ResumoMensalidades | null;
  /**
   * Inadimplência de toda a carteira. `null` enquanto o arquivo
   * APLICAR-PAINEL-EXECUTIVO-CORRECOES-2026-09-01.sql não tiver sido rodado —
   * até lá a tela cai no número do mês corrente e diz que é do mês.
   */
  inadimplencia: InadimplenciaCartao | null;
  /** Receita x despesa mês a mês do ano corrente. */
  evolucao: EvolucaoMensal;
  /**
   * Consultas x exames realizados no mês. `null` enquanto a função
   * `dashboard_blocos_periodo` não tiver sido criada no banco (arquivo
   * APLICAR-DASHBOARD-BLOCOS.sql).
   */
  atendimentos: AtendimentosPorCategoria | null;
  /** Aniversariantes do dia e do mês. `null` pelo mesmo motivo acima. */
  aniversariantes: Aniversariantes | null;
  /** Produção e taxas operacionais do mês corrente. */
  producao: ProducaoMes;
  /** Primeiro e último dia do mês de referência, em texto puro. */
  mes: { ini: string; fim: string; hojeIso: string };
}

/** Lê uma tabela inteira em páginas de 1.000, ou devolve `null` se falhar. */
async function lerPaginado<T>(
  monta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[] | null> {
  const linhas: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const de = pagina * PAGINA;
    const { data, error } = await monta(de, de + PAGINA - 1);
    // Um erro no meio da paginação deixaria o total menor que o real — e um
    // número menor que parece certo é pior que número nenhum.
    if (error) return null;
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return linhas;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function carregar(clinicaId: string): Promise<DashboardBlocos> {
  const hojeIso = hojeBR();
  const mes = limitesDoMes(hojeIso);
  const ano = Number(hojeIso.slice(0, 4));
  const mesAtual = Number(hojeIso.slice(5, 7));

  const iniUtc = zonedDateStringToUtcISO(mes.ini, "00:00:00");
  const fimUtc = zonedDateStringToUtcISO(mes.fim, "23:59:59");

  const [contratosRows, mensalidadesRows, serieRes, blocosRes, execRes] = await Promise.all([
    lerPaginado<ContratoIndicadorRow>((de, ate) =>
      supabase
        .from("contratos_assinatura")
        .select("status, valor_mensal, data_inicio")
        .eq("clinica_id", clinicaId)
        .range(de, ate),
    ),
    lerPaginado<MensalidadeIndicadorRow>((de, ate) =>
      supabase
        .from("contrato_mensalidades")
        .select("status, valor, valor_pago, vencimento")
        .eq("clinica_id", clinicaId)
        .gte("vencimento", mes.ini)
        .lte("vencimento", mes.fim)
        .range(de, ate),
    ),
    // Ano corrente inteiro, somado por dia dentro do banco. Só o status
    // "confirmado" entra: previsto não é dinheiro que passou pelo caixa.
    supabase.rpc("fin_serie_diaria", {
      p_clinica: clinicaId,
      p_ini: `${ano}-01-01`,
      p_fim: hojeIso,
      p_status: "confirmado",
    }),
    // Consultas x exames e aniversariantes. Se a função ainda não existir no
    // banco, os dois campos ficam nulos e a tela avisa — o resto do painel
    // continua funcionando.
    supabase.rpc(
      "dashboard_blocos_periodo" as never,
      { p_clinica: clinicaId, p_ini: iniUtc, p_fim: fimUtc } as never,
    ),
    // Taxas operacionais do mês. É a mesma função da aba Produção, só que
    // presa ao mês em vez de seguir o filtro de período do topo da tela.
    supabase.rpc(
      "painel_executivo_periodo" as never,
      {
        p_clinica: clinicaId,
        p_ini: iniUtc,
        p_fim: fimUtc,
        p_de: mes.ini,
        p_ate: mes.fim,
      } as never,
    ),
  ]);

  const blocos = (blocosRes.data ?? null) as {
    atendimentos?: Partial<AtendimentosPorCategoria>;
    aniversariantes?: Partial<Aniversariantes>;
    inadimplencia?: Partial<InadimplenciaCartao>;
  } | null;

  const at = blocos?.atendimentos;
  const an = blocos?.aniversariantes;
  const inad = blocos?.inadimplencia;

  const prod =
    ((execRes.data ?? null) as { producao?: Record<string, unknown> } | null)?.producao ?? {};
  const agendados = num(prod.agendados);
  const compareceram = num(prod.compareceram);

  return {
    contratos: contratosRows ? resumirContratos(contratosRows, mes.ini) : null,
    mensalidades: mensalidadesRows ? resumirMensalidades(mensalidadesRows, hojeIso) : null,
    evolucao: agruparEvolucaoMensal((serieRes.data ?? []) as SerieDiariaRow[], ano, mesAtual),
    atendimentos: at
      ? {
          consultas: num(at.consultas),
          exames: num(at.exames),
          procedimentos: num(at.procedimentos),
          semTipo: num(at.semTipo),
          total: num(at.total),
        }
      : null,
    aniversariantes: an ? { hoje: num(an.hoje), mes: num(an.mes) } : null,
    inadimplencia: inad
      ? {
          atrasadas: num(inad.atrasadas),
          atrasadasValor: num(inad.atrasadasValor),
          baseValor: num(inad.baseValor),
          contratos: num(inad.contratos),
          pct: num(inad.pct),
        }
      : null,
    producao: {
      agendados,
      confirmados: num(prod.confirmados),
      compareceram,
      faltaram: num(prod.faltaram),
      cancelaram: num(prod.cancelaram),
      ocupacaoPct: num(prod.ocupacaoPct),
      comparecimentoPct: agendados > 0 ? (compareceram / agendados) * 100 : 0,
    },
    mes,
  };
}

/**
 * Carrega os três blocos. Os números são do MÊS CORRENTE e do ANO CORRENTE —
 * não seguem o filtro de período do topo da tela, que continua governando as
 * abas de detalhamento. O cabeçalho de cada bloco diz isso ao usuário.
 */
export function useDashboardBlocos(clinicaId: string | null | undefined) {
  return useQuery({
    queryKey: ["dashboard-blocos", clinicaId, hojeBR()],
    enabled: Boolean(clinicaId),
    // Os contratos e as mensalidades mudam ao longo do dia, mas não de minuto
    // em minuto; cinco minutos evitam refazer três consultas pesadas a cada
    // vez que a gestão troca de aba.
    staleTime: 5 * 60_000,
    queryFn: () => carregar(clinicaId as string),
  });
}
