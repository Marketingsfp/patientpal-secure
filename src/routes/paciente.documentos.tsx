import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortalAutenticado } from "@/components/portal-paciente/portal-shell";
import { useBaixarPortal } from "@/components/portal-paciente/use-baixar";
import { meusDocumentos } from "@/lib/portal-paciente/portal-fase2.functions";

export const Route = createFileRoute("/paciente/documentos")({
  component: () => <PortalAutenticado>{(c) => <Lista clinica={c} />}</PortalAutenticado>,
  head: () => ({
    meta: [
      { title: "Meus documentos — Área do Paciente" },
      {
        name: "description",
        content: "Resultados, laudos, receitas e atestados liberados pela clínica.",
      },
      { property: "og:title", content: "Meus documentos — Área do Paciente" },
      {
        property: "og:description",
        content: "Resultados, laudos, receitas e atestados liberados pela clínica.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const TIPO: Record<string, string> = {
  atestado: "Atestado",
  receita: "Receita",
  laudo: "Laudo",
  declaracao: "Declaração",
  outro: "Documento",
  exame: "Resultado de exame",
};

const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

function Lista({ clinica }: { clinica: string | null }) {
  const listar = useServerFn(meusDocumentos);
  const { baixar, baixando } = useBaixarPortal(clinica);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-documentos", clinica],
    queryFn: () => listar({ data: { clinica } }),
  });
  return (
    <>
      <Link to="/paciente" className="mb-3 inline-flex items-center text-sm text-primary">
        <ArrowLeft className="mr-1 h-4 w-4" /> Início
      </Link>
      <h1 className="text-xl font-semibold">Documentos</h1>
      <p className="text-sm text-muted-foreground">
        Aparecem aqui só os documentos que a clínica liberou para você.
      </p>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
      {data && data.itens.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum documento liberado ainda.</p>
      )}
      <div className="mt-4 space-y-2">
        {data?.itens.map((d) => (
          <Card key={`${d.origem}-${d.id}`} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{TIPO[d.tipo] ?? "Documento"}</span>
                {d.novo && <Badge>Novo</Badge>}
              </div>
              <p className="truncate text-sm">{d.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {dataBR(d.data)}
                {d.profissional ? ` · ${d.profissional}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={baixando === `${d.origem}:${d.id}`}
              onClick={() => baixar(d.origem, d.id)}
            >
              <Download className="mr-1 h-4 w-4" /> Abrir
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}
