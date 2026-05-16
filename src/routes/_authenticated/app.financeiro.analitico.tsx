import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/financeiro/analitico")({
  component: FinAnaliticoPage,
});

function FinAnaliticoPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold capitalize">analitico</h1>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Construction className="h-10 w-10 mx-auto mb-3 text-primary/60" />
          <p className="font-medium">Módulo em construção</p>
          <p className="text-sm mt-1">Será entregue nas próximas etapas (BI, IA, Relatórios e Atendimentos).</p>
        </CardContent>
      </Card>
    </div>
  );
}
