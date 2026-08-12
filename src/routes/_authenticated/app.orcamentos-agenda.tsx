import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  ExternalLink,
  FileText,
  CalendarDays,
  GripVertical,
  Maximize2,
  Minimize2,
  Columns2,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/app/orcamentos-agenda")({
  component: OrcamentosAgendaPage,
  validateSearch: (s: Record<string, unknown>): { orc?: number } => ({
    orc: s.orc != null ? Number(s.orc) : undefined,
  }),
});

type Modo = "split" | "orcamentos" | "agenda";
const LARGURA_KEY = "orcamentos-agenda:leftPct";

// ===== COMPONENTE PRINCIPAL =====
function OrcamentosAgendaPage() {
  const search = Route.useSearch();
  const [leftKey, setLeftKey] = useState(0);
  const [rightKey, setRightKey] = useState(0);
  const [leftPct, setLeftPct] = useState(() => {
    if (typeof window === "undefined") return 45;
    const v = Number(window.localStorage.getItem(LARGURA_KEY));
    return v >= 20 && v <= 80 ? v : 45;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modo, setModo] = useState<Modo>("split");
  const [busca, setBusca] = useState("");
  const [agendaSrc, setAgendaSrc] = useState(
    search.orc ? `/app/agenda?embed=1&orc=${search.orc}` : "/app/agenda?embed=1",
  );
  // A agenda só é montada (e só busca dados) depois que o modo dividido/agenda
  // é usado pela primeira vez.
  const [agendaMontada, setAgendaMontada] = useState(true);

  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const agendaIframeRef = useRef<HTMLIFrameElement>(null);
  const orcamentosIframeRef = useRef<HTMLIFrameElement>(null);

  const orcamentosSrc = useMemo(
    () => (modo === "split" ? "/app/orcamentos?embed=1&compact=1" : "/app/orcamentos?embed=1"),
    [modo],
  );

  const enviarAosOrcamentos = useCallback((msg: Record<string, unknown>) => {
    orcamentosIframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // ===== FUNÇÕES =====
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(20, Math.min(80, pct)));
    };

    const onUp = () => {
      draggingRef.current = false;
      setLeftPct((p) => { window.localStorage.setItem(LARGURA_KEY, String(Math.round(p))); return p; });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        mostrarErro(err, "erro ao entrar em tela cheia");
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const recarregarOrcamentos = useCallback(() => {
    enviarAosOrcamentos({ type: "orc-recarregar" });
    setLeftKey((k) => k + 1);
  }, [enviarAosOrcamentos]);

  const recarregarAgenda = useCallback(() => {
    setAgendaSrc(`/app/agenda?embed=1&t=${Date.now()}`);
    setRightKey((k) => k + 1);
  }, []);

  const abrirEmNovaAba = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  // Busca da barra unificada → repassada ao painel de orçamentos (debounce).
  useEffect(() => {
    const t = setTimeout(() => enviarAosOrcamentos({ type: "orc-busca", q: busca }), 250);
    return () => clearTimeout(t);
  }, [busca, enviarAosOrcamentos]);

  // Relay: o painel de orçamentos pede para agendar → abre a agenda já
  // filtrada pelo médico do orçamento e com o modal pré-preenchido.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; numero?: number; medico_nome?: string | null } | null;
      if (!d || typeof d !== "object") return;

      if (d.type === "agendar-orcamento" && typeof d.numero === "number") {
        setAgendaMontada(true);
        setModo((m) => (m === "orcamentos" ? "split" : m));
        const payload = { type: "agendar-orcamento", numero: d.numero, medico_nome: d.medico_nome ?? null };

        const win = agendaIframeRef.current?.contentWindow;
        if (win) {
          win.postMessage(payload, "*");
          toast.success(`Orçamento #${d.numero} enviado para a agenda`);
        } else {
          // Fallback: (re)carrega a agenda já com o orçamento no parâmetro.
          const med = d.medico_nome ? `&orcmed=${encodeURIComponent(d.medico_nome)}` : "";
          setAgendaSrc(`/app/agenda?embed=1&orc=${d.numero}${med}&t=${Date.now()}`);
          setRightKey((k) => k + 1);
          toast.info("Agenda aberta com o orçamento");
        }
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (modo !== "orcamentos") setAgendaMontada(true);
  }, [modo]);

  const mostrarOrcamentos = modo !== "agenda";
  const mostrarAgenda = modo !== "orcamentos" && agendaMontada;
  const larguraEsquerda = modo === "split" ? `${leftPct}%` : "100%";

  // ===== RENDER =====
  return (
    <TooltipProvider>
      <div className="h-[calc(100vh-3.5rem)] w-full flex flex-col bg-background">
        {/* Barra superior única: busca + modo de visualização + ações */}
        <div className="px-4 py-2.5 border-b bg-card flex items-center gap-3 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-lg">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por paciente, número ou médico…"
              className="pl-9 h-9 rounded-xl"
              aria-label="Buscar orçamentos"
            />
          </div>

          <div className="bg-muted/60 p-1 rounded-full border border-border/40 inline-flex gap-1">
            {([
              ["orcamentos", "Apenas orçamentos", FileText],
              ["split", "Dividido 50/50", Columns2],
              ["agenda", "Apenas agenda", CalendarDays],
            ] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setModo(k)}
                aria-pressed={modo === k}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-all ${
                  modo === k
                    ? "bg-background text-foreground shadow-xs font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={recarregarOrcamentos} className="h-9 w-9 p-0">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recarregar orçamentos</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => abrirEmNovaAba("/app/orcamentos")} className="h-9 w-9 p-0">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Abrir em nova aba</TooltipContent>
            </Tooltip>
            {modo !== "orcamentos" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={recarregarAgenda} className="h-9 w-9 p-0">
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Recarregar agenda</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={toggleFullscreen} className="h-9 w-9 p-0">
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</TooltipContent>
            </Tooltip>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => enviarAosOrcamentos({ type: "orc-novo" })}>
              <Plus className="h-4 w-4" /> Novo orçamento
            </Button>
          </div>
        </div>

        {/* Conteúdo principal */}
        <div ref={containerRef} className="flex-1 flex min-h-0 w-full relative">
          {/* Painel de Orçamentos */}
          <div
            style={{ width: larguraEsquerda, display: mostrarOrcamentos ? "flex" : "none" }}
            className="min-w-0 h-full flex flex-col"
          >
            <iframe
              ref={orcamentosIframeRef}
              key={`${leftKey}-${modo === "split" ? "compact" : "full"}`}
              src={orcamentosSrc}
              className="flex-1 w-full border-0"
              title="Orçamentos"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>

          {/* Divisor (apenas no modo split) */}
          {modo === "split" && (
            <div
              onMouseDown={handleMouseDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar painéis"
              className="w-1.5 shrink-0 bg-border hover:bg-primary/60 cursor-col-resize flex items-center justify-center relative group transition-colors"
              title="Arraste para redimensionar"
            >
              <div className="absolute h-12 w-4 rounded-md border bg-background shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:scale-110">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/5" />
            </div>
          )}

          {/* Painel da Agenda */}
          {mostrarAgenda && (
            <div
              style={{ width: modo === "split" ? `${100 - leftPct}%` : "100%" }}
              className="min-w-0 h-full flex flex-col"
            >
              <iframe
                ref={agendaIframeRef}
                key={rightKey}
                src={agendaSrc}
                className="flex-1 w-full border-0"
                title="Agenda"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          )}
        </div>

        {/* Rodapé enxuto */}
        <div className="px-4 py-1 border-t bg-muted/10 text-[10px] text-muted-foreground flex items-center justify-between shrink-0">
          <span>
            {modo === "split"
              ? `Dividido · ${Math.round(leftPct)}% / ${Math.round(100 - leftPct)}%`
              : modo === "orcamentos"
                ? "Apenas orçamentos"
                : "Apenas agenda"}
          </span>
          <span>
            Clique em <kbd className="px-1.5 py-0.5 bg-muted rounded text-[9px] font-mono">Agendar</kbd> para enviar à agenda
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
