import { createFileRoute } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import { TabelaValoresPainel } from "@/components/tabela-valores/tabela-valores-painel";

/**
 * Tela cheia da Tabela de Valores.
 *
 * A mesma consulta também abre como gaveta pelo botão "Valores" do cabeçalho
 * (ou Alt+V), que é o caminho usado no meio do atendimento. Esta rota existe
 * para quem quer deixar a tabela aberta numa aba própria durante o plantão.
 *
 * Usa o módulo de permissão "consulta-rapida" (Informações rápidas), que a
 * Recepção, o Caixa, o Médico e a Enfermagem já têm por padrão — não precisa
 * de nova liberação de perfil.
 */
export const Route = createFileRoute("/_authenticated/app/tabela-valores")({
  component: TabelaValoresPage,
  head: () => ({ meta: [{ title: "Tabela de valores — ClinicaOS" }] }),
});

function TabelaValoresPage() {
  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] min-h-0 space-y-3">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" /> Tabela de valores
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulta rápida de preços para informar ao paciente. Somente leitura.
        </p>
      </div>
      <TabelaValoresPainel className="flex-1 min-h-0" />
    </div>
  );
}
