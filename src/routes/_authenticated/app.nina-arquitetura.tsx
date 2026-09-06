/**
 * Nina → Arquitetura (FASE 3).
 *
 * Tela somente leitura. Ela desenha o Architecture Manifest já existente
 * (`src/lib/nina/arquitetura/manifesto.ts`). Nada aqui altera o backend, a
 * ordem de execução, prompts, ferramentas ou dados de atendimento.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArquiteturaCanvas } from "@/components/nina/ArquiteturaCanvas";
import { useClinica } from "@/hooks/use-clinica";

export const Route = createFileRoute("/_authenticated/app/nina-arquitetura")({
  head: () => ({
    meta: [
      { title: "Nina — Arquitetura do atendimento" },
      {
        name: "description",
        content:
          "Mapa visual dos componentes reais do backend da Nina: entrada, contexto, conhecimento, modelo, ferramentas, envio e observabilidade.",
      },
      { property: "og:title", content: "Nina — Arquitetura do atendimento" },
      {
        property: "og:description",
        content: "Visualize e audite o caminho que uma mensagem percorre no atendimento da Nina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { clinicaAtual } = useClinica();
  const [modo, setModo] = useState<"arquitetura" | "execucao">("arquitetura");

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Network className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Nina — Arquitetura</h1>
          <p className="text-sm text-muted-foreground">
            Mapa dos componentes reais do atendimento. Mover um item muda apenas o desenho.
          </p>
        </div>
      </header>

      <Tabs value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
        <TabsList>
          <TabsTrigger value="arquitetura">Arquitetura</TabsTrigger>
          <TabsTrigger value="execucao">Execução</TabsTrigger>
        </TabsList>

        <TabsContent value="arquitetura" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">O que a Nina pode fazer</CardTitle>
              <Badge variant="outline">Somente leitura</Badge>
            </CardHeader>
            <CardContent>
              <ArquiteturaCanvas
                chavePosicoes={`nina-arquitetura-posicoes:${clinicaId ?? "sem-clinica"}`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execucao" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">O que aconteceu em uma mensagem</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              O rastreamento de uma mensagem real entra na próxima etapa. Aqui os componentes
              executados ficarão destacados e os não utilizados, apagados.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
