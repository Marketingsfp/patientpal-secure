import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  CakeSlice,
  CalendarCheck,
  CreditCard,
  Gauge,
  PiggyBank,
  Stethoscope,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { MiniPieChart } from "@/components/charts/MiniPieChart";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CardIndicador } from "./card-indicador";
import type { DashboardBlocos } from "@/hooks/use-dashboard-blocos";
import { DIAS_TOLERANCIA_MENSALIDADE } from "@/lib/cartao/indicadores";

/**
 * Blocos temáticos do Painel Executivo.
 *
 * A tela tinha oito cards soltos no topo, seguidos de cinco abas — todos os
 * números no mesmo nível de importância, sem dizer o que era do dia e o que era
 * do mês. Os três blocos abaixo organizam a leitura em camadas:
 *
 *   1. Topo Executivo   — os quatro números que respondem "como está o mês".
 *   2. Visão Clínica    — os gráficos e as taxas que explicam por quê.
 *   3. Cartão Benefícios— a gestão da carteira de contratos.
 *
 * TODOS os três olham o MÊS CORRENTE (e o gráfico, o ano corrente). Eles não
 * seguem o filtro de período do topo da tela, que continua governando as abas
 * de detalhamento — cada bloco diz isso no próprio cabeçalho, porque um número
 * que muda de régua sem avisar é a origem mais comum de leitura errada aqui.
 */

const money = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => Number(n || 0).toLocaleString("pt-BR");
const pct = (n: number) =>
  `${Number(n || 0)
    .toFixed(1)
    .replace(".", ",")}%`;

const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "agosto de 2026" a partir de uma data pura AAAA-MM-DD. */
function nomeDoMes(iso: string): string {
  const ano = iso.slice(0, 4);
  const mes = Number(iso.slice(5, 7));
  return `${MESES_LONGOS[mes - 1] ?? ""} de ${ano}`;
}

