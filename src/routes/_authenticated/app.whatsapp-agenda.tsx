import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, MessageSquare, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/whatsapp-agenda")({
  component: WhatsappAgendaPage,
});

function WhatsappAgendaPage() {
  const [leftKey, setLeftKey] = useState(0);
  const [rightKey, setRightKey] = useState(0);

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

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={50} minSize={30}>
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
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={30}>
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}