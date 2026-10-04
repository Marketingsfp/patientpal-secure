import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  MessagesSquare,
  Search,
  Users,
} from "lucide-react";
import type { carregarResumoDashboardOsZap } from "@/lib/atendimento/dashboard-oszap.server";
import {
  agruparDiasDashboard,
  agrupamentosDashboard,
  extremosVolume,
  periodoAnterior,
  periodoDashboardSchema,
  periodoPadraoDashboard,
  type AgrupamentoDashboard,
  type PeriodoDashboard,
} from "@/lib/atendimento/dashboard-oszap-periodos";
import { formatDatePura, hojeBR } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";

type Resumo = Awaited<ReturnType<typeof carregarResumoDashboardOsZap>>;
const numero = (n: number | undefined | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const intervalo = (p: PeriodoDashboard) =>
  p.de === p.ate ? formatDatePura(p.de) : `${formatDatePura(p.de)} a ${formatDatePura(p.ate)}`;
const tempo = (n: number | undefined | null) =>
  n == null
    ? "Sem medição"
    : n < 60
      ? `${n} s`
      : n < 3600
        ? `${Math.round(n / 60)} min`
        : `${(n / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const campo =
  "h-9 min-w-0 rounded-lg border border-atd-border bg-atd-surface px-3 text-sm text-atd-ink";
function Indicador({
  nome,
  valor,
  ajuda,
  icon,
}: {
  nome: string;
  valor: string;
  ajuda: string;
  icon?: ReactNode;
}) {
  return (
    <div className="oszap-dash-kpi">
      <div className="flex items-center justify-between gap-2 text-xs text-atd-ink-soft">
        {nome}
        {icon}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-atd-ink-soft">{ajuda}</p>
    </div>
  );
}
function Secao({
  titulo,
  descricao,
  children,
  icon,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <section className="oszap-dash-section min-w-0" aria-label={titulo}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {titulo}
      </h2>
      <p className="mb-5 mt-1 text-xs leading-relaxed text-atd-ink-soft">{descricao}</p>
      {children}
    </section>
  );
}
function Destaques({ linhas }: { linhas: { nome: string; total: number }[] }) {
  const extremos = extremosVolume(linhas);
  if (!extremos)
    return (
      <p className="my-3 text-sm text-atd-ink-soft">Sem movimento registrado neste período.</p>
    );
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      {[
        { titulo: "Maior volume", linhas: extremos.maiores },
        { titulo: "Menor volume", linhas: extremos.menores },
      ].map((g) => (
        <div key={g.titulo} className="rounded-lg border border-atd-border bg-atd-surface-2 p-3">
          <p className="text-xs text-atd-ink-soft">{g.titulo}</p>
          <p className="mt-1 font-semibold">{numero(g.linhas[0].total)} mensagens</p>
          <p className="mt-1 text-xs" title={g.linhas.map((l) => l.nome).join(" · ")}>
            {g.linhas
              .slice(0, 4)
              .map((l) => l.nome)
              .join(" · ")}
            {g.linhas.length > 4 ? ` · e mais ${g.linhas.length - 4}` : ""}
            {g.linhas.length > 1 ? " (empate)" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
function TabelaPeriodos({
  linhas,
  detalhar,
}: {
  linhas: ReturnType<typeof agruparDiasDashboard>;
  detalhar: (p: PeriodoDashboard) => void;
}) {
  const [pagina, setPagina] = useState(0);
  const max = Math.max(1, ...linhas.map((l) => l.total));
  const paginas = Math.max(1, Math.ceil(linhas.length / 50));
  return (
    <>
      <div className="overflow-x-auto">
        <table className="oszap-dash-table">
          <caption className="sr-only">Volume e resultados por período</caption>
          <thead>
            <tr>
              {[
                "Período",
                "Recebidas",
                "Enviadas",
                "Total",
                "Encerramentos",
                "Transferências",
                "",
              ].map((t, i) => (
                <th key={i} scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.slice(pagina * 50, pagina * 50 + 50).map((l) => (
              <tr key={l.de}>
                <th scope="row" className="min-w-40">
                  <span className="text-atd-ink">{intervalo(l)}</span>
                  {l.parcial && (
                    <span className="mt-1 block text-[11px]">Recorte de {l.dias} dia(s)</span>
                  )}
                  <div className="mt-2 h-1 rounded bg-atd-surface-2">
                    <div
                      className="h-full rounded bg-atd-blue"
                      style={{ width: `${(l.total / max) * 100}%` }}
                    />
                  </div>
                </th>
                <td>{numero(l.recebidas)}</td>
                <td>{numero(l.enviadas)}</td>
                <td className="font-semibold">{numero(l.total)}</td>
                <td>{numero(l.encerradas)}</td>
                <td>{numero(l.transferencias)}</td>
                <td>
                  <button
                    type="button"
                    className="oszap-dash-link rounded px-2 py-1 underline"
                    onClick={() => detalhar({ de: l.de, ate: l.ate })}
                    aria-label={`Detalhar ${intervalo(l)}`}
                  >
                    Detalhar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total do intervalo</th>
              {["recebidas", "enviadas", "total", "encerradas", "transferencias"].map((chave) => (
                <td className="font-semibold" key={chave}>
                  {numero(linhas.reduce((n, l) => n + l[chave as "total"], 0))}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {paginas > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            Página {pagina + 1} de {paginas} · {linhas.length} períodos
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagina + 1 === paginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function DashboardOsZapView({
  resumo,
  periodo,
  agrupamento,
  onAgrupamento,
  consultar,
  clinica,
  atualizando,
  erro,
}: {
  resumo?: Resumo;
  periodo: PeriodoDashboard;
  agrupamento: AgrupamentoDashboard;
  onAgrupamento: (v: AgrupamentoDashboard) => void;
  consultar: (v: PeriodoDashboard) => void;
  clinica: string;
  atualizando: boolean;
  erro?: string;
}) {
  const [rascunho, setRascunho] = useState(periodo);
  const [atalho, setAtalho] = useState("30");
  const [erroData, setErroData] = useState<string>();
  const grupos = useMemo(
    () => (resumo ? agruparDiasDashboard(resumo.porDia, resumo.periodo, agrupamento) : []),
    [resumo, agrupamento],
  );
  const horas = resumo?.mensagens.porHora ?? [];
  const turnos = [
    "Madrugada · 00h–06h",
    "Manhã · 06h–12h",
    "Tarde · 12h–18h",
    "Noite · 18h–24h",
  ].map((nome, i) => {
    const h = horas.filter((h) => h.hora >= i * 6 && h.hora < i * 6 + 6);
    return {
      nome,
      recebidas: h.reduce((n, h) => n + h.recebidas, 0),
      enviadas: h.reduce((n, h) => n + h.enviadas, 0),
      total: h.reduce((n, h) => n + h.total, 0),
    };
  });
  const maxHora = Math.max(1, ...horas.map((h) => h.total));
  function pesquisar(p: PeriodoDashboard) {
    const resultado = periodoDashboardSchema.safeParse(p);
    if (!resultado.success) {
      setErroData(resultado.error.issues[0].message);
      return;
    }
    setErroData(undefined);
    consultar(resultado.data);
  }
  return (
    <div className="oszap-dashboard space-y-5 text-atd-ink" aria-busy={atualizando}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-atd-ink-soft">
            OS ZAP · {clinica}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios de atendimento</h1>
          <p className="mt-1 text-sm text-atd-ink-soft">
            Histórico do atendimento humano, organizado por data.
          </p>
        </div>
        <span className="rounded-full border border-atd-border px-3 py-1 text-xs">
          Consulta histórica
        </span>
      </header>
      <form
        className="oszap-dash-section"
        aria-label="Pesquisar relatório por data"
        onSubmit={(e) => {
          e.preventDefault();
          pesquisar(rascunho);
        }}
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
          <label className="grid gap-1 text-xs">
            Período rápido
            <select
              aria-label="Período rápido"
              className={campo}
              value={atalho}
              onChange={(e) => {
                const v = e.target.value;
                setAtalho(v);
                if (v === "30") setRascunho(periodoPadraoDashboard());
                else if (v !== "personalizado") {
                  setRascunho(periodoAnterior(v as AgrupamentoDashboard));
                  onAgrupamento(v as AgrupamentoDashboard);
                }
              }}
            >
              <option value="30">Últimos 30 dias completos</option>
              <option value="dia">Ontem</option>
              <option value="semana">Semana passada</option>
              <option value="mes">Mês passado</option>
              <option value="bimestre">Bimestre anterior</option>
              <option value="trimestre">Trimestre anterior</option>
              <option value="ano">Ano anterior</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Data inicial
            <input
              type="date"
              required
              className={campo}
              value={rascunho.de}
              max={hojeBR()}
              onChange={(e) => {
                setAtalho("personalizado");
                setRascunho((p) => ({ ...p, de: e.target.value }));
              }}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Data final
            <input
              type="date"
              required
              className={campo}
              value={rascunho.ate}
              max={hojeBR()}
              onChange={(e) => {
                setAtalho("personalizado");
                setRascunho((p) => ({ ...p, ate: e.target.value }));
              }}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Agrupar por
            <select
              aria-label="Agrupar por"
              className={campo}
              value={agrupamento}
              onChange={(e) => onAgrupamento(e.target.value as AgrupamentoDashboard)}
            >
              {Object.entries(agrupamentosDashboard).map(([valor, rotulo]) => (
                <option value={valor} key={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={atualizando} size="sm" className="h-9">
            <Search className="size-4" />
            {atualizando ? "Consultando…" : "Consultar"}
          </Button>
        </div>
        {erroData && (
          <p role="alert" className="mt-3 text-sm text-atd-danger-ink">
            {erroData}
          </p>
        )}
        <p className="mt-3 text-xs text-atd-ink-soft">
          Horário de Brasília. Sem atualização automática. Semanas de segunda a domingo; bimestres e
          trimestres seguem o calendário.
        </p>
      </form>
      {erro && (
        <p
          role="alert"
          className="rounded-lg border border-atd-warn bg-atd-warn-bg p-3 text-sm text-atd-warn-ink"
        >
          {erro}
          {resumo
            ? " O relatório abaixo é da última consulta concluída, não desta tentativa."
            : " Nenhum total foi calculado para esta consulta."}
        </p>
      )}
      {!resumo ? (
        <p role="status" className="p-5 text-sm">
          {atualizando
            ? "Consultando o histórico completo do período…"
            : "Selecione o período e consulte o relatório."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="font-semibold">Período consultado: {intervalo(resumo.periodo)}</p>
            <p className="text-atd-ink-soft">
              Consulta concluída em{" "}
              {new Date(resumo.atualizadoEm).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </p>
          </div>
          {resumo.periodo.ate === hojeBR() && (
            <p className="text-xs text-atd-ink-soft">
              O dia de hoje está incompleto: inclui somente os registros disponíveis no momento da
              consulta.
            </p>
          )}
          {resumo.avisos.length > 0 && (
            <div
              role="status"
              className="rounded-lg border border-atd-warn bg-atd-warn-bg p-3 text-sm text-atd-warn-ink"
            >
              {resumo.avisos.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              nome="Mensagens recebidas"
              valor={numero(resumo.mensagens.recebidas)}
              ajuda="Dos pacientes, durante a etapa humana"
              icon={<ArrowDownLeft className="size-4" />}
            />
            <Indicador
              nome="Mensagens enviadas"
              valor={numero(resumo.mensagens.enviadas)}
              ajuda="Respostas da equipe com envio confirmado"
              icon={<ArrowUpRight className="size-4" />}
            />
            <Indicador
              nome="Volume total"
              valor={numero(resumo.mensagens.total)}
              ajuda="Recebidas + enviadas no intervalo"
              icon={<MessagesSquare className="size-4" />}
            />
            <Indicador
              nome="Atendimentos encerrados"
              valor={numero(resumo.encerramentos.total)}
              ajuda="Encerramentos feitos por pessoas no período"
              icon={<CalendarDays className="size-4" />}
            />
          </div>
          <Secao
            titulo="Volume por período"
            descricao="Compare o movimento e os resultados. Detalhar abre os horários do intervalo escolhido. Dias sem mensagens contam como zero; os recortes incompletos estão identificados."
            icon={<BarChart3 className="size-4" />}
          >
            <Destaques linhas={grupos.map((g) => ({ nome: intervalo(g), total: g.total }))} />
            <TabelaPeriodos
              key={`${resumo.atualizadoEm}:${resumo.periodo.de}:${resumo.periodo.ate}:${agrupamento}`}
              linhas={grupos}
              detalhar={(p) => {
                setRascunho(p);
                setAtalho("personalizado");
                pesquisar(p);
              }}
            />
          </Secao>
          <Secao
            titulo="Movimento ao longo do dia"
            descricao={`Soma das mensagens em cada horário, entre ${intervalo(resumo.periodo)}. Inclui todas as 24 horas, sem presumir o horário de funcionamento.`}
            icon={<Clock3 className="size-4" />}
          >
            <Destaques linhas={turnos} />
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {turnos.map((t) => (
                <div className="rounded-lg border border-atd-border p-3" key={t.nome}>
                  <p className="text-xs text-atd-ink-soft">{t.nome}</p>
                  <p className="my-1 text-xl font-semibold">{numero(t.total)}</p>
                  <p className="text-xs">
                    {numero(t.recebidas)} recebidas · {numero(t.enviadas)} enviadas
                  </p>
                </div>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-4 text-xs">
              <span>
                <span className="mr-1 inline-block size-2 rounded bg-sky-600 dark:bg-sky-400" />
                Recebidas
              </span>
              <span>
                <span className="mr-1 inline-block size-2 rounded bg-primary" />
                Enviadas
              </span>
            </div>
            <div className="overflow-x-auto pb-3">
              <div
                className="grid h-44 min-w-[560px] grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-2"
                role="img"
                aria-label="Volume recebido e enviado por hora; valores disponíveis na tabela abaixo"
              >
                {horas.map((h) => (
                  <div
                    key={h.hora}
                    className="flex h-full flex-col justify-end gap-1 text-center"
                    title={`${h.hora}h: ${h.recebidas} recebidas, ${h.enviadas} enviadas, ${h.total} no total`}
                  >
                    <div
                      className="flex min-h-0 flex-col justify-end"
                      style={{ height: `${(h.total / maxHora) * 85}%` }}
                    >
                      <div
                        className="bg-primary"
                        style={{ height: `${h.total ? (h.enviadas / h.total) * 100 : 0}%` }}
                      />
                      <div
                        className="bg-sky-600 dark:bg-sky-400"
                        style={{ height: `${h.total ? (h.recebidas / h.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-atd-ink-soft">{h.hora}h</span>
                  </div>
                ))}
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Ver os números por hora
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="oszap-dash-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Recebidas</th>
                      <th>Enviadas</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horas.map((h) => (
                      <tr key={h.hora}>
                        <th scope="row">
                          {String(h.hora).padStart(2, "0")}:00–{String(h.hora).padStart(2, "0")}:59
                        </th>
                        <td>{numero(h.recebidas)}</td>
                        <td>{numero(h.enviadas)}</td>
                        <td>{numero(h.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Secao>
          <Secao
            titulo="Resultados do atendimento"
            descricao="Medições reconstruídas a partir dos registros do atendimento humano, dentro do período consultado."
            icon={<CalendarDays className="size-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Indicador
                nome="Conversas respondidas"
                valor={numero(resumo.mensagens.conversasRespondidas)}
                ajuda="Conversas únicas com resposta humana enviada"
              />
              <Indicador
                nome="Transferências manuais"
                valor={numero(resumo.transferencias.total)}
                ajuda="Mudanças registradas com autor humano"
              />
              <Indicador
                nome="Primeira resposta"
                valor={tempo(resumo.primeiraResposta.mediaSeg)}
                ajuda={`Média desde a entrada humana registrada · ${numero(resumo.primeiraResposta.medidas)} medições`}
              />
              <Indicador
                nome="Tempo até encerrar"
                valor={tempo(resumo.encerramentos.duracaoMediaSeg)}
                ajuda={`Média desde a entrada humana registrada · ${numero(resumo.encerramentos.duracoesMedidas)} medições`}
              />
            </div>
            <p className="mt-4 text-xs text-atd-ink-soft">
              Envios que falharam: {numero(resumo.mensagens.falhas)} · Sem confirmação de envio:{" "}
              {numero(resumo.mensagens.outrosEstados)}. Esses registros não entram no volume
              enviado.
            </p>
          </Secao>
          <Secao
            titulo="Resultados por pessoa"
            descricao="Cada ação pertence a quem a executou, incluindo encerramentos feitos pela supervisão. Não depende de quem está responsável pela conversa hoje."
            icon={<Users className="size-4" />}
          >
            {resumo.pessoas.length ? (
              <div className="overflow-x-auto">
                <table className="oszap-dash-table">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Mensagens enviadas</th>
                      <th>Encerramentos</th>
                      <th>Transferências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.pessoas.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{p.nome}</th>
                        <td>{numero(p.mensagens)}</td>
                        <td>{numero(p.encerradas)}</td>
                        <td>{numero(p.transferencias)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-atd-ink-soft">
                Nenhuma ação humana com autoria identificada neste período.
              </p>
            )}
            {resumo.mensagens.semAutora > 0 && (
              <p className="mt-3 text-xs">
                {numero(resumo.mensagens.semAutora)} mensagens humanas sem identificação da autora
                entram no total, sem atribuição a uma pessoa.
              </p>
            )}
          </Secao>
          <footer className="rounded-lg border border-atd-border p-4 text-xs leading-relaxed text-atd-ink-soft">
            Como contamos: mensagens recebidas após um registro de entrada na fila humana ou
            atribuição, até o encerramento ou saída dessa etapa; respostas enviadas pela equipe;
            eventos de encerramento e transferência com autoria humana. Uma conversa pode ter mais
            de um encerramento no período. Reabrir não apaga os resultados anteriores. Avisos
            automáticos e conversas de teste não entram. Os tempos são calculados apenas quando o
            começo da etapa foi registrado; históricos incompletos podem limitar as medições.
          </footer>
        </>
      )}
    </div>
  );
}
