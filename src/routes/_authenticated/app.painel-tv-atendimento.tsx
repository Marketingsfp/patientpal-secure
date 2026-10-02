/**
 * Painel de TV do atendimento (OS ZAP) — tela cheia 1920 x 1080, sem rolagem.
 * Só leitura e só contagens; nenhum dado de paciente aparece na TV.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Clock, Coffee, DoorOpen, Expand, Inbox, MessagesSquare, UserX } from "lucide-react";
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
          <section className="grid h-[24vh] shrink-0 grid-cols-4 gap-[1.2vw]">
            <Kpi titulo="Espera crítica" valor={criticas} icone={AlertTriangle} tom={criticas > 0 ? "danger" : "neutro"} pulsar={criticas > 0} />
            <Kpi titulo="Pendentes" valor={pendentes} icone={Inbox} tom={pendentes > 0 ? "warn" : "neutro"} />
            <Kpi titulo="Não atribuídas" valor={dados?.naoAtribuidas ?? 0} icone={UserX} tom={(dados?.naoAtribuidas ?? 0) > 0 ? "warn" : "neutro"} />
            <Kpi titulo="Conversas hoje" valor={dados?.conversasDoDia ?? 0} icone={MessagesSquare} tom="blue" />
          </section>

          <section className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-[1.2vw]">
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
              <GradeAtendentes lista={pausa} agora={relogio} colunas={1} />
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

function Kpi({ titulo, valor, icone: Icone, tom, pulsar }: { titulo: string; valor: number; icone: typeof Inbox; tom: keyof typeof TONS; pulsar?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between rounded-3xl border-2 p-[2vh_1.4vw]", TONS[tom], pulsar && "animate-pulse")}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[2.4vh] font-semibold uppercase tracking-wide">{titulo}</span>
        <Icone className="h-[3.6vh] w-[3.6vh] shrink-0" />
      </div>
      <span className="text-[11vh] font-black leading-none tabular-nums">{valor}</span>
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
  // Ajusta colunas e tamanho para todos caberem sem rolagem.
  const cols = colunas ?? (lista.length > 12 ? 3 : 2);
  const linhas = Math.ceil(lista.length / cols);
  const denso = linhas > 6 || compacto;
  return (
    <ul
      className="grid min-h-0 flex-1 content-start gap-[1vh] overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {lista.map((a) => {
        const emPausa = a.estado === "PAUSA" || a.estado === "PAUSA_SAIDA";
        const Icone = a.estado === "PAUSA_SAIDA" ? DoorOpen : Coffee;
        return (
          <li
            key={a.id}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-atd-border bg-atd-bg",
              denso ? "px-[0.8vw] py-[0.7vh]" : "px-[1vw] py-[1.3vh]",
            )}
          >
            <div className="min-w-0">
              <p className={cn("truncate font-semibold", denso ? "text-[2vh]" : "text-[2.6vh]")} title={a.nome}>{a.nome}</p>
              {emPausa && (
                <p className="flex items-center gap-2 text-[1.9vh] text-atd-warn-ink">
                  <Icone className="h-[2vh] w-[2vh]" />
                  {a.estado === "PAUSA_SAIDA" ? "Almoço" : "Pausa"}
                  <span className="font-bold tabular-nums">{a.inicioPausa ? formatarTempoPausa(a.inicioPausa, agora) : "—"}</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-end leading-none">
              <span className={cn("font-black tabular-nums", denso ? "text-[3vh]" : "text-[4.2vh]")}>{a.atribuidas}</span>
              <span className="text-[1.4vh] text-atd-ink-soft">{a.atribuidas === 1 ? "conversa" : "conversas"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
