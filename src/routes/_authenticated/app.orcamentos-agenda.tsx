import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  ExternalLink,
  FileText,
  CalendarDays,
  GripVertical,
  X,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  SplitSquareVertical,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/orcamentos-agenda")({
  component: OrcamentosAgendaPage,
  validateSearch: (s: Record<string, unknown>) => ({
    orc: s.orc != null ? Number(s.orc) : undefined,
  }),
});

// ===== COMPONENTE PRINCIPAL =====
function OrcamentosAgendaPage() {
  const search = Route.useSearch();
  const [leftKey, setLeftKey] = useState(0);
  const [rightKey, setRightKey] = useState(0);
  const [leftPct, setLeftPct] = useState(45);
  const [agendaAberta, setAgendaAberta] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modoVisualizacao, setModoVisualizacao] = useState<"split" | "orcamentos" | "agenda">(
    "split",
  );
  const [agendaSrc, setAgendaSrc] = useState(
    search.orc ? `/app/agenda?embed=1&orc=${search.orc}` : "/app/agenda?embed=1",
  );
  const [orcamentosSrc] = useState("/app/orcamentos?embed=1");
  const [showDica, setShowDica] = useState(true);

  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const agendaIframeRef = useRef<HTMLIFrameElement>(null);
  const orcamentosIframeRef = useRef<HTMLIFrameElement>(null);

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
    setLeftKey((k) => k + 1);
    toast.success("Orçamentos recarregados");
  }, []);

  const recarregarAgenda = useCallback(() => {
    setAgendaSrc(`/app/agenda?embed=1&t=${Date.now()}`);
    setRightKey((k) => k + 1);
    toast.success("Agenda recarregada");
  }, []);

  const abrirEmNovaAba = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const alternarAgenda = useCallback(() => {
    setAgendaAberta((prev) => {
      if (!prev) {
        // Se estava fechada, volta para split
        setModoVisualizacao("split");
      }
      return !prev;
    });
  }, []);

  // Relay: quando o iframe de orçamentos manda postMessage pedindo para agendar
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;

      if (d.type === "agendar-orcamento" && typeof d.numero === "number") {
        setAgendaAberta(true);
        setModoVisualizacao("split");

        const win = agendaIframeRef.current?.contentWindow;
        if (win) {
          win.postMessage({ type: "agendar-orcamento", numero: d.numero }, "*");
          toast.success(`Orçamento #${d.numero} enviado para a agenda`);
        } else {
          // Fallback: recarrega o iframe com o parâmetro
          setAgendaSrc(`/app/agenda?embed=1&orc=${d.numero}&t=${Date.now()}`);
          setRightKey((k) => k + 1);
          toast.info("Agenda recarregada com o orçamento");
        }
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Atualizar quando o modo de visualização mudar
  useEffect(() => {
    if (modoVisualizacao === "orcamentos") {
      setAgendaAberta(false);
    } else if (modoVisualizacao === "agenda") {
      setAgendaAberta(true);
      setLeftPct(0); // Agenda ocupa 100%
    } else {
      setAgendaAberta(true);
      setLeftPct(45); // Split 45/55
    }
  }, [modoVisualizacao]);

  // ===== RENDER =====
  return (
    <TooltipProvider>
      <div className="h-[calc(100vh-3.5rem)] w-full flex flex-col bg-background">
        {/* Barra superior */}
        <div className="px-4 py-2 border-b bg-muted/20 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Orçamentos + Agenda</span>
              <Badge variant="outline" className="text-[10px] h-5">
                Integrado
              </Badge>
            </div>

            {showDica && (
              <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                <Info className="h-3 w-3" />
                <span>
                  Clique em <span className="font-medium text-emerald-600">Agendar</span> para abrir
                  na agenda
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Modos de visualização */}
            <div className="hidden md:flex items-center gap-1 mr-2 border-r pr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={modoVisualizacao === "split" ? "default" : "ghost"}
                    onClick={() => setModoVisualizacao("split")}
                    className="h-8 px-2"
                  >
                    <SplitSquareVertical className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dividir tela</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={modoVisualizacao === "orcamentos" ? "default" : "ghost"}
                    onClick={() => setModoVisualizacao("orcamentos")}
                    className="h-8 px-2"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Apenas orçamentos</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={modoVisualizacao === "agenda" ? "default" : "ghost"}
                    onClick={() => setModoVisualizacao("agenda")}
                    className="h-8 px-2"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Apenas agenda</TooltipContent>
              </Tooltip>
            </div>

            {/* Controles */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={recarregarOrcamentos}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recarregar orçamentos</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={recarregarAgenda}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recarregar agenda</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => abrirEmNovaAba("/app/orcamentos")}
                  className="h-8 w-8 p-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Abrir orçamentos em nova aba</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleFullscreen}
                  className="h-8 w-8 p-0"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={agendaAberta ? "default" : "ghost"}
                  onClick={alternarAgenda}
                  className="h-8 w-8 p-0"
                >
                  {agendaAberta ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <PanelRightOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{agendaAberta ? "Fechar agenda" : "Abrir agenda"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Conteúdo principal */}
        <div ref={containerRef} className="flex-1 flex min-h-0 w-full relative">
          {/* Painel de Orçamentos */}
          <div
            style={{
              width:
                agendaAberta && modoVisualizacao === "split"
                  ? `${leftPct}%`
                  : modoVisualizacao === "orcamentos"
                    ? "100%"
                    : modoVisualizacao === "agenda"
                      ? "0%"
                      : "100%",
              display: modoVisualizacao === "agenda" ? "none" : "flex",
            }}
            className="min-w-0 h-full flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-blue-500" />
                Orçamentos
                <Badge variant="secondary" className="text-[10px]">
                  {modoVisualizacao === "split" ? `${Math.round(leftPct)}%` : "100%"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={recarregarOrcamentos}
                  className="h-7 w-7 p-0"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => abrirEmNovaAba("/app/orcamentos")}
                  className="h-7 w-7 p-0"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <iframe
              ref={orcamentosIframeRef}
              key={leftKey}
              src={orcamentosSrc}
              className="flex-1 w-full border-0"
              title="Orçamentos"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              loading="lazy"
            />
          </div>

          {/* Divisor (apenas no modo split) */}
          {agendaAberta && modoVisualizacao === "split" && (
            <div
              onMouseDown={handleMouseDown}
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
          {agendaAberta && modoVisualizacao !== "orcamentos" && (
            <div
              style={{
                width: modoVisualizacao === "split" ? `${100 - leftPct}%` : "100%",
                flex: modoVisualizacao === "agenda" ? 1 : undefined,
              }}
              className="min-w-0 h-full flex flex-col"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-emerald-500" />
                  Agenda
                  <Badge variant="secondary" className="text-[10px]">
                    {modoVisualizacao === "split" ? `${Math.round(100 - leftPct)}%` : "100%"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={recarregarAgenda}
                    className="h-7 w-7 p-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => abrirEmNovaAba("/app/agenda")}
                    className="h-7 w-7 p-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  {modoVisualizacao !== "agenda" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAgendaAberta(false)}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <iframe
                ref={agendaIframeRef}
                key={rightKey}
                src={agendaSrc}
                className="flex-1 w-full border-0"
                title="Agenda"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                loading="lazy"
              />
            </div>
          )}
        </div>

        {/* Rodapé com informações */}
        <div className="px-4 py-1 border-t bg-muted/10 text-[10px] text-muted-foreground flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <span>Orçamentos + Agenda integrados</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              {modoVisualizacao === "split"
                ? "Dividido"
                : modoVisualizacao === "orcamentos"
                  ? "Apenas orçamentos"
                  : "Apenas agenda"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Clique em{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[9px] font-mono">Agendar</kbd>{" "}
              para enviar à agenda
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px]"
              onClick={() => setShowDica(!showDica)}
            >
              {showDica ? "Ocultar dica" : "Mostrar dica"}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
