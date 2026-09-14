/**
 * Card "O que dá para melhorar" da aba Financeiro → Projeção.
 *
 * Antes era uma linha solta ("1 dia(s) bem abaixo da média · 05/09 R$ …") que
 * não dizia nem por que o dia caiu nem o que fazer. Agora são quatro frentes,
 * cada uma com selo e ícone próprio:
 *
 *  - Alerta de queda: dia abaixo do normal do MESMO dia da semana, com os
 *    motivos (especialidades, médicos sem agenda, faltas, cancelamentos,
 *    particular × Cartão, chuva).
 *  - Ociosidade: especialidades com a grade abaixo de 65% de ocupação.
 *  - Oportunidade de expansão: especialidades que lotam a grade.
 *  - Caixa: os pontos que já existiam (dias parados, despesa alta…).
 *
 * As contas vivem em `@/lib/financeiro/projecao-melhorias` e
 * `@/lib/financeiro/projecao-agenda`, com teste.
 */
import { useState } from "react";
import {
  AlertTriangle,
  CalendarX,
  ChevronDown,
  CloudRain,
  Rocket,
  TrendingDown,
  UserX,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Diagnostico } from "@/lib/financeiro/projecao-agenda";
import {
  LIMIAR_OCIOSA,
  type DiaComQueda,
  type OciosidadeOportunidade,
  type ResultadoQuedas,
} from "@/lib/financeiro/projecao-melhorias";
import type { PontoAtencao } from "@/lib/financeiro/projecao";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nomeDia = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

type Tom = "red" | "amber" | "green" | "slate";
const TOM: Record<Tom, { chip: string; icone: string; borda: string }> = {
  red: {
    chip: "bg-red-500/10 text-red-700 dark:text-red-400",
    icone: "text-red-600",
    borda: "border-red-200 dark:border-red-900",
  },
  amber: {
    chip: "bg-amber-500/10 text-amber-800 dark:text-amber-400",
    icone: "text-amber-600",
    borda: "border-amber-200 dark:border-amber-900",
  },
  green: {
    chip: "bg-green-500/10 text-green-700 dark:text-green-400",
    icone: "text-green-600",
    borda: "border-green-200 dark:border-green-900",
  },
  slate: {
    chip: "bg-muted text-foreground",
    icone: "text-muted-foreground",
    borda: "border-border",
  },
};

function Selo({
  icon: Icon,
  tom,
  rotulo,
  qtd,
}: {
  icon: typeof Wallet;
  tom: Tom;
  rotulo: string;
  qtd: number;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TOM[tom].chip} ${qtd === 0 ? "opacity-50" : ""}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {rotulo}
      <span className="tabular-nums font-semibold">{qtd}</span>
    </span>
  );
}

function Secao({
  icon: Icon,
  tom,
  titulo,
  subtitulo,
  children,
}: {
  icon: typeof Wallet;
  tom: Tom;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className={`h-4 w-4 ${TOM[tom].icone}`} />
          {titulo}
        </h3>
        {subtitulo && <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>}
      </div>
      {children}
    </section>
  );
}

interface Props {
  carregando: boolean;
  erro: boolean;
  quedas: ResultadoQuedas | null;
  ocupacao: OciosidadeOportunidade | null;
  /** Diagnóstico mensal por especialidade (queda de procura, alta, faltas). */
  especialidades: Diagnostico[];
  pontosCaixa: PontoAtencao[];
}