/** Cabeçalho de bloco: título, e uma linha dizendo de que período ele fala. */
function Bloco({
  titulo,
  periodo,
  children,
}: {
  titulo: string;
  periodo: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{periodo}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Aviso de indicador que depende de uma atualização de banco ainda não
 * aplicada. Aparece no lugar do gráfico, nunca como um zero: zero se lê como
 * "não houve", e aqui o certo é "ainda não dá para saber".
 */
function FaltaAtualizacao({ oQue }: { oQue: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-6 text-center dark:border-amber-900 dark:bg-amber-950/20">
      <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {oQue} ainda não está disponível
      </p>
      <p className="max-w-sm text-xs text-amber-700/90 dark:text-amber-300/80">
        Falta rodar o arquivo <strong>APLICAR-DASHBOARD-BLOCOS.sql</strong> no SQL editor. Nenhum
        outro número da tela depende dele.
      </p>
    </div>
  );
}

// ===========================================================================
// BLOCO 1 — Topo Executivo
// ===========================================================================

export function BlocoTopoExecutivo({
  dados,
  carregando,
  podeFin,
}: {
  dados: DashboardBlocos | undefined;
  carregando: boolean;
  podeFin: boolean;
}) {
  const mesIso = dados?.mes.ini ?? "";
  const idx = mesIso ? Number(mesIso.slice(5, 7)) - 1 : -1;
  const ev = dados?.evolucao;
  const receitaMes = idx >= 0 ? (ev?.receitas[idx] ?? 0) : 0;
  const despesaMes = idx >= 0 ? (ev?.despesas[idx] ?? 0) : 0;
  const ct = dados?.contratos ?? null;
  const ms = dados?.mensalidades ?? null;
  const at = dados?.atendimentos ?? null;

  return (
    <Bloco
      titulo="Topo executivo"
      periodo={mesIso ? `Mês de ${nomeDoMes(mesIso)}` : "Mês corrente"}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {podeFin && (
          <CardIndicador
            destaque
            carregando={carregando}
            tom="verde"
            icone={Wallet}
            titulo="Faturamento total do mês"
            valor={money(receitaMes)}
            detalhe={`Despesas ${money(despesaMes)} · Resultado ${money(receitaMes - despesaMes)}`}
            ajuda="Soma de todas as entradas confirmadas no mês, pela data do lançamento. É a mesma conta do card Recebimentos com o filtro em 'Este mês'. Lançamento pendente não entra."
          />
        )}

        <CardIndicador
          destaque
          carregando={carregando}
          tom="azul"
          icone={CreditCard}
          titulo="Contratos ativos do cartão"
          valor={ct ? int(ct.ativos) : "—"}
          detalhe={
            ct
              ? `Receita prevista ${money(ct.receitaPrevista)}`
              : "Não foi possível somar os contratos"
          }
          ajuda="Todos os contratos do Cartão Benefícios com situação 'ativo' na clínica, e a soma das mensalidades deles. É a carteira inteira, não uma página de lista."
        />

        <CardIndicador
          destaque
          carregando={carregando}
          tom={ms && ms.inadimplenciaPct > 0 ? "vermelho" : "neutro"}
          icone={AlertTriangle}
          titulo="Inadimplência real do cartão"
          valor={ms ? pct(ms.inadimplenciaPct) : "—"}
          detalhe={
            ms
              ? `${money(ms.atrasadasValor)} em ${int(ms.atrasadas)} parcela(s) vencida(s)`
              : "Não foi possível somar as mensalidades"
          }
          ajuda={`Parcelas com vencimento neste mês, não pagas e atrasadas há mais de ${DIAS_TOLERANCIA_MENSALIDADE} dias — a mesma régua que bloqueia o cartão no balcão. O percentual é o valor atrasado sobre tudo o que o mês tinha para receber.`}
        />

        <CardIndicador
          destaque
          carregando={carregando}
          tom="roxo"
          icone={Stethoscope}
          titulo="Atendimentos realizados"
          valor={at ? int(at.total) : "—"}
          detalhe={
            at
              ? `${int(at.consultas)} consulta(s) · ${int(at.exames)} exame(s)`
              : "Falta aplicar APLICAR-DASHBOARD-BLOCOS.sql"
          }
          ajuda="Consultas mais exames realizados no mês. Exames de laboratório do mesmo paciente no mesmo dia contam como um atendimento só, pela regra aprovada em 07/07/2026."
        />
      </div>
    </Bloco>
  );
}

// ===========================================================================
// BLOCO 2 — Gráficos e Operação Clínica
// ===========================================================================

/** Lista dos aniversariantes de hoje — nome e idade, nada de dado clínico. */
function useAniversariantesDeHoje(clinicaId: string | null | undefined) {
  return useQuery({
    queryKey: ["dashboard-aniversariantes-hoje", clinicaId],
    enabled: Boolean(clinicaId),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pacientes_aniversariantes_hoje", {
        _clinica_id: clinicaId as string,
        _limite: 60,
      });
      if (error) return [] as { id: string; nome: string; data_nascimento: string | null }[];
      return (
        (data ?? []) as Array<{
          id: string;
          nome: string;
          data_nascimento: string | null;
        }>
      ).map((p) => ({ id: p.id, nome: p.nome, data_nascimento: p.data_nascimento }));
    },
  });
}

/** Idade completa a partir da data pura de nascimento, sem passar por fuso. */
function idadeEm(nascimento: string | null, hojeIso: string): number | null {
  if (!nascimento) return null;
  const [an, mn, dn] = nascimento.slice(0, 10).split("-").map(Number);
  const [ah, mh, dh] = hojeIso.split("-").map(Number);
  if (!an || !ah) return null;
  let idade = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) idade -= 1;
  return idade >= 0 ? idade : null;
}

