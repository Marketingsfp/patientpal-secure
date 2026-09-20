import { lazy, Suspense, useState } from "react";
import { FlaskConical, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConversaTesteAlvo } from "@/lib/nina/homologacao-navegacao";

const CargaTeste = lazy(() => import("./CargaTeste").then((m) => ({ default: m.CargaTeste })));
const CenariosTeste = lazy(() =>
  import("./CenariosTeste").then((m) => ({ default: m.CenariosTeste })),
);
const HomologacaoInbox = lazy(() =>
  import("./HomologacaoInbox").then((m) => ({ default: m.HomologacaoInbox })),
);
const VerificacoesHomologacao = lazy(() =>
  import("./VerificacoesHomologacao").then((m) => ({ default: m.VerificacoesHomologacao })),
);
const DashboardHomologacao = lazy(() =>
  import("./DashboardHomologacao").then((m) => ({ default: m.DashboardHomologacao })),
);
const RelatorioHomologacao = lazy(() =>
  import("./RelatorioHomologacao").then((m) => ({ default: m.RelatorioHomologacao })),
);

const ABAS = [
  { id: "carga", nome: "Testes em carga" },
  { id: "cenarios", nome: "Cenários" },
  { id: "individual", nome: "Simulação individual" },
  { id: "verificacoes", nome: "Verificações" },
  { id: "metricas", nome: "Métricas de homologação" },
  { id: "relatorios", nome: "Relatórios" },
] as const;

export function LaboratorioNina({
  onAbrirChat,
  onVerConversa,
}: {
  onAbrirChat: () => void;
  onVerConversa: (alvo: ConversaTesteAlvo) => void;
}) {
  const [aba, setAba] = useState("carga");
  const [visitadas, setVisitadas] = useState(() => new Set(["carga"]));
  return (
    <section className="space-y-4" aria-label="Laboratório Nina">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FlaskConical className="h-5 w-5" /> Laboratório Nina
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Planeje simulações, acompanhe os testes e consulte os resultados da homologação.
          </p>
        </div>
        <Button variant="outline" onClick={onAbrirChat}>
          <MessageCircle className="mr-2 h-4 w-4" /> Abrir chat de homologação
        </Button>
      </header>
      <Tabs
        value={aba}
        onValueChange={(valor) => {
          setAba(valor);
          setVisitadas((anteriores) => new Set([...anteriores, valor]));
        }}
      >
        <TabsList
          className="h-auto flex-wrap justify-start gap-1"
          aria-label="Funções do Laboratório Nina"
        >
          {ABAS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.nome}
            </TabsTrigger>
          ))}
        </TabsList>
        {ABAS.filter((item) => visitadas.has(item.id)).map((item) => (
          // Preserva os controles já abertos ao trocar de aba: o monitor de carga
          // e as simulações em execução não são desmontados nessa navegação.
          <TabsContent key={item.id} value={item.id} forceMount hidden={aba !== item.id}>
            <Suspense
              fallback={
                <p
                  role="status"
                  className="flex items-center gap-2 p-6 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </p>
              }
            >
              {item.id === "carga" && <CargaTeste />}
              {item.id === "cenarios" && <CenariosTeste />}
              {item.id === "individual" && <HomologacaoInbox laboratorio ativo={aba === item.id} />}
              {item.id === "verificacoes" && <VerificacoesHomologacao />}
              {item.id === "metricas" && <DashboardHomologacao />}
              {item.id === "relatorios" && <RelatorioHomologacao onVerConversa={onVerConversa} />}
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
