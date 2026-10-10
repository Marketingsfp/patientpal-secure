import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { carregarResumoDashboardOsZap } from "@/lib/atendimento/dashboard-oszap.server";
import { diaVazio, type MetricaDashboard } from "@/lib/atendimento/dashboard-oszap";
import {
  agruparDiasDashboard,
  agrupamentosDashboard,
  periodoAnterior,
  periodoDashboardSchema,
  periodoPadraoDashboard,
  type AgrupamentoDashboard,
  type PeriodoDashboard,
} from "@/lib/atendimento/dashboard-oszap-periodos";
import { formatDatePura, hojeBR } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Resumo = Awaited<ReturnType<typeof carregarResumoDashboardOsZap>>;
const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtCompacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const numero = (n: number | undefined | null) =>
  n == null || Number.isNaN(n)
    ? "—"
    : Math.abs(n) >= 100000
      ? fmtCompacto.format(n)
      : fmt.format(n);
const pct = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const intervalo = (p: PeriodoDashboard) =>
  p.de === p.ate ? formatDatePura(p.de) : `${formatDatePura(p.de)} a ${formatDatePura(p.ate)}`;
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const rotuloGrupo = (g: { de: string; ate: string }) =>
  g.de === g.ate ? curto(g.de) : `${curto(g.de)}–${curto(g.ate)}`;
const campo =
  "h-9 min-w-0 rounded-lg border border-atd-border bg-atd-surface px-3 text-sm text-atd-ink";
const CORES = ["var(--chart-2)", "var(--chart-3)", "var(--chart-1)", "var(--chart-4)"];
const PERIGO = "var(--atd-danger)";
const NEUTRO = "var(--muted-foreground)";

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) =>
      setLargura(Math.max(280, Math.round(e.contentRect.width))),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section className="oszap-dash-section min-w-0" aria-label={titulo}>
      <h2 className="text-base font-semibold">{titulo}</h2>
      {descricao && (
        <p className="mb-4 mt-1 text-xs leading-relaxed text-atd-ink-soft">{descricao}</p>
      )}
      {children}
    </section>
  );
}

function Indicador({
  nome,
  valor,
  anterior,
  unidade,
  melhor = "alto",
  ajuda,
  formato = numero,
}: {
  nome: string;
  valor: number | null | undefined;
  anterior?: number | null;
  unidade?: string;
  melhor?: "alto" | "baixo" | "neutro";
  ajuda?: string;
  formato?: (n: number | null | undefined) => string;
}) {
  const delta = valor != null && anterior != null ? Number((valor - anterior).toFixed(2)) : null;
  const bom =
    delta == null || delta === 0 || melhor === "neutro" ? null : delta > 0 === (melhor === "alto");
  return (
    <div className="oszap-dash-kpi">
      <p className="text-xs text-atd-ink-soft">{nome}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formato(valor)}
        {unidade && valor != null && (
          <span className="ml-1 text-xs font-normal text-atd-ink-soft">{unidade}</span>
        )}
      </p>
      {anterior !== undefined && (
        <p className="mt-1 text-xs text-atd-ink-soft">
          <span
            className={
              bom == null
                ? ""
                : bom
                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                  : "font-semibold text-atd-danger-ink"
            }
          >
            {delta == null ? "sem base" : `${delta > 0 ? "+" : ""}${numero(delta)}`}
          </span>{" "}
          vs. período anterior
        </p>
      )}
      {ajuda && <p className="mt-1 text-xs text-atd-ink-soft">{ajuda}</p>}
    </div>
  );
}