function PainelGrafico({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titulo}</CardTitle>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

export function BlocoVisaoClinica({
  dados,
  carregando,
  clinicaId,
  podeFin,
}: {
  dados: DashboardBlocos | undefined;
  carregando: boolean;
  clinicaId: string | null | undefined;
  podeFin: boolean;
}) {
  const ev = dados?.evolucao;
  const at = dados?.atendimentos ?? null;
  const prod = dados?.producao;
  const aniver = dados?.aniversariantes ?? null;
  const hojeIso = dados?.mes.hojeIso ?? "";
  const listaAniver = useAniversariantesDeHoje(clinicaId);

  const fatias = useMemo(
    () =>
      at
        ? [
            { name: "Consultas", value: at.consultas },
            { name: "Exames", value: at.exames },
          ].filter((f) => f.value > 0)
        : [],
    [at],
  );

  const ano = dados?.mes.ini.slice(0, 4) ?? "";

  return (
    <Bloco
      titulo="Visão clínica e financeira"
      periodo={
        dados?.mes.ini ? `Ano de ${ano} e mês de ${nomeDoMes(dados.mes.ini)}` : "Ano e mês corrente"
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {podeFin && (
          <PainelGrafico
            titulo="Evolução financeira"
            sub={
              ev
                ? `Receita ${money(ev.totalReceita)} · Despesa ${money(ev.totalDespesa)} no ano`
                : undefined
            }
          >
            {carregando || !ev ? (
              <div className="h-[280px] animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ) : (
              <MiniBarChart
                labels={ev.labels}
                height={280}
                formatY={(n) =>
                  `R$ ${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                }
                series={[
                  { name: "Receita", color: "#10b981", values: ev.receitas },
                  { name: "Despesa", color: "#ef4444", values: ev.despesas },
                ]}
              />
            )}
          </PainelGrafico>
        )}

        <PainelGrafico
          titulo="Distribuição de atendimentos"
          sub={at ? `${int(at.total)} atendimento(s) realizados no mês` : undefined}
        >
          {carregando ? (
            <div className="h-[280px] animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : !at ? (
            <FaltaAtualizacao oQue="A divisão entre consultas e exames" />
          ) : fatias.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nenhum atendimento realizado no mês até agora.
            </p>
          ) : (
            <MiniPieChart
              data={fatias}
              height={280}
              colors={["#3b82f6", "#13b5a3"]}
              formatValue={(n) => int(n)}
            />
          )}
        </PainelGrafico>

        <PainelGrafico titulo="Taxas operacionais" sub="Agenda do mês">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CardIndicador
              carregando={carregando}
              tom="azul"
              icone={Gauge}
              titulo="Taxa de ocupação da agenda"
              valor={prod ? pct(prod.ocupacaoPct) : "—"}
              detalhe={prod ? `${int(prod.agendados)} marcação(ões) no mês` : undefined}
              ajuda="Minutos marcados sobre os minutos publicados na agenda no mês. Horário livre publicado conta na capacidade — é o que impede o indicador de passar de 100%."
            />
            <CardIndicador
              carregando={carregando}
              tom="verde"
              icone={CalendarCheck}
              titulo="Taxa de comparecimento"
              valor={prod ? pct(prod.comparecimentoPct) : "—"}
              detalhe={
                prod
                  ? `${int(prod.compareceram)} de ${int(prod.agendados)} compareceram`
                  : undefined
              }
              ajuda="Atendimentos realizados sobre os agendados do mês. Vale o que a agenda registrou como realizado ou com horário de execução preenchido."
            />
          </div>
        </PainelGrafico>

        <PainelGrafico
          titulo="Aniversariantes"
          sub={aniver ? `${int(aniver.hoje)} hoje · ${int(aniver.mes)} no mês` : undefined}
        >
          {carregando ? (
            <div className="h-[200px] animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : !aniver ? (
            <FaltaAtualizacao oQue="A contagem de aniversariantes" />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <CardIndicador
                  tom="roxo"
                  icone={CakeSlice}
                  titulo="Aniversariantes de hoje"
                  valor={int(aniver.hoje)}
                />
                <CardIndicador
                  tom="neutro"
                  icone={Users}
                  titulo="Aniversariantes do mês"
                  valor={int(aniver.mes)}
                />
              </div>
              {listaAniver.data && listaAniver.data.length > 0 ? (
                <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {listaAniver.data.map((p) => {
                    const idade = idadeEm(p.data_nascimento, hojeIso);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-1.5 text-sm"
                      >
                        <span className="min-w-0 break-words">{p.nome}</span>
                        {idade != null && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {idade} anos
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum paciente faz aniversário hoje.
                </p>
              )}
            </div>
          )}
        </PainelGrafico>
      </div>
    </Bloco>
  );
}

// ===========================================================================
// BLOCO 3 — Gestão do Cartão Benefícios
// ===========================================================================

export function BlocoCartaoBeneficios({
  dados,
  carregando,
}: {
  dados: DashboardBlocos | undefined;
  carregando: boolean;
}) {
  const ct = dados?.contratos ?? null;
  const ms = dados?.mensalidades ?? null;
  const mesIso = dados?.mes.ini ?? "";

  return (
    <Bloco
      titulo="Gestão do Cartão Benefícios"
      periodo={mesIso ? `Mês de ${nomeDoMes(mesIso)}` : "Mês corrente"}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <CardIndicador
          carregando={carregando}
          tom="azul"
          icone={UserPlus}
          titulo="Novas adesões"
          valor={ct ? int(ct.novos) : "—"}
          detalhe={ct ? money(ct.novosValor) : undefined}
          ajuda="Contratos cujo INÍCIO de vigência cai neste mês. Não é o mesmo que vendidos no mês: contrato cadastrado agora com início retroativo não entra."
        />
        <CardIndicador
          carregando={carregando}
          tom="verde"
          icone={PiggyBank}
          titulo="Contratos em dia"
          valor={ms ? int(ms.pagas) : "—"}
          detalhe={ms ? money(ms.pagasValor) : undefined}
          ajuda="Parcelas com vencimento neste mês que já foram quitadas. Não é o dinheiro recebido no mês: quem pagou em atraso uma parcela de outro mês entra no mês do vencimento dela."
        />
        <CardIndicador
          carregando={carregando}
          tom="ambar"
          icone={CalendarCheck}
          titulo="A vencer no mês"
          valor={ms ? int(ms.aVencer) : "—"}
          detalhe={ms ? money(ms.aVencerValor) : undefined}
          ajuda={`Parcelas deste mês ainda em aberto que não bloqueiam o cartão: as que ainda não venceram e as vencidas há até ${DIAS_TOLERANCIA_MENSALIDADE} dias, que ainda estão na tolerância.`}
        />
        <CardIndicador
          carregando={carregando}
          tom="vermelho"
          icone={AlertTriangle}
          titulo="Em atraso / cobrança"
          valor={ms ? int(ms.atrasadas) : "—"}
          detalhe={ms ? `${money(ms.atrasadasValor)} · ${pct(ms.inadimplenciaPct)}` : undefined}
          ajuda={`Parcelas deste mês vencidas há mais de ${DIAS_TOLERANCIA_MENSALIDADE} dias. É a mesma régua que faz o paciente ser atendido como Particular no balcão.`}
        />
        <CardIndicador
          carregando={carregando}
          tom="neutro"
          icone={Ban}
          titulo="Cancelados / inativos"
          valor={ct ? int(ct.inativos) : "—"}
          detalhe="Fora de uso"
          ajuda="Contratos cancelados, inativos ou encerrados. Não entram na receita prevista nem na inadimplência."
        />
        <CardIndicador
          carregando={carregando}
          tom="roxo"
          icone={TrendingUp}
          titulo="Ticket médio por contrato"
          valor={ct ? money(ct.ticketMedio) : "—"}
          detalhe={ct ? `${int(ct.ativos)} contrato(s) ativo(s)` : undefined}
          ajuda="Receita prevista dividida pelos contratos ativos. Só a mensalidade entra: a taxa de adesão é cobrada uma única vez, na emissão do cartão."
        />
      </div>
    </Bloco>
  );
}

/** Os três blocos na ordem, já dentro do provedor de tooltips. */
export function BlocosDashboard({
  dados,
  carregando,
  clinicaId,
  podeFin,
}: {
  dados: DashboardBlocos | undefined;
  carregando: boolean;
  clinicaId: string | null | undefined;
  podeFin: boolean;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8">
        <BlocoTopoExecutivo dados={dados} carregando={carregando} podeFin={podeFin} />
        <BlocoVisaoClinica
          dados={dados}
          carregando={carregando}
          clinicaId={clinicaId}
          podeFin={podeFin}
        />
        <BlocoCartaoBeneficios dados={dados} carregando={carregando} />
      </div>
    </TooltipProvider>
  );
}
