/**
 * Painel de TV do atendimento (OS ZAP) — tela cheia 1920 x 1080, sem rolagem.
 * Só leitura e só contagens; nenhum dado de paciente aparece na TV.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Clock, Coffee, Hourglass, Timer, DoorOpen, Expand, Inbox, MessagesSquare, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useRelogioPausa } from "@/hooks/use-relogio-pausa";
import { consultarPainelTv } from "@/lib/atendimento.functions";
import { faixaEsperaDesde } from "@/lib/atendimento/espera";
import { formatarTempoPausa } from "@/lib/atendimento/cronometro-pausa";
import type { AtendenteTv } from "@/lib/atendimento/painel-tv.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/painel-tv-atendimento")({
  component: PainelTvAtendimento,
  head: () => ({
    meta: [
      { title: "Painel da equipe de atendimento — OS ZAP" },
      { name: "description", content: "Painel em tempo real para a TV da equipe de atendimento." },
      { property: "og:title", content: "Painel da equipe de atendimento — OS ZAP" },
      { property: "og:description", content: "Atendentes online, pausas e filas em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Dados = {
  atendentes: AtendenteTv[];
  naoAtribuidas: number;
  espera: string[];
  conversasDoDia: number;
  tempoMedioRespostaSeg: number | null;
  respostasMedidas: number;
  volumePorHora: number[];
  atualizadoEm: string;
};

function PainelTvAtendimento() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const consultar = useServerFn(consultarPainelTv);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const agora = useRelogioPausa();
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    const n = ++pedido.current;
    try {
      const r = await consultar({ data: { clinicaId } });
      if (n !== pedido.current) return;
      setDados(r as Dados);
      setErro(null);
    } catch (e) {
      if (n === pedido.current) setErro(e instanceof Error ? e.message : "Falha ao carregar o painel.");
    }
  }, [clinicaId, consultar]);

  // Tempo real: qualquer mudança em conversas, presença ou mensagens relê (agrupado).
  useEffect(() => {
    if (!clinicaId) return;
    void carregar();
    let t: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        void carregar();
      }, 1500);
    };
    const ch = supabase.channel(`painel-tv-${clinicaId}-${Math.random().toString(36).slice(2)}`);
    for (const table of ["atend_conversas", "atend_agente_presenca", "whatsapp_mensagens"]) {
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `clinica_id=eq.${clinicaId}` },
        agendar,
      );
    }
    ch.subscribe((status: string) => {
      setConectado(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") agendar();
    });
    const intervalo = setInterval(() => void carregar(), 30_000);
    const aoVoltar = () => document.visibilityState === "visible" && void carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    return () => {
      if (t) clearTimeout(t);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      supabase.removeChannel(ch);
    };
  }, [clinicaId, carregar]);

  const relogio = agora || Date.now();
  const criticas = dados ? dados.espera.filter((d) => faixaEsperaDesde(d, relogio) === "critico").length : 0;
  const pendentes = dados?.espera.length ?? 0;
  const online = dados?.atendentes.filter((a) => a.estado === "ONLINE") ?? [];
  const pausa = dados?.atendentes.filter((a) => a.estado === "PAUSA" || a.estado === "PAUSA_SAIDA") ?? [];
  const offline = dados?.atendentes.filter((a) => a.estado === "OFFLINE") ?? [];
  // Mensagem mais antiga ainda sem resposta (só conversas abertas com atendente).
  const maisAntiga = dados?.espera.length ? Math.min(...dados.espera.map((d) => Date.parse(d))) : null;
  const minAntiga = maisAntiga ? Math.max(0, Math.floor((relogio - maisAntiga) / 60000)) : null;

  const telaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col gap-[1.5vh] overflow-hidden bg-atd-bg p-[1.5vh_1.5vw] text-atd-ink">
      <header className="flex h-[7vh] shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link to="/app/nina" className="grid h-[5vh] w-[5vh] shrink-0 place-items-center rounded-xl border border-atd-border bg-atd-surface text-atd-ink-soft" aria-label="Voltar ao OS ZAP">
            <ArrowLeft className="h-[2.6vh] w-[2.6vh]" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[3.4vh] font-bold leading-tight">Atendimento — {clinicaAtual?.clinica.nome ?? ""}</h1>
            <p className="flex items-center gap-2 text-[1.8vh] text-atd-ink-soft">
              <span className={cn("inline-block h-[1.3vh] w-[1.3vh] rounded-full", conectado ? "bg-atd-ok" : "bg-atd-warn")} />
              {conectado ? "Ao vivo" : "Reconectando…"}
              {dados && ` · atualizado ${new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR")}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="flex items-center gap-2 text-[4.2vh] font-bold tabular-nums">
            <Clock className="h-[3.6vh] w-[3.6vh] text-atd-ink-soft" />
            {new Date(relogio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button type="button" onClick={telaCheia} className="flex h-[5vh] items-center gap-2 rounded-xl border border-atd-border bg-atd-surface px-4 text-[1.8vh] font-medium">
            <Expand className="h-[2.4vh] w-[2.4vh]" /> Tela cheia
          </button>
        </div>
      </header>

      {erro && !dados ? (
        <div className="grid flex-1 place-items-center text-center text-[3vh] text-atd-danger-ink">{erro}</div>
      ) : (
        <>
          <section className="grid h-[15vh] shrink-0 grid-cols-6 gap-[1vw]">
            <Kpi titulo="Espera crítica" valor={criticas} icone={AlertTriangle} tom={criticas > 0 ? "danger" : "neutro"} pulsar={criticas > 0} />
            <Kpi titulo="Pendentes" valor={pendentes} icone={Inbox} tom={pendentes > 0 ? "warn" : "neutro"} />
            <Kpi titulo="Não atribuídas" valor={dados?.naoAtribuidas ?? 0} icone={UserX} tom={(dados?.naoAtribuidas ?? 0) > 0 ? "warn" : "neutro"} />
            <Kpi titulo="Conversas hoje" valor={dados?.conversasDoDia ?? 0} icone={MessagesSquare} tom="blue" />
            <Kpi titulo="Tempo médio de resposta" valor={dados?.tempoMedioRespostaSeg == null ? "—" : duracao(dados.tempoMedioRespostaSeg / 60)} icone={Timer} tom="blue" dica={dados ? `hoje · ${dados.respostasMedidas} respostas` : undefined} />
            <Kpi titulo="Mais antiga sem resposta" valor={minAntiga == null ? "—" : duracao(minAntiga)} icone={Hourglass} tom={minAntiga != null && minAntiga > 10 ? "danger" : minAntiga != null ? "warn" : "neutro"} />
          </section>

          <VolumePorHora valores={dados?.volumePorHora ?? []} horaAtual={Number(new Date(relogio).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }))} />

          <section className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-[1.2vw]">
            <Coluna titulo="Online" total={online.length} tom="ok">
              <GradeAtendentes lista={online} agora={relogio} />
              {offline.length > 0 && (
                <div className="mt-[1.2vh] shrink-0 border-t border-atd-border pt-[1vh]">
                  <p className="mb-[0.8vh] text-[1.7vh] font-semibold text-atd-ink-soft">Offline com conversas atribuídas</p>
                  <GradeAtendentes lista={offline} agora={relogio} compacto />
                </div>
              )}
            </Coluna>
            <Coluna titulo="Em pausa" total={pausa.length} tom="warn">
              <GradeAtendentes lista={pausa} agora={relogio} colunas={pausa.length > 6 ? 2 : 1} />
            </Coluna>
          </section>
        </>
      )}
    </div>
  );
}

const TONS = {
  danger: "border-atd-danger bg-atd-danger-bg text-atd-danger-ink",
  warn: "border-atd-warn bg-atd-warn-bg text-atd-warn-ink",
  blue: "border-atd-blue bg-atd-blue-soft text-atd-blue-ink",
  ok: "border-atd-ok bg-atd-ok-bg text-atd-ok-ink",
  neutro: "border-atd-border bg-atd-surface text-atd-ink",
} as const;

function duracao(min: number): string {
  if (min < 1) return "<1 min";
  const t = Math.round(min);
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`;
}

function VolumePorHora({ valores, horaAtual }: { valores: number[]; horaAtual: number }) {
  // Mostra das 06h às 22h; fora disso o volume é residual.
  const horas = Array.from({ length: 17 }, (_, i) => i + 6);
  const max = Math.max(1, ...horas.map((h) => valores[h] ?? 0));
  const pico = horas.reduce((m, h) => ((valores[h] ?? 0) > (valores[m] ?? 0) ? h : m), horas[0]!);
  return (
    <section className="flex h-[15vh] shrink-0 flex-col rounded-3xl border border-atd-border bg-atd-surface p-[1.2vh_1.2vw]">
      <h2 className="flex shrink-0 items-baseline gap-3 text-[2.2vh] font-bold">
        Mensagens de pacientes por hora (hoje)
        {(valores[pico] ?? 0) > 0 && <span className="text-[1.7vh] font-medium text-atd-ink-soft">pico às {pico}h · {valores[pico]} mensagens</span>}
      </h2>
      <div className="mt-[0.6vh] grid min-h-0 flex-1 gap-[0.4vw]" style={{ gridTemplateColumns: `repeat(${horas.length}, minmax(0, 1fr))` }}>
        {horas.map((h) => {
          const v = valores[h] ?? 0;
          return (
            <div key={h} className="flex min-h-0 flex-col items-center justify-end gap-[0.3vh]">
              <span className="text-[1.5vh] font-bold tabular-nums">{v || ""}</span>
              <div className={cn("w-full rounded-t-md", h === horaAtual ? "bg-atd-blue" : "bg-atd-blue-soft")} style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0, maxHeight: "70%" }} />
              <span className={cn("text-[1.4vh] tabular-nums", h === horaAtual ? "font-bold" : "text-atd-ink-soft")}>{h}h</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Kpi({ titulo, valor, icone: Icone, tom, pulsar, dica }: { titulo: string; valor: number | string; icone: typeof Inbox; tom: keyof typeof TONS; pulsar?: boolean; dica?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between rounded-3xl border-2 p-[2vh_1.4vw]", TONS[tom], pulsar && "animate-pulse")}>
      <div className="flex items-center justify-between gap-3">
        <span className="line-clamp-2 text-[1.9vh] font-semibold uppercase leading-tight tracking-wide">{titulo}</span>
        <Icone className="h-[3.6vh] w-[3.6vh] shrink-0" />
      </div>
      <span className={cn("font-black leading-none tabular-nums", typeof valor === "string" ? "text-[5.5vh]" : "text-[7vh]")}>{valor}</span>
      {dica && <span className="truncate text-[1.5vh] opacity-80">{dica}</span>}
    </div>
  );
}

function Coluna({ titulo, total, tom, children }: { titulo: string; total: number; tom: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col rounded-3xl border border-atd-border bg-atd-surface p-[1.8vh_1.2vw]">
      <h2 className="mb-[1.2vh] flex shrink-0 items-center gap-3 text-[3vh] font-bold">
        <span className={cn("inline-block h-[1.8vh] w-[1.8vh] rounded-full", tom === "ok" ? "bg-atd-ok" : "bg-atd-warn")} />
        {titulo}
        <span className="tabular-nums text-atd-ink-soft">({total})</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function GradeAtendentes({ lista, agora, colunas, compacto }: { lista: AtendenteTv[]; agora: number; colunas?: number; compacto?: boolean }) {
  if (!lista.length) {
    return compacto ? null : <p className="grid flex-1 place-items-center text-[2.4vh] text-atd-ink-soft">Ninguém neste status</p>;
  }
  // Ajusta colunas e linhas para todos caberem sem rolagem (15+ no Online).
  const cols = colunas ?? (compacto ? 4 : lista.length > 10 ? 3 : 2);
  const linhas = Math.max(Math.ceil(lista.length / cols), compacto ? 1 : 5);
  const denso = linhas > 5 || !!compacto;
  return (
    <ul
      className={cn("grid min-h-0 gap-[0.8vh] overflow-hidden", compacto ? "" : "flex-1")}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: compacto ? undefined : `repeat(${linhas}, minmax(0, 1fr))`,
      }}
    >
      {lista.map((a) => {
        const emPausa = a.estado === "PAUSA" || a.estado === "PAUSA_SAIDA";
        const Icone = a.estado === "PAUSA_SAIDA" ? DoorOpen : Coffee;
        const pend = a.esperas.length;
        const crit = a.esperas.filter((d) => faixaEsperaDesde(d, agora) === "critico").length;
        return (
          <li
            key={a.id}
            className={cn(
              "flex min-h-0 flex-col justify-center gap-[0.5vh] overflow-hidden rounded-2xl border bg-atd-bg px-[0.8vw] py-[0.6vh]",
              crit > 0 ? "border-atd-danger" : "border-atd-border",
            )}
          >
            <div className="min-w-0">
              <p className={cn("truncate font-semibold leading-tight", denso ? "text-[1.9vh]" : "text-[2.3vh]")} title={a.nome}>{a.nome}</p>
              {emPausa && (
                <p className="flex items-center gap-2 text-[1.7vh] leading-tight text-atd-warn-ink">
                  <Icone className="h-[1.8vh] w-[1.8vh]" />
                  {a.estado === "PAUSA_SAIDA" ? "Almoço" : "Pausa"}
                  <span className="font-bold tabular-nums">{a.inicioPausa ? formatarTempoPausa(a.inicioPausa, agora) : "—"}</span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-[0.4vw]">
              <Numero rotulo="Atribuídas" valor={a.atribuidas} denso={denso} />
              <Numero rotulo="Pendentes" valor={pend} denso={denso} tom={pend > 0 ? "warn" : undefined} />
              <Numero rotulo="Críticas" valor={crit} denso={denso} tom={crit > 0 ? "danger" : undefined} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Numero({ rotulo, valor, denso, tom }: { rotulo: string; valor: number; denso: boolean; tom?: "warn" | "danger" }) {
  return (
    <div className={cn("flex min-w-0 items-baseline justify-center gap-1 rounded-lg px-1", tom === "danger" ? "bg-atd-danger-bg text-atd-danger-ink" : tom === "warn" ? "bg-atd-warn-bg text-atd-warn-ink" : "")}>
      <span className={cn("font-black tabular-nums leading-none", denso ? "text-[2.4vh]" : "text-[3vh]")}>{valor}</span>
      <span className="truncate text-[1.3vh] text-atd-ink-soft">{rotulo}</span>
    </div>
  );
}
