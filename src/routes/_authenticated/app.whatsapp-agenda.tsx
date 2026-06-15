import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, MessageSquare, CalendarDays, GripVertical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/whatsapp-agenda")({
  component: WhatsappAgendaPage,
});

function WhatsappAgendaPage() {
  const [leftKey, setLeftKey] = useState(0);
  const [rightKey, setRightKey] = useState(0);
  const [leftPct, setLeftPct] = useState(50);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(25, Math.min(75, pct)));
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full flex flex-col bg-background">
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0">
        <div className="text-sm text-muted-foreground">
          Painel combinado · WhatsApp + Agenda lado a lado
        </div>
        <div className="text-xs text-muted-foreground hidden md:block">
          Dica: arraste a barra central para redimensionar.
        </div>
      </div>

      <div ref={containerRef} className="flex-1 flex min-h-0 w-full">
        <div style={{ width: `${leftPct}%` }} className="min-w-0 h-full">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-emerald-500" />
                WhatsApp
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setLeftKey((k) => k + 1)} title="Recarregar">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open("/app/nina#atend-inbox", "_blank", "noopener")}
                  title="Abrir em nova aba"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <iframe
              key={leftKey}
              src="/app/nina#atend-inbox"
              className="flex-1 w-full border-0"
              title="WhatsApp"
            />
          </div>
        </div>

        <div
          onMouseDown={onMouseDown}
          className="w-1.5 shrink-0 bg-border hover:bg-primary/40 cursor-col-resize flex items-center justify-center relative group"
          title="Arraste para redimensionar"
        >
          <div className="absolute h-8 w-3 rounded-sm border bg-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>

        <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 h-full">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-primary" />
                Agenda
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setRightKey((k) => k + 1)} title="Recarregar">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open("/app/agenda", "_blank", "noopener")}
                  title="Abrir em nova aba"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <iframe
              key={rightKey}
              src="/app/agenda"
              className="flex-1 w-full border-0"
              title="Agenda"
            />
          </div>
        </div>
      </div>
    </div>
  );
}