const Grade = ({ children, min = "11rem" }: { children: ReactNode; min?: string }) => (
  <div
    className="grid gap-3"
    style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` }}
  >
    {children}
  </div>
);

function Legenda({ series }: { series: { rotulo: string; cor: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-atd-ink-soft">
      {series.map((s) => (
        <span key={s.rotulo} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.cor }} />
          {s.rotulo}
        </span>
      ))}
    </div>
  );
}

type Serie = { rotulo: string; cor: string; valor: (i: number) => number | null };
/** Linhas (ou barras empilhadas) por período, com dica ao passar o mouse. */
function Grafico({
  rotulos,
  series,
  tipo = "linhas",
  unidade = "",
}: {
  rotulos: string[];
  series: Serie[];
  tipo?: "linhas" | "barras";
  unidade?: string;
}) {
  const [ref, W] = useLargura();
  const [foco, setFoco] = useState<number | null>(null);
  const H = 220;
  const n = rotulos.length;
  const valores = rotulos.map((_, i) => series.map((s) => s.valor(i)));
  const max =
    Math.max(
      0,
      ...valores.map((v) =>
        tipo === "barras"
          ? v.reduce<number>((a, b) => a + (b ?? 0), 0)
          : Math.max(0, ...v.map((x) => x ?? 0)),
      ),
    ) || 1;
  const passoY = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passoY) * passoY;
  const ticks = [0, topo / 2, topo];
  const m = { t: 8, r: 8, b: 22, l: Math.max(...ticks.map((t) => numero(t).length)) * 7 + 10 };
  const y = (v: number) => H - m.b - (v / topo) * (H - m.t - m.b);
  const banda = (W - m.l - m.r) / Math.max(1, n);
  const x = (i: number) => m.l + banda * i + banda / 2;
  const cadaRotulo = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - m.l) / 64))));
  const bw = Math.min(32, banda * 0.7);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setFoco(null)}>
      <Legenda series={series} />
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text
              x={m.l - 6}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-atd-ink-soft text-[11px] tabular-nums"
            >
              {numero(t)}
            </text>
          </g>
        ))}
        {rotulos.map((r, i) =>
          i % cadaRotulo === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-atd-ink-soft text-[11px]"
            >
              {r}
            </text>
          ) : null,
        )}
        {tipo === "barras"
          ? rotulos.map((_, i) => {
              let base = 0;
              return series.map((s, k) => {
                const v = s.valor(i) ?? 0;
                const y0 = y(base);
                base += v;
                return v > 0 ? (
                  <rect
                    key={`${i}-${k}`}
                    x={x(i) - bw / 2}
                    width={bw}
                    y={y(base)}
                    height={y0 - y(base)}
                    fill={s.cor}
                    rx={k === series.length - 1 ? 2 : 0}
                  />
                ) : null;
              });
            })
          : series.map((s) => {
              const pts = rotulos.map((_, i) => [x(i), s.valor(i)] as const);
              const d = pts
                .map(([px, v], i) =>
                  v == null ? "" : `${i && pts[i - 1][1] != null ? "L" : "M"}${px},${y(v)}`,
                )
                .join("");
              return (
                <g key={s.rotulo}>
                  <path
                    d={d}
                    fill="none"
                    stroke={s.cor}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {n <= 31 &&
                    pts.map(([px, v], i) =>
                      v == null ? null : (
                        <circle key={i} cx={px} cy={y(v)} r={n <= 2 ? 4 : 2} fill={s.cor} />
                      ),
                    )}
                </g>
              );
            })}
        {foco != null && (
          <line
            x1={x(foco)}
            x2={x(foco)}
            y1={m.t}
            y2={H - m.b}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.4}
          />
        )}
        {rotulos.map((_, i) => (
          <rect
            key={i}
            x={m.l + banda * i}
            width={banda}
            y={0}
            height={H}
            fill="transparent"
            onMouseEnter={() => setFoco(i)}
          />
        ))}
      </svg>
      {foco != null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-md border border-atd-border bg-popover px-2 py-1 text-xs shadow-md"
          style={{
            left: (x(foco) / W) * 100 > 60 ? undefined : `calc(${(x(foco) / W) * 100}% + 10px)`,
            right:
              (x(foco) / W) * 100 > 60 ? `calc(${100 - (x(foco) / W) * 100}% + 10px)` : undefined,
          }}
        >
          <p className="text-atd-ink-soft">{rotulos[foco]}</p>
          {series.map((s) => (
            <p key={s.rotulo} className="flex items-center gap-1.5 tabular-nums">
              {series.length > 1 && (
                <span className="inline-block size-2 rounded-sm" style={{ background: s.cor }} />
              )}
              {s.rotulo}: {numero(s.valor(foco))}
              {unidade}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function BarrasH({
  itens,
  vazio,
}: {
  itens: { rotulo: string; valor: number; cor?: string; extra?: string }[];
  vazio: string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length || itens.every((i) => i.valor === 0))
    return <p className="text-sm text-atd-ink-soft">{vazio}</p>;
  return (
    <div className="grid gap-2">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className="grid grid-cols-[minmax(6rem,38%)_1fr_auto] items-center gap-2 text-xs"
        >
          <span className="truncate" title={i.rotulo}>
            {i.rotulo}
          </span>
          <span className="h-3 overflow-hidden rounded-full bg-atd-surface-2">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(i.valor / max) * 100}%`, background: i.cor ?? CORES[0] }}
            />
          </span>
          <span className="tabular-nums">
            {numero(i.valor)}
            {i.extra}
          </span>
        </div>
      ))}
    </div>
  );
}

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function MapaHoras({ horas }: { horas: Resumo["porHora"] }) {
  const [ref, W] = useLargura();
  const [foco, setFoco] = useState<Resumo["porHora"][number] | null>(null);
  const m = { l: 36, b: 20 };
  const cel = (W - m.l) / 24;
  const alt = Math.min(28, Math.max(16, cel));
  const H = alt * 7 + m.b;
  const max = Math.max(1, ...horas.map((h) => h.recebidas));
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setFoco(null)}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Mensagens recebidas por dia da semana e hora"
        className="block"
      >
        {SEMANA.map((d, i) => (
          <text
            key={d}
            x={m.l - 6}
            y={i * alt + alt / 2}
            dy="0.32em"
            textAnchor="end"
            className="fill-atd-ink-soft text-[11px]"
          >
            {d}
          </text>
        ))}
        {Array.from({ length: 24 }, (_, h) =>
          h % (cel < 22 ? 3 : 2) === 0 ? (
            <text
              key={h}
              x={m.l + h * cel + cel / 2}
              y={H - 4}
              textAnchor="middle"
              className="fill-atd-ink-soft text-[11px]"
            >
              {h}h
            </text>
          ) : null,
        )}
        {horas.map((h) => (
          <rect
            key={`${h.diaSemana}-${h.hora}`}
            x={m.l + h.hora * cel + 1}
            y={h.diaSemana * alt + 1}
            width={Math.max(1, cel - 2)}
            height={alt - 2}
            rx={3}
            fill={h.recebidas ? CORES[0] : "var(--muted)"}
            fillOpacity={h.recebidas ? 0.15 + 0.85 * (h.recebidas / max) : 1}
            onMouseEnter={() => setFoco(h)}
          />
        ))}
      </svg>
      {foco && (
        <p className="mt-2 text-xs tabular-nums text-atd-ink-soft" role="status">
          {SEMANA[foco.diaSemana]}, {foco.hora}h: {numero(foco.recebidas)} mensagens recebidas
        </p>
      )}
    </div>
  );
}

