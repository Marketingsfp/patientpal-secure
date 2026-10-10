import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { SimulacaoAtendimento } from "@/components/nina/SimulacaoAtendimento";
import { Button } from "@/components/ui/button";
import { SemCaixaAlta } from "@/components/ui/caixa-alta";
import "@/components/nina/os-zap.css";

export const Route = createFileRoute("/dev/simulacao-atendimento")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: PreviaSimulacao,
});

function PreviaSimulacao() {
  const [ativa, setAtiva] = useState(false);
  return (
    <SemCaixaAlta>
      <main data-os-zap="true" className="h-dvh bg-background text-foreground">
        {ativa ? (
          <SimulacaoAtendimento onEncerrar={() => setAtiva(false)} />
        ) : (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-xl font-semibold">Simulação do atendimento OS ZAP</h1>
            <p>
              Prévia local para Administrador, Supervisão e Telefonia. Usa os mesmos cards e filtros
              da Inbox, com dados fictícios que desaparecem ao encerrar.
            </p>
            <Button onClick={() => setAtiva(true)}>Iniciar simulação</Button>
          </div>
        )}
      </main>
    </SemCaixaAlta>
  );
}