export function CardMelhorias({
  carregando,
  erro,
  quedas,
  ocupacao,
  especialidades,
  pontosCaixa,
}: Props) {
  const [verTodasOciosas, setVerTodasOciosas] = useState(false);

  const emQueda = especialidades.filter((d) => d.id.startsWith("queda-"));
  const emAlta = especialidades.filter((d) => d.id.startsWith("alta-"));
  const faltas = especialidades.filter((d) => d.id.startsWith("faltas-"));
  const ociosas = ocupacao?.ociosas ?? [];
  const oportunidades = ocupacao?.oportunidades ?? [];
  const listaOciosas = verTodasOciosas ? ociosas : ociosas.slice(0, 6);

  const qtdQueda = (quedas?.quedas.length ?? 0) + emQueda.length;
  const qtdOciosa = ociosas.length + faltas.length;
  const qtdExpansao = oportunidades.length + emAlta.length;

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />O que dá para melhorar
          </h2>
          <div className="flex flex-wrap gap-2">
            <Selo icon={TrendingDown} tom="red" rotulo="Alerta de queda" qtd={qtdQueda} />
            <Selo icon={CalendarX} tom="amber" rotulo="Ociosidade" qtd={qtdOciosa} />
            <Selo icon={Rocket} tom="green" rotulo="Oportunidade de expansão" qtd={qtdExpansao} />
            <Selo icon={Wallet} tom="slate" rotulo="Caixa" qtd={pontosCaixa.length} />
          </div>
        </div>

        {erro && (
          <p className="text-sm text-amber-700">
            Parte do diagnóstico não carregou. Se esta tela acabou de ser publicada, as consultas
            novas do banco podem ainda não ter sido aplicadas.
          </p>
        )}

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando diagnóstico...</p>
        ) : (
          <>
            {/* 1. ALERTA DE QUEDA */}
            <Secao
              icon={TrendingDown}
              tom="red"
              titulo="Alerta de queda"
              subtitulo="Dias deste mês com faturamento abaixo de 80% do normal do mesmo dia da semana — sábado é comparado com sábado, porque é meio expediente."
            >
              {quedas && quedas.quedas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum dia deste mês ficou abaixo do normal do próprio dia da semana.
                </p>
              ) : (
                <div className="space-y-2">
                  {quedas?.quedas.slice(0, 5).map((q) => (
                    <DiaQueda key={q.dia} q={q} />
                  ))}
                </div>
              )}
              {quedas && quedas.atipicos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Quase sem movimento no sistema (feriado, clínica fechada ou recepção no sistema
                  antigo), fora da análise:{" "}
                  {quedas.atipicos.map((a) => `${ddmm(a.dia)} (${brl(a.receita)})`).join(", ")}.
                </p>
              )}
              {emQueda.length > 0 && (
                <ItensDiagnostico
                  titulo="Especialidades com procura em queda no mês"
                  itens={emQueda}
                  tom="red"
                />
              )}
            </Secao>

            {/* 2. OCIOSIDADE */}
            <Secao
              icon={CalendarX}
              tom="amber"
              titulo="Ociosidade"
              subtitulo={`Especialidades com menos de ${LIMIAR_OCIOSA}% da grade ocupada no mês, das que mais sobram vagas para as que menos.`}
            >
              {ociosas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma especialidade com a agenda sobrando.
                </p>
              ) : (
                <>
                  <div className={`rounded-lg border ${TOM.amber.borda} p-3 text-sm`}>
                    <p className="font-medium">Ação recomendada</p>
                    <p className="text-muted-foreground">
                      Reforçar a captação (divulgação da especialidade, contato com pacientes que já
                      passaram por ela) e confirmar os marcados na véspera. Se continuar ociosa por
                      dois meses, reduzir a grade oferecida.
                    </p>
                  </div>
                  <ul className="divide-y">
                    {listaOciosas.map((o) => (
                      <li
                        key={o.especialidade}
                        className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                      >
                        <span className="font-medium text-sm min-w-40 flex-1">
                          {o.especialidade}
                        </span>
                        <BarraOcupacao valor={o.ocupacao} />
                        <span className="text-xs text-muted-foreground tabular-nums w-32 text-right">
                          {num(o.vagasLivres)} vagas livres
                        </span>
                      </li>
                    ))}
                  </ul>
                  {ociosas.length > 6 && (
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => setVerTodasOciosas((v) => !v)}
                    >
                      {verTodasOciosas
                        ? "Mostrar só as 6 maiores"
                        : `Ver todas as ${ociosas.length}`}
                    </button>
                  )}
                </>
              )}
              {faltas.length > 0 && (
                <ItensDiagnostico
                  titulo="Faltas altas — vaga marcada que fica vazia"
                  itens={faltas}
                  tom="amber"
                  icone={UserX}
                />
              )}
            </Secao>

            {/* 3. OPORTUNIDADE DE EXPANSÃO */}
            <Secao
              icon={Rocket}
              tom="green"
              titulo="Oportunidade de expansão"
              subtitulo="Especialidades com a grade quase cheia ou que lotaram por completo várias vezes no mês — sinal de procura maior que a oferta."
            >
              {oportunidades.length === 0 && emAlta.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma especialidade lotando a agenda neste mês.
                </p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {oportunidades.map((o) => (
                    <li
                      key={o.especialidade}
                      className={`rounded-lg border ${TOM.green.borda} p-3 space-y-1`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{o.especialidade}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${TOM.green.chip}`}
                        >
                          {num(o.ocupacao)}% ocupada
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {o.diasLotados > 0
                          ? `A grade encheu por completo ${o.diasLotados} vez(es) em ${o.agendasDia} agenda(s)-dia.`
                          : `${num(o.marcados)} de ${num(o.vagas)} vagas ocupadas.`}
                        {o.medicosLotados.length > 0 &&
                          ` Lotou com: ${o.medicosLotados
                            .slice(0, 3)
                            .map((m) => `${m.nome} (${m.dias}×)`)
                            .join(", ")}.`}
                      </p>
                      <p className="text-xs">
                        <span className="font-medium">Ação:</span> abrir mais horários para esses
                        profissionais ou trazer outro médico da especialidade.
                      </p>
                    </li>
                  ))}
                  {emAlta.map((d) => (
                    <li key={d.id} className={`rounded-lg border ${TOM.green.borda} p-3 space-y-1`}>
                      <p className="font-medium text-sm text-green-700 dark:text-green-400">
                        {d.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">{d.acao}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            {/* 4. CAIXA */}
            {pontosCaixa.length > 0 && (
              <Secao icon={Wallet} tom="slate" titulo="Caixa">
                <ul className="space-y-2">
                  {pontosCaixa.map((p) => (
                    <li key={p.id} className="rounded-lg border p-3">
                      <p
                        className={
                          p.gravidade === "alta"
                            ? "font-medium text-sm text-red-600"
                            : p.gravidade === "media"
                              ? "font-medium text-sm text-amber-700"
                              : "font-medium text-sm"
                        }
                      >
                        {p.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.detalhe}</p>
                    </li>
                  ))}
                </ul>
              </Secao>
            )}

            <p className="text-xs text-muted-foreground">
              Ocupação e faltas contam só as marcações feitas neste sistema; agenda por ordem de
              chegada fica de fora.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BarraOcupacao({ valor }: { valor: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-2 w-32 rounded-full bg-muted overflow-hidden" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
          style={{ width: `${Math.min(valor, 100)}%` }}
        />
        <span
          className="absolute inset-y-0 w-px bg-foreground/50"
          style={{ left: `${LIMIAR_OCIOSA}%` }}
        />
      </span>
      <span className="text-xs tabular-nums w-10">{num(valor)}%</span>
    </span>
  );
}

function ItensDiagnostico({
  titulo,
  itens,
  tom,
  icone: Icon = AlertTriangle,
}: {
  titulo: string;
  itens: Diagnostico[];
  tom: Tom;
  icone?: typeof Wallet;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {itens.map((d) => (
          <li key={d.id} className={`rounded-lg border ${TOM[tom].borda} p-3`}>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 shrink-0 ${TOM[tom].icone}`} />
              {d.titulo}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{d.acao}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiaQueda({ q }: { q: DiaComQueda }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={`rounded-lg border ${TOM.red.borda}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full text-left p-3 flex items-start justify-between gap-3"
        aria-expanded={aberto}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">
            <span className="capitalize">{nomeDia(q.dia)}</span> {ddmm(q.dia)} ·{" "}
            <span className="tabular-nums">{brl(q.receita)}</span>{" "}
            <span className="text-red-600 tabular-nums">{num(q.queda)}% abaixo do normal</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Normal de {nomeDia(q.dia)}: {brl(q.normal)} (mediana de {q.base} {nomeDia(q.dia)}s
            anteriores)
          </p>
          <ul className="list-disc pl-4 text-sm space-y-0.5">
            {q.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 mt-1 text-muted-foreground ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto && (
        <div className="border-t p-3 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Especialidades que mais caíram
            </p>
            {q.especialidades.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma queda concentrada.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal py-0.5"></th>
                    <th className="text-right font-normal">Normal</th>
                    <th className="text-right font-normal">No dia</th>
                  </tr>
                </thead>
                <tbody>
                  {q.especialidades.map((e) => (
                    <tr key={e.nome}>
                      <td className="py-0.5 pr-2">{e.nome}</td>
                      <td className="text-right tabular-nums">{brl(e.normal)}</td>
                      <td className="text-right tabular-nums text-red-600">{brl(e.noDia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Médicos</p>
            {q.medicos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum médico com queda relevante.</p>
            ) : (
              <ul className="space-y-1">
                {q.medicos.map((m) => (
                  <li key={m.nome} className="text-xs flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{m.nome}</span>
                    <span className="text-muted-foreground">{m.especialidade}</span>
                    <span className="tabular-nums text-red-600">{brl(m.diferenca)}</span>
                    {m.ausente && m.agenda === "sem_agenda" && (
                      <span className={`rounded px-1.5 py-0.5 ${TOM.red.chip}`}>sem agenda</span>
                    )}
                    {m.agenda === "agenda_vazia" && (
                      <span className={`rounded px-1.5 py-0.5 ${TOM.amber.chip}`}>
                        agenda vazia
                      </span>
                    )}
                    {m.ausente && m.agenda === "normal" && (
                      <span className={`rounded px-1.5 py-0.5 ${TOM.amber.chip}`}>não faturou</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Agenda e modalidade</p>
            <dl className="text-xs space-y-1">
              {q.faltas && (
                <Linha
                  rotulo="Faltas"
                  noDia={`${num(q.faltas.noDia)}%`}
                  normal={`${num(q.faltas.normal)}%`}
                  ruim={q.faltas.noDia > q.faltas.normal + 5}
                />
              )}
              {q.cancelados && (
                <Linha
                  rotulo="Cancelamentos"
                  noDia={num(q.cancelados.noDia)}
                  normal={num(q.cancelados.normal)}
                  ruim={q.cancelados.noDia > q.cancelados.normal * 2 && q.cancelados.noDia >= 3}
                />
              )}
              <Linha
                rotulo="Particular (atend.)"
                noDia={num(q.particular.noDia)}
                normal={num(q.particular.normal)}
                ruim={q.particular.variacao <= -20}
              />
              <Linha
                rotulo="Cartão (atend.)"
                noDia={num(q.cartao.noDia)}
                normal={num(q.cartao.normal)}
                ruim={q.cartao.variacao <= -20}
              />
              {(q.tempo === "chuva" || q.tempo === "tempestade") && (
                <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400">
                  <CloudRain className="h-3.5 w-3.5" />
                  {q.tempo === "tempestade" ? "Chuva forte no dia" : "Chuva no dia"}
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({
  rotulo,
  noDia,
  normal,
  ruim,
}: {
  rotulo: string;
  noDia: string;
  normal: string;
  ruim: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular-nums">
        <span className={ruim ? "text-red-600 font-medium" : ""}>{noDia}</span>
        <span className="text-muted-foreground"> · normal {normal}</span>
      </dd>
    </div>
  );
}
