/**
 * Lê um período fatiado dia a dia — para os relatórios.
 *
 * Por que existe
 * --------------
 * As regras de acesso do banco (RLS) checam a permissão linha a linha. Com a
 * paginação por deslocamento (`range`), a página 34 de um mês de agendamentos
 * faz o banco reler e rechecar as 33 mil linhas anteriores — 1,3 s só ela. O
 * Dashboard de Relatórios pedia dezenas dessas páginas ao mesmo tempo e
 * estourava o tempo limite do servidor ("O servidor demorou para responder").
 *
 * Fatiando por dia, cada consulta cobre um dia (1 ou 2 páginas), o banco
 * relê cada linha uma vez só, e o mês inteiro sai em cerca de 1 s de banco.
 * Os dias são pedidos em ondas para não disparar dezenas de requisições
 * juntas; a ordem final é a dos dias (cada fatia vem ordenada pela consulta).
 *
 * `montar(de, ate)` recebe o dia (`YYYY-MM-DD`) e o dia seguinte, e deve
 * filtrar `>= de` e `< ate` — vale para coluna `date` e `timestamptz` (o banco
 * roda no fuso de São Paulo, então o dia é o dia civil da clínica).
 */
import { buscarPaginado, type ConsultaPaginavel } from "@/lib/financeiro/paginacao";

const DIAS_POR_ONDA = 4;
/** Trava contra período aberto por engano (mais de dois anos). */
const MAX_DIAS = 800;

function diaSeguinte(dia: string): string {
  const d = new Date(dia + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function diasDoPeriodo(ini: string, fim: string): string[] {
  const dias: string[] = [];
  if (!ini || !fim || ini > fim) return dias;
  for (let d = ini; d <= fim && dias.length < MAX_DIAS; d = diaSeguinte(d)) dias.push(d);
  if (dias.length >= MAX_DIAS) {
    throw new Error("Período grande demais. Escolha no máximo dois anos.");
  }
  return dias;
}

export async function buscarPorDia<T>(
  ini: string,
  fim: string,
  montar: (de: string, ate: string) => ConsultaPaginavel<T>,
): Promise<T[]> {
  const dias = diasDoPeriodo(ini, fim);
  const out: T[] = [];
  for (let i = 0; i < dias.length; i += DIAS_POR_ONDA) {
    const fatias = await Promise.all(
      dias.slice(i, i + DIAS_POR_ONDA).map((dia) =>
        // Dentro do dia as páginas vão em fila: quase sempre há uma só.
        buscarPaginado(() => montar(dia, diaSeguinte(dia)), { maxPaginas: 100, porOnda: 1 }),
      ),
    );
    for (const f of fatias) out.push(...f);
  }
  return out;
}