type Coluna<T> = {
  campo: keyof T & string;
  titulo: string;
  texto?: boolean;
  formato?: (v: T[keyof T], l: T) => ReactNode;
};
function Tabela<T extends Record<string, unknown>>({
  linhas,
  colunas,
  chave,
  vazio,
  busca,
}: {
  linhas: T[];
  colunas: Coluna<T>[];
  chave: (l: T) => string;
  vazio: string;
  busca?: string;
}) {
  const [ordem, setOrdem] = useState<{ campo: string; dir: 1 | -1 } | null>(null);
  const [termo, setTermo] = useState("");
  const visiveis = useMemo(() => {
    let r = linhas.filter(
      (l) => !termo || JSON.stringify(Object.values(l)).toLowerCase().includes(termo.toLowerCase()),
    );
    if (ordem)
      r = [...r].sort((a, b) => {
        const va = a[ordem.campo],
          vb = b[ordem.campo];
        return (
          (typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va ?? "").localeCompare(String(vb ?? ""))) * ordem.dir
        );
      });
    return r;
  }, [linhas, ordem, termo]);
  return (
    <>
      {busca && (
        <input
          type="search"
          className={`${campo} mb-3 w-full max-w-xs`}
          placeholder={busca}
          aria-label={busca}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      )}
      <div className="max-h-[28rem] overflow-auto">
        <table className="oszap-dash-table">
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c.campo}
                  scope="col"
                  className="sticky top-0 bg-atd-surface"
                  aria-sort={
                    ordem?.campo === c.campo ? (ordem.dir > 0 ? "ascending" : "descending") : "none"
                  }
                >
                  <button
                    type="button"
                    className="font-inherit"
                    onClick={() =>
                      setOrdem((o) => ({
                        campo: c.campo,
                        dir: o?.campo === c.campo ? (-o.dir as 1 | -1) : i === 0 ? 1 : -1,
                      }))
                    }
                  >
                    {c.titulo}
                    {ordem?.campo === c.campo ? (ordem.dir > 0 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length ? (
              visiveis.map((l) => (
                <tr key={chave(l)}>
                  {colunas.map((c, i) => {
                    const v = l[c.campo];
                    const conteudo = c.formato
                      ? c.formato(v, l)
                      : typeof v === "number"
                        ? numero(v)
                        : String(v ?? "—");
                    return i === 0 ? (
                      <th scope="row" key={c.campo}>
                        {conteudo}
                      </th>
                    ) : (
                      <td key={c.campo} className={c.texto ? "text-left" : undefined}>
                        {conteudo}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={colunas.length} className="text-left text-atd-ink-soft">
                  {vazio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

const ROT_ERRO: Record<string, string> = {
  bad_request: "Pedido recusado pela IA",
  timeout: "Tempo esgotado",
  sem_categoria: "Sem categoria",
};
const INDICADORES: {
  m: MetricaDashboard;
  nome: string;
  melhor?: "alto" | "baixo" | "neutro";
  unidade?: string;
  ajuda?: string;
}[] = [
  { m: "conversasNovas", nome: "Conversas novas" },
  { m: "mensagensRecebidas", nome: "Mensagens recebidas" },
  {
    m: "respostasEquipe",
    nome: "Respostas das atendentes",
    ajuda: "Perfil Telefonia, envio confirmado",
  },
  { m: "respostasNina", nome: "Respostas da Nina", ajuda: "Com envio confirmado" },
  { m: "encaminhadas", nome: "Encaminhadas à equipe", melhor: "neutro", ajuda: "Pela Nina" },
  { m: "assumidas", nome: "Assumidas por atendentes" },
  { m: "finalizadas", nome: "Atendimentos finalizados", ajuda: "Por atendentes" },
  {
    m: "conversasRespondidas",
    nome: "Conversas respondidas",
    ajuda: "Com ao menos uma resposta de atendente",
  },
  { m: "transferencias", nome: "Transferências", melhor: "neutro", ajuda: "Feitas por atendentes" },
  {
    m: "esperaFilaMin",
    nome: "Espera média na fila",
    melhor: "baixo",
    unidade: "min",
    ajuda: "Da entrada na fila até uma atendente assumir",
  },
  {
    m: "primeiraRespostaMin",
    nome: "1ª resposta de atendente",
    melhor: "baixo",
    unidade: "min",
    ajuda: "Média desde a entrada na fila",
  },
  {
    m: "tempoAteEncerrarMin",
    nome: "Tempo até encerrar",
    melhor: "baixo",
    unidade: "min",
    ajuda: "Média de assumida por atendente a finalizada",
  },
  { m: "avaliacoes", nome: "Avaliações recebidas" },
  { m: "notaMedia", nome: "Nota média (1 a 5)" },
];

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
    () =>
      resumo ? agruparDiasDashboard(resumo.porDia, resumo.periodo, agrupamento, diaVazio) : [],
    [resumo, agrupamento],
  );
  const rotulos = grupos.map(rotuloGrupo);
  const serie = (
    rotulo: string,
    cor: string,
    valor: (g: (typeof grupos)[number]) => number | null,
  ): Serie => ({
    rotulo,
    cor,
    valor: (i) => valor(grupos[i]),
  });
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
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-atd-ink-soft">
          OS ZAP · {clinica}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard do atendimento</h1>
        <p className="mt-1 text-sm text-atd-ink-soft">
          Conversas, equipe, Nina, Francisco e WhatsApp em um só lugar. Somente atendimento real:
          conversas de teste não entram.
        </p>
      </header>
      <form
        className="oszap-dash-section"
        aria-label="Pesquisar por data"
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
                else if (v === "hoje") setRascunho({ de: hojeBR(), ate: hojeBR() });
                else if (v !== "personalizado") {
                  setRascunho(periodoAnterior(v as AgrupamentoDashboard));
                  onAgrupamento(
                    v === "dia" || v === "semana" ? "dia" : v === "ano" ? "mes" : "semana",
                  );
                }
              }}
            >
              <option value="hoje">Hoje</option>
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
            Agrupar gráficos por
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
          Horário de Brasília. Sem atualização automática. Cada número é comparado ao período
          anterior de mesmo tamanho.
        </p>
      </form>
      {erro && (
        <p
          role="alert"
          className="rounded-lg border border-atd-warn bg-atd-warn-bg p-3 text-sm text-atd-warn-ink"
        >
          {erro}
          {resumo
            ? " Os números abaixo são da última consulta concluída."
            : " Nenhum número foi calculado para esta consulta."}
        </p>
      )}
      {!resumo ? (
        <p role="status" className="p-5 text-sm">
          {atualizando ? "Consultando o período…" : "Selecione o período e consulte."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="font-semibold">
              Período: {intervalo(resumo.periodo)} · comparado a {intervalo(resumo.anterior)}
            </p>
            <p className="text-atd-ink-soft">
              Consulta concluída em{" "}
              {new Date(resumo.atualizadoEm).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </p>
          </div>
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
          <Tabs defaultValue="geral">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="geral">Visão geral</TabsTrigger>
              <TabsTrigger value="equipe">Equipe e departamentos</TabsTrigger>
              <TabsTrigger value="horarios">Horários e qualidade</TabsTrigger>
              <TabsTrigger value="nina">Nina</TabsTrigger>
              <TabsTrigger value="francisco">Francisco</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="space-y-5">
              <Secao
                titulo="Agora"
                descricao="Situação das conversas abertas neste momento, sem depender do período escolhido."
              >
                <Grade>
                  <Indicador
                    nome="Com a Nina"
                    valor={resumo.agora.nina.conversas}
                    ajuda={`Não lidas: ${numero(resumo.agora.nina.naoLidas)}`}
                  />
                  <Indicador
                    nome="Na fila esperando atendente"
                    valor={resumo.agora.fila.conversas}
                    ajuda={`Maior espera: ${resumo.agora.fila.esperaMaxMin == null ? "—" : `${numero(resumo.agora.fila.esperaMaxMin)} min`}`}
                  />
                  <Indicador
                    nome="Em atendimento humano"
                    valor={resumo.agora.emAtendimento.conversas}
                    ajuda={`Não lidas: ${numero(resumo.agora.emAtendimento.naoLidas)}`}
                  />
                  <Indicador
                    nome="Aguardando o paciente"
                    valor={resumo.agora.aguardandoPaciente.conversas}
                    ajuda={`Maior espera: ${resumo.agora.aguardandoPaciente.esperaMaxMin == null ? "—" : `${numero(resumo.agora.aguardandoPaciente.esperaMaxMin)} min`}`}
                  />
                </Grade>
              </Secao>
              <Secao
                titulo="No período"
                descricao="Verde é melhora e vermelho é piora em relação ao período anterior; tempos menores são melhores."
              >
                <Grade>
                  {INDICADORES.map((i) => (
                    <Indicador
                      key={i.m}
                      nome={i.nome}
                      valor={resumo.indicadores[i.m].atual}
                      anterior={resumo.indicadores[i.m].anterior}
                      melhor={i.melhor}
                      unidade={i.unidade}
                      ajuda={i.ajuda}
                    />
                  ))}
                </Grade>
              </Secao>
              <div className="grid gap-5 xl:grid-cols-2">
                <Secao
                  titulo="Mensagens"
                  descricao="Recebidas dos pacientes e respostas enviadas pelas atendentes e pela Nina."
                >
                  <Grafico
                    rotulos={rotulos}
                    series={[
                      serie("Recebidas", CORES[0], (g) => g.recebidas),
                      serie("Respostas das atendentes", CORES[1], (g) => g.respostasEquipe),
                      serie("Respostas da Nina", CORES[2], (g) => g.respostasNina),
                    ]}
                  />
                </Secao>
                <Secao
                  titulo="Conversas"
                  descricao="Novas, encaminhadas pela Nina à equipe e finalizadas."
                >
                  <Grafico
                    rotulos={rotulos}
                    series={[
                      serie("Novas", CORES[0], (g) => g.conversasNovas),
                      serie("Encaminhadas", CORES[1], (g) => g.encaminhadas),
                      serie("Finalizadas", CORES[2], (g) => g.finalizadas),
                    ]}
                  />
                </Secao>
              </div>
            </TabsContent>

            <TabsContent value="equipe" className="space-y-5">
              <Secao
                titulo="Desempenho por atendente"
                descricao="Somente quem tem o perfil Telefonia na clínica. A nota e a quantidade de avaliações são vinculadas à atendente responsável no encerramento. Presença e conversas abertas são de agora."
              >
                <Tabela
                  linhas={resumo.equipe}
                  chave={(l) => l.id}
                  busca="Buscar atendente"
                  vazio="Nenhuma pessoa com perfil Telefonia nesta clínica."
                  colunas={[
                    { campo: "nome", titulo: "Atendente" },
                    {
                      campo: "presenca",
                      titulo: "Presença",
                      texto: true,
                      formato: (v) => (
                        <span
                          className={`rounded-full border border-atd-border px-2 ${v === "Online" ? "text-emerald-700 dark:text-emerald-400" : v === "Em pausa" ? "text-atd-warn-ink" : ""}`}
                        >
                          {String(v)}
                        </span>
                      ),
                    },
                    { campo: "mensagens", titulo: "Mensagens" },
                    { campo: "assumidas", titulo: "Assumidas" },
                    { campo: "finalizadas", titulo: "Finalizadas" },
                    { campo: "avaliacoes", titulo: "Avaliações" },
                    {
                      campo: "notaMedia",
                      titulo: "Nota média",
                      formato: (v) => (v == null ? "—" : Number(v).toFixed(2)),
                    },
                    { campo: "transferencias", titulo: "Transferências" },
                    { campo: "abertasAgora", titulo: "Abertas agora" },
                    { campo: "pausas", titulo: "Pausas" },
                    { campo: "minutosPausa", titulo: "Min. em pausa" },
                  ]}
                />
              </Secao>
              <div className="grid gap-5 xl:grid-cols-2">
                <Secao
                  titulo="Departamentos"
                  descricao="Fila e atendimento de agora; conversas iniciadas e transferências recebidas no período."
                >
                  <Tabela
                    linhas={resumo.departamentos}
                    chave={(l) => l.id}
                    vazio="Nenhum departamento."
                    colunas={[
                      { campo: "nome", titulo: "Departamento" },
                      { campo: "naFila", titulo: "Na fila" },
                      { campo: "emAtendimento", titulo: "Em atendimento" },
                      { campo: "conversas", titulo: "Conversas" },
                      { campo: "transferenciasRecebidas", titulo: "Transf. recebidas" },
                    ]}
                  />
                </Secao>
                <Secao
                  titulo="Pausas por motivo"
                  descricao="Minutos em pausa no período, somando as atendentes."
                >
                  <BarrasH
                    vazio="Nenhuma pausa no período."
                    itens={resumo.pausas.map((p) => ({
                      rotulo: p.motivo,
                      valor: p.minutos,
                      extra: ` min · ${numero(p.pausas)}×`,
                    }))}
                  />
                </Secao>
              </div>
            </TabsContent>

            <TabsContent value="horarios" className="space-y-5">
              <Secao
                titulo="Quando os pacientes escrevem"
                descricao="Mensagens recebidas por dia da semana e hora no período. Quanto mais forte a cor, mais mensagens."
              >
                <MapaHoras horas={resumo.porHora} />
              </Secao>
              <div className="grid gap-5 xl:grid-cols-2">
                <Secao
                  titulo="Avaliações dos pacientes"
                  descricao="Notas de 1 a 5 dadas no fim do atendimento."
                >
                  <BarrasH
                    vazio="Nenhuma avaliação no período."
                    itens={resumo.notas
                      .map((v, i) => ({
                        rotulo: `Nota ${i + 1}`,
                        valor: v,
                        cor: i >= 3 ? "var(--chart-2)" : i <= 1 ? PERIGO : NEUTRO,
                      }))
                      .reverse()}
                  />
                </Secao>
                <Secao
                  titulo="Sentimento das conversas"
                  descricao="Classificação registrada nas conversas iniciadas no período."
                >
                  <BarrasH
                    vazio="Nenhuma conversa no período."
                    itens={[
                      {
                        rotulo: "Positivo",
                        valor: resumo.sentimento.positivo,
                        cor: "var(--chart-2)",
                      },
                      { rotulo: "Neutro", valor: resumo.sentimento.neutro, cor: NEUTRO },
                      {
                        rotulo: "Negativo",
                        valor: resumo.sentimento.negativo,
                        cor: "var(--chart-4)",
                      },
                      { rotulo: "Frustrado", valor: resumo.sentimento.frustrado, cor: PERIGO },
                      {
                        rotulo: "Sem classificação",
                        valor: resumo.sentimento.semRegistro,
                        cor: NEUTRO,
                      },
                    ]}
                  />
                </Secao>
              </div>
            </TabsContent>

            <TabsContent value="nina" className="space-y-5">
              {!resumo.nina ? (
                <p className="text-sm text-atd-ink-soft">
                  Os números da Nina não estão disponíveis nesta consulta.
                </p>
              ) : (
                <>
                  <p className="text-xs text-atd-ink-soft">
                    Só execuções ligadas a conversas reais do período; homologação e testes ficam de
                    fora.
                  </p>
                  <Grade>
                    <Indicador nome="Execuções" valor={resumo.nina.execucoes} />
                    <Indicador nome="Conversas atendidas" valor={resumo.nina.conversas} />
                    <Indicador
                      nome="Taxa de falha"
                      valor={
                        resumo.nina.execucoes ? resumo.nina.falhas / resumo.nina.execucoes : null
                      }
                      formato={pct}
                      ajuda={`${numero(resumo.nina.falhas)} falhas`}
                    />
                    <Indicador
                      nome="Encaminhamentos à equipe"
                      valor={resumo.nina.encaminhamentos}
                    />
                    <Indicador
                      nome="Tempo médio de resposta"
                      valor={resumo.nina.latenciaMediaS}
                      unidade="s"
                    />
                    <Indicador
                      nome="Tokens por execução"
                      valor={resumo.nina.tokensEntradaMedia}
                      ajuda={`Entrada · saída ${numero(resumo.nina.tokensSaidaMedia)}`}
                    />
                  </Grade>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <Secao titulo="Execuções" descricao="Total, encaminhamentos e falhas.">
                      <Grafico
                        rotulos={rotulos}
                        series={[
                          serie("Execuções", CORES[0], (g) => g.ninaExecucoes),
                          serie("Encaminhamentos", CORES[1], (g) => g.ninaEncaminhamentos),
                          serie("Falhas", PERIGO, (g) => g.ninaFalhas),
                        ]}
                      />
                    </Secao>
                    <Secao
                      titulo="Tempo médio de resposta"
                      descricao="Segundos entre a chamada e a resposta da IA."
                    >
                      <Grafico
                        rotulos={rotulos}
                        unidade=" s"
                        series={[
                          serie("Tempo médio", CORES[0], (g) =>
                            g.ninaLatenciaMedidas
                              ? Number(
                                  (g.ninaLatenciaSomaMs / g.ninaLatenciaMedidas / 1000).toFixed(1),
                                )
                              : null,
                          ),
                        ]}
                      />
                    </Secao>
                    <Secao titulo="Modelos usados" descricao="Por modelo de IA e canal.">
                      <Tabela
                        linhas={resumo.nina.modelos}
                        chave={(l) => `${l.modelo}|${l.canal}`}
                        vazio="Nenhuma execução no período."
                        colunas={[
                          { campo: "modelo", titulo: "Modelo" },
                          { campo: "canal", titulo: "Canal", texto: true },
                          { campo: "execucoes", titulo: "Execuções" },
                          { campo: "falhas", titulo: "Falhas" },
                          { campo: "latenciaMediaS", titulo: "Tempo (s)" },
                          { campo: "tokensEntradaMedia", titulo: "Tokens entrada" },
                          { campo: "tokensSaidaMedia", titulo: "Tokens saída" },
                        ]}
                      />
                    </Secao>
                    <Secao
                      titulo="Falhas por tipo"
                      descricao="Categoria de erro de cada execução que falhou."
                    >
                      <BarrasH
                        vazio="Nenhuma falha no período."
                        itens={resumo.nina.erros.map((e) => ({
                          rotulo: ROT_ERRO[e.categoria] ?? e.categoria,
                          valor: e.falhas,
                          cor: PERIGO,
                        }))}
                      />
                    </Secao>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="francisco" className="space-y-5">
              {!resumo.francisco ? (
                <p className="text-sm text-atd-ink-soft">
                  Seu perfil não tem acesso aos envios do Francisco.
                </p>
              ) : (
                <>
                  <p className="text-xs text-atd-ink-soft">
                    O Francisco acompanha orçamentos pelo WhatsApp: 1º contato (d1) e 2º contato a
                    partir do 4º dia (d4). Taxa de resposta = respondidos ÷ enviados.
                  </p>
                  <Grade>
                    {resumo.francisco.flatMap((f) => [
                      <Indicador
                        key={`${f.etapa}-e`}
                        nome={`${f.etapa === "d1" ? "1º" : "2º"} contato enviados`}
                        valor={f.enviados}
                        ajuda={`Respondidos: ${numero(f.respondidos)}`}
                      />,
                      <Indicador
                        key={`${f.etapa}-t`}
                        nome={`Taxa de resposta ${f.etapa}`}
                        valor={f.taxaResposta}
                        formato={pct}
                      />,
                    ])}
                  </Grade>
                  <Secao
                    titulo="Envios por situação"
                    descricao="Reservado = aguardando envio; incerto = sem confirmação da Meta; bloqueado = barrado pelas travas (horário, autorização, recusa)."
                  >
                    <Tabela
                      linhas={resumo.francisco}
                      chave={(l) => l.etapa}
                      vazio="Nenhum envio."
                      colunas={[
                        { campo: "etapa", titulo: "Etapa" },
                        { campo: "total", titulo: "Total" },
                        { campo: "enviados", titulo: "Enviados" },
                        { campo: "reservados", titulo: "Reservados" },
                        { campo: "incertos", titulo: "Incertos" },
                        { campo: "bloqueados", titulo: "Bloqueados" },
                        { campo: "respondidos", titulo: "Respondidos" },
                        {
                          campo: "taxaResposta",
                          titulo: "Taxa de resposta",
                          formato: (v) => pct(v as number | null),
                        },
                      ]}
                    />
                  </Secao>
                </>
              )}
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-5">
              <p className="text-xs text-atd-ink-soft">
                Avisos que a Meta mandou para o sistema (webhook) e mensagens que o sistema enviou
                no período.
              </p>
              <Grade>
                <Indicador
                  nome="Avisos processados"
                  valor={resumo.whatsapp.avisosDisponiveis ? resumo.whatsapp.processados : null}
                />
                <Indicador
                  nome="Recusados (assinatura inválida)"
                  valor={
                    resumo.whatsapp.avisosDisponiveis ? resumo.whatsapp.assinaturaInvalida : null
                  }
                />
                <Indicador
                  nome="Pendentes para retomada"
                  valor={resumo.whatsapp.avisosDisponiveis ? resumo.whatsapp.pendentes : null}
                />
                <Indicador
                  nome="Outros erros"
                  valor={resumo.whatsapp.avisosDisponiveis ? resumo.whatsapp.outrosErros : null}
                />
                <Indicador
                  nome="Mensagens enviadas"
                  valor={resumo.whatsapp.enviosOk}
                  ajuda="Com envio confirmado"
                />
                <Indicador nome="Envios com falha" valor={resumo.whatsapp.enviosFalha} />
              </Grade>
              <div className="grid gap-5 xl:grid-cols-2">
                {resumo.whatsapp.avisosDisponiveis && (
                  <Secao
                    titulo="Avisos da Meta"
                    descricao="Processados, pendentes, recusados por assinatura e outros erros."
                  >
                    <Grafico
                      tipo="barras"
                      rotulos={rotulos}
                      series={[
                        serie("Processados", CORES[0], (g) => g.avisosProcessados),
                        serie("Pendentes", CORES[1], (g) => g.avisosPendentes),
                        serie("Assinatura inválida", PERIGO, (g) => g.avisosAssinatura),
                        serie("Outros erros", NEUTRO, (g) => g.avisosErros),
                      ]}
                    />
                  </Secao>
                )}
                <Secao titulo="Envios" descricao="Mensagens enviadas com sucesso e com falha.">
                  <Grafico
                    tipo="barras"
                    rotulos={rotulos}
                    series={[
                      serie("Enviadas", CORES[0], (g) => g.enviosOk),
                      serie("Com falha", PERIGO, (g) => g.enviosFalha),
                    ]}
                  />
                </Secao>
              </div>
            </TabsContent>
          </Tabs>
          <footer className="rounded-lg border border-atd-border p-4 text-xs leading-relaxed text-atd-ink-soft">
            Como contamos: atendentes são somente as pessoas com perfil Telefonia na clínica (quem
            também é administrador fica de fora); respostas, conversas assumidas, finalizadas,
            transferências, pausas e tempos de atendimento só contam quando feitos por elas.
            Respostas só com envio confirmado pela Meta; cada ação pertence a quem a executou, não a
            quem está com a conversa hoje; tempos só são medidos quando o começo e o fim foram
            registrados. Conversas de teste e homologação não entram.
          </footer>
        </>
      )}
    </div>
  );
}
