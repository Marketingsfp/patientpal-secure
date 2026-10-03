import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Inbox,
  LayoutDashboard,
  RefreshCw,
  Users,
  Building2,
  ArrowLeftRight,
} from "lucide-react";
import type {
  carregarResumoDashboardOsZap,
  carregarFilaHumanaDashboard,
} from "@/lib/atendimento/dashboard-oszap.server";
import {
  faixaEsperaDesde,
  formatarEspera,
  minutosDesde,
  LIMITES_ESPERA_ATD,
} from "@/lib/atendimento/espera";
import { formatarTempoPausa } from "@/lib/atendimento/cronometro-pausa";
import { ROTULO_ESTADO_MANUAL } from "@/lib/atendimento/presenca-manual";
import { formatDatePura } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";

export type DadosDashboardOsZap = {
  resumo?: Awaited<ReturnType<typeof carregarResumoDashboardOsZap>>;
  fila?: Awaited<ReturnType<typeof carregarFilaHumanaDashboard>>;
};
const numero = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const tempo = (n: number | null | undefined) =>
  n == null ? "—" : n < 60 ? `${Math.round(n)} s` : formatarEspera(n / 60);
const dataHora = (d: string | undefined) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Aguardando consulta";
function Indicador({
  nome,
  valor,
  ajuda,
  icon,
  alerta = false,
}: {
  nome: string;
  valor: string;
  ajuda: string;
  icon?: ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className={`oszap-dash-kpi ${alerta ? "oszap-dash-critical" : ""}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-atd-ink-soft">
        <span>{nome}</span>
        {icon}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{valor}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-atd-ink-soft">{ajuda}</p>
    </div>
  );
}
function Secao({
  id,
  titulo,
  descricao,
  icon,
  children,
  acao,
}: {
  id?: string;
  titulo: string;
  descricao: string;
  icon: ReactNode;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <section id={id} className="oszap-dash-section" aria-label={titulo}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {titulo}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-atd-ink-soft">{descricao}</p>
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}
function Indisponivel() {
  return (
    <p className="rounded-lg border border-dashed border-atd-border p-4 text-sm text-atd-ink-soft">
      Dados indisponíveis ou ainda em carregamento.
    </p>
  );
}
function Barra({
  nome,
  total,
  max,
  classe = "bg-primary",
}: {
  nome: string;
  total: number;
  max: number;
  classe?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs">
        <span>{nome}</span>
        <b className="tabular-nums">{numero(total)}</b>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-atd-surface-2">
        <div
          className={`h-full rounded-full ${classe}`}
          style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (total / max) * 100)) : 0}%` }}
        />
      </div>
    </div>
  );
}
export function DashboardOsZapView({
  dados,
  dias,
  onDias,
  atualizar,
  atualizando,
  erros = {},
  agora,
  abrir,
  clinica,
}: {
  dados: DadosDashboardOsZap;
  dias: 7 | 30 | 90;
  onDias: (d: 7 | 30 | 90) => void;
  atualizar: () => void;
  atualizando: boolean;
  erros?: { resumo?: string; fila?: string };
  agora: number;
  abrir: (aba: string) => void;
  clinica: string;
}) {
  const { resumo: r, fila: f } = dados;
  const faixas = { normal: 0, atencao: 0, critico: 0 };
  for (const t of f?.espera ?? []) faixas[faixaEsperaDesde(t, agora)]++;
  const maior = f?.espera.length ? Math.max(...f.espera.map((t) => minutosDesde(t, agora))) : null;
  const ir = (aba: string, texto: string) => (
    <Button
      size="sm"
      variant="ghost"
      className="oszap-dash-link h-8 gap-1 text-xs"
      onClick={() => abrir(aba)}
    >
      {texto}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Button>
  );
  const parciais = [r?.mensagens, r?.encerramentos, r?.primeiraResposta, r?.transferencias].some(
    (q) => q?.parcial,
  );
  return (
    <div className="oszap-dashboard space-y-5 text-atd-ink">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-atd-ink-soft">
            OS ZAP · {clinica}
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <LayoutDashboard className="h-6 w-6" />
            Dashboard de atendimento
          </h1>
          <p className="mt-1 text-sm text-atd-ink-soft">
            Fila, equipe e resultados do atendimento humano.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs" htmlFor="oszap-dash-periodo">
            Resultados por período
          </label>
          <select
            id="oszap-dash-periodo"
            className="h-9 rounded-lg border border-atd-border bg-atd-surface px-2 text-xs"
            value={dias}
            onChange={(e) => onDias(Number(e.target.value) as 7 | 30 | 90)}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <Button size="sm" variant="outline" onClick={atualizar} disabled={atualizando}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${atualizando ? "animate-spin" : ""}`} />
            {atualizando ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-atd-ink-soft">
        <span className="rounded-full border border-atd-border px-2 py-1">
          ATENDIMENTO HUMANO · AMBIENTE REAL
        </span>
        <span>Fila atualizada: {dataHora(f?.atualizadoEm)}</span>
      </div>
      {erros.resumo || erros.fila || r?.avisos.length ? (
        <div role="alert" className="rounded-xl border border-atd-warn bg-atd-warn-bg p-3 text-xs">
          <b>Algumas informações não puderam ser carregadas.</b>
          <p className="mt-1">
            {[erros.resumo, erros.fila, ...(r?.avisos ?? [])].filter(Boolean).join(" ")}
          </p>
          <p className="mt-1">
            Valores sem consulta aparecem como “—”. Dados anteriores mantêm sua data de atualização.
          </p>
        </div>
      ) : null}
      {parciais && (
        <p role="status" className="rounded-lg border border-atd-warn p-3 text-xs">
          Um ou mais blocos atingiram o limite de {numero(r?.limite)} registros. Os números desses
          blocos representam uma amostra parcial do período.
        </p>
      )}
      {f && f.resolvidasHoje == null && (
        <p role="alert" className="rounded-lg border border-atd-warn p-3 text-xs">
          Não foi possível consultar os encerramentos humanos de hoje. A fila continua disponível.
        </p>
      )}
      {f?.encerramentosHojeParcial && (
        <p role="status" className="rounded-lg border border-atd-warn p-3 text-xs">
          Os encerramentos de hoje e por atendente representam uma amostra parcial.
        </p>
      )}
      {!!faixas.critico && (
        <div
          className="oszap-dash-urgency flex flex-wrap items-center justify-between gap-3"
          role="status"
        >
          <div>
            <b>{numero(faixas.critico)} conversa(s) com espera crítica</b>
            <p className="mt-1 text-xs">
              Maior espera: {formatarEspera(maior ?? 0)}. Priorize as respostas pendentes.
            </p>
          </div>
          {ir("atend-inbox", "Abrir atendimento")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador
          nome="Conversas humanas abertas"
          valor={numero(f?.emAndamento)}
          ajuda="Todas as conversas atuais sob atendimento humano"
          icon={<Inbox className="h-4 w-4" />}
        />
        <Indicador
          nome="Pacientes aguardando"
          valor={f ? numero(f.espera.length) : "—"}
          ajuda="Conversas humanas com resposta pendente"
          icon={<Clock3 className="h-4 w-4" />}
          alerta={faixas.critico > 0}
        />
        <Indicador
          nome="Sem responsável"
          valor={numero(f?.naoAtribuidas)}
          ajuda="Conversas humanas ainda não atribuídas"
          icon={<Users className="h-4 w-4" />}
          alerta={!!f?.naoAtribuidas}
        />
        <Indicador
          nome="Encerradas hoje"
          valor={numero(f?.resolvidasHoje)}
          ajuda="Encerramentos com autoria humana no dia de Brasília"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>
      <nav aria-label="Seções do dashboard" className="flex flex-wrap gap-2">
        {[
          ["fila", "Fila e equipe"],
          ["volume", "Mensagens e tempos"],
          ["resultados", "Resultados por pessoa"],
          ["departamentos", "Departamentos"],
        ].map(([id, nome]) => (
          <button
            key={id}
            type="button"
            className="rounded-full border border-atd-border px-3 py-1.5 text-xs hover:bg-atd-surface-2"
            onClick={() =>
              document
                .getElementById(`oszap-dash-${id}`)
                ?.scrollIntoView({ behavior: "instant", block: "start" })
            }
          >
            {nome}
          </button>
        ))}
      </nav>
      <div id="oszap-dash-fila" className="grid items-start gap-4 xl:grid-cols-[.9fr_1.4fr]">
        <Secao
          titulo="Pendências e tempo de espera"
          descricao="Mesmos limites e cronômetro usados no atendimento e no painel da TV."
          icon={<Clock3 className="h-4 w-4" />}
        >
          {!f ? (
            <Indisponivel />
          ) : (
            <>
              <div className="space-y-3">
                <Barra
                  nome={`Normal · menos de ${LIMITES_ESPERA_ATD.atencao} min`}
                  total={faixas.normal}
                  max={f.espera.length}
                  classe="bg-atd-ok"
                />
                <Barra
                  nome={`Atenção · ${LIMITES_ESPERA_ATD.atencao} a ${LIMITES_ESPERA_ATD.critico} min`}
                  total={faixas.atencao}
                  max={f.espera.length}
                  classe="bg-atd-warn"
                />
                <Barra
                  nome={`Crítica · acima de ${LIMITES_ESPERA_ATD.critico} min`}
                  total={faixas.critico}
                  max={f.espera.length}
                  classe="bg-atd-danger"
                />
              </div>
              <dl className="oszap-dash-facts mt-5">
                <div>
                  <dt>Maior espera atual</dt>
                  <dd>{maior === null ? "Sem espera registrada" : formatarEspera(maior)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-atd-ink-soft">
                Os tempos de resposta e encerramento aparecem abaixo, no período selecionado.
              </p>
            </>
          )}
        </Secao>
        <Secao
          titulo="Equipe de telefonia agora"
          descricao="Presença escolhida pela atendente. Administradores não entram nesta lista."
          icon={<Users className="h-4 w-4" />}
          acao={ir("tv", "Painel da TV")}
        >
          {!f ? (
            <Indisponivel />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-3 text-xs">
                <span>
                  <b>{f.atendentes.filter((p) => p.estado === "ONLINE").length}</b> online
                </span>
                <span>
                  <b>{f.atendentes.filter((p) => p.estado.startsWith("PAUSA")).length}</b> em pausa
                </span>
                <span>
                  <b>{f.atendentes.filter((p) => p.estado === "OFFLINE").length}</b> offline com
                  carga
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="oszap-dash-table">
                  <thead>
                    <tr>
                      <th>Atendente</th>
                      <th>Estado</th>
                      <th>Atribuídas</th>
                      <th>Pendentes</th>
                      <th>Críticas</th>
                      <th>Encerradas hoje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.atendentes.map((p) => (
                      <tr key={p.id}>
                        <td className="font-medium">{p.nome}</td>
                        <td>
                          <span className="whitespace-nowrap">
                            {ROTULO_ESTADO_MANUAL[p.estado]}
                          </span>
                          {p.inicioPausa && (
                            <span className="block text-[10px] text-atd-ink-soft">
                              {formatarTempoPausa(p.inicioPausa, agora)}
                            </span>
                          )}
                        </td>
                        <td>{numero(p.atribuidas)}</td>
                        <td>{numero(p.esperas.length)}</td>
                        <td>
                          {numero(
                            p.esperas.filter((t) => faixaEsperaDesde(t, agora) === "critico")
                              .length,
                          )}
                        </td>
                        <td>{numero(p.resolvidasHoje)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!f.atendentes.length && (
                <p className="p-3 text-xs text-atd-ink-soft">
                  Nenhuma atendente online, em pausa ou com carga atribuída.
                </p>
              )}
              <p className="mt-3 text-[11px] text-atd-ink-soft">
                Offline sem conversas não entra na lista de operação atual. Estar online é um estado
                manual, não uma garantia de conexão.
              </p>
            </>
          )}
        </Secao>
      </div>
      <Secao
        id="oszap-dash-volume"
        titulo="Mensagens e tempos no período"
        descricao={
          r
            ? `${formatDatePura(r.periodo.de)} a ${formatDatePura(r.periodo.ate)} · dias civis de Brasília · atualizado ${dataHora(r.atualizadoEm)}.`
            : "Resultados por período de atendimento humano."
        }
        icon={<Activity className="h-4 w-4" />}
        acao={ir("pesquisa-conversas", "Central de conversas")}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador
            nome="Respostas humanas enviadas"
            valor={numero(r?.mensagens?.enviadas)}
            ajuda="Mensagens com status enviada, entregue ou lida"
          />
          <Indicador
            nome="Conversas respondidas"
            valor={numero(r?.mensagens?.conversasRespondidas)}
            ajuda="Conversas distintas com resposta humana enviada"
          />
          <Indicador
            nome="Encerradas no período"
            valor={numero(r?.encerramentos?.total)}
            ajuda="Pela data de encerramento registrada na conversa"
          />
          <Indicador
            nome="Transferências manuais"
            valor={numero(r?.transferencias?.total)}
            ajuda="Com pessoa de origem e conversa real comprovada"
            icon={<ArrowLeftRight className="h-4 w-4" />}
          />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h3 className="mb-3 text-sm font-semibold">
              Respostas humanas por hora · período inteiro
            </h3>
            {r?.mensagens ? (
              <>
                <div
                  className="oszap-dash-hourly"
                  role="img"
                  aria-label={`Respostas humanas por hora em Brasília: ${r.mensagens.porHora.map((n, h) => `${h}h: ${n}`).join("; ")}`}
                >
                  {r.mensagens.porHora.map((n, h) => (
                    <div key={h} title={`${h}h: ${numero(n)} respostas humanas`}>
                      <div
                        className="oszap-dash-hour-bar"
                        style={{
                          height: `${n ? Math.max(3, (n / Math.max(1, ...r.mensagens!.porHora)) * 100) : 0}%`,
                        }}
                      />
                      <span>{h % 3 === 0 ? `${h}h` : ""}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-atd-ink-soft">
                  Soma das respostas humanas em cada hora, nos dias selecionados. Falhas e mensagens
                  automáticas ficam fora.
                </p>
              </>
            ) : (
              <Indisponivel />
            )}
          </div>
          <dl className="oszap-dash-facts">
            <div>
              <dt>Primeira resposta humana média</dt>
              <dd>{tempo(r?.primeiraResposta?.mediaSeg)}</dd>
            </div>
            <div>
              <dt>Conversas com primeira resposta medida</dt>
              <dd>{numero(r?.primeiraResposta?.medidas)}</dd>
            </div>
            <div>
              <dt>Tempo médio até encerrar</dt>
              <dd>{tempo(r?.encerramentos?.duracaoMediaSeg)}</dd>
            </div>
            <div>
              <dt>Encerramentos com duração medida</dt>
              <dd>{numero(r?.encerramentos?.duracoesMedidas)}</dd>
            </div>
            <div>
              <dt>Falhas registradas em mensagens humanas</dt>
              <dd>{numero(r?.mensagens?.falhas)}</dd>
            </div>
            <div>
              <dt>Mensagens em outros estados</dt>
              <dd>{numero(r?.mensagens?.outrosEstados)}</dd>
            </div>
          </dl>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-atd-ink-soft">
          A primeira resposta usa o SLA registrado quando a equipe responde. O tempo até encerrar
          começa na entrada humana registrada, ou na atribuição disponível; inclui espera e não mede
          trabalho ativo. Sem medição, o valor aparece como “—”.
        </p>
      </Secao>
      <div id="oszap-dash-resultados" className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Secao
          titulo="Resultados por pessoa"
          descricao="Mensagens atribuídas a quem escreveu e encerramentos a quem efetivamente encerrou, incluindo supervisão e administração."
          icon={<Users className="h-4 w-4" />}
        >
          {r?.pessoas && r.mensagens && r.encerramentos ? (
            <>
              <div className="overflow-x-auto">
                <table className="oszap-dash-table">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Respostas enviadas</th>
                      <th>Conversas encerradas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.pessoas.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nome}</td>
                        <td>{numero(p.mensagens)}</td>
                        <td>{numero(p.encerradas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!r.pessoas.length && (
                <p className="p-3 text-xs text-atd-ink-soft">
                  Nenhuma atividade humana atribuída a uma pessoa neste período.
                </p>
              )}
              <p className="mt-3 text-[11px] text-atd-ink-soft">
                {numero(r.mensagens.semAutora)} mensagem(ns) e {numero(r.encerramentos.semAutoria)}{" "}
                encerramento(s) sem autoria não são atribuídos a outra pessoa.
              </p>
            </>
          ) : (
            <Indisponivel />
          )}
        </Secao>
        <Secao
          titulo="Evolução das respostas humanas"
          descricao="Mensagens enviadas por dia. Dias sem registro aparecem com zero, quando a consulta está disponível."
          icon={<Activity className="h-4 w-4" />}
        >
          {!r?.mensagens ? (
            <Indisponivel />
          ) : (
            <>
              <div className="oszap-dash-daily max-h-72 space-y-3 overflow-y-auto">
                {Array.from({ length: dias }, (_, i) => {
                  const data = new Date(`${r.periodo.de}T12:00:00Z`);
                  data.setUTCDate(data.getUTCDate() + i);
                  const dia = data.toISOString().slice(0, 10);
                  const total = r.mensagens!.porDia.find((d) => d.dia === dia)?.total ?? 0;
                  return (
                    <Barra
                      key={dia}
                      nome={formatDatePura(dia)}
                      total={total}
                      max={Math.max(1, ...r.mensagens!.porDia.map((d) => d.total))}
                    />
                  );
                })}
              </div>
              {r.mensagens.parcial && (
                <p className="mt-2 text-xs text-atd-warn-ink">
                  Amostra parcial: zero nesta série pode significar registro fora da amostra.
                </p>
              )}
            </>
          )}
        </Secao>
      </div>
      <div id="oszap-dash-departamentos" className="grid items-start gap-4 xl:grid-cols-2">
        <Secao
          titulo="Conversas por departamento agora"
          descricao="Distribuição das conversas humanas abertas; sem responsável é parte das abertas, não um total adicional."
          icon={<Building2 className="h-4 w-4" />}
        >
          {f?.departamentos ? (
            <>
              <div className="overflow-x-auto">
                <table className="oszap-dash-table">
                  <thead>
                    <tr>
                      <th>Departamento</th>
                      <th>Abertas</th>
                      <th>Sem responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.departamentos.map((d) => (
                      <tr key={d.id ?? "sem-departamento"}>
                        <td>{d.nome}</td>
                        <td>{numero(d.abertas)}</td>
                        <td>{numero(d.semResponsavel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!f.departamentos.length && (
                <p className="p-3 text-xs text-atd-ink-soft">Nenhuma conversa humana aberta.</p>
              )}
              {f.departamentosParcial && (
                <p className="mt-2 text-xs text-atd-warn-ink">
                  Distribuição por departamento parcial: limite de 20.000 conversas.
                </p>
              )}
            </>
          ) : (
            <Indisponivel />
          )}
        </Secao>
        <Secao
          titulo="Histórico e atalhos"
          descricao="Somente conversas com evidência de atendimento humano. Histórico completo, independente do filtro de período."
          icon={<Inbox className="h-4 w-4" />}
        >
          <div className="grid grid-cols-2 gap-3">
            <Indicador
              nome="Conversas humanas no histórico"
              valor={numero(r?.historico?.total)}
              ajuda="Todas as datas; registros de teste excluídos"
            />
            <Indicador
              nome="Encerradas no histórico"
              valor={numero(r?.historico?.encerradas)}
              ajuda="Conversas atualmente encerradas no histórico humano"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {ir("atend-inbox", "Abrir atendimento")}
            {ir("pesquisa-conversas", "Buscar uma conversa")}
            {ir("atend-macros", "Mensagens prontas")}
            {ir("tv", "Painel da TV")}
          </div>
        </Secao>
      </div>
      <footer className="text-[11px] leading-relaxed text-atd-ink-soft">
        Somente leitura · clínica selecionada · Brasília. Testes e mensagens automáticas não entram
        nos resultados humanos. Encerramentos usam os metadados atuais de autoria e data; o painel
        não reconstrói sessões antigas que tiveram esses campos reiniciados. Atualização automática:
        fila a cada 30 s e período a cada 60 s, enquanto esta aba estiver ativa.
      </footer>
    </div>
  );
}
