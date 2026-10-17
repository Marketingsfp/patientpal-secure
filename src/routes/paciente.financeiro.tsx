import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortalAutenticado } from "@/components/portal-paciente/portal-shell";
import { useBaixarPortal } from "@/components/portal-paciente/use-baixar";
import { meuFinanceiro } from "@/lib/portal-paciente/portal-fase2.functions";

export const Route = createFileRoute("/paciente/financeiro")({
  component: () => <PortalAutenticado>{(c) => <Tela clinica={c} />}</PortalAutenticado>,
  head: () => ({
    meta: [
      { title: "Financeiro — Área do Paciente" },
      { name: "description", content: "Pagamentos, pendências, recibos e notas fiscais." },
      { property: "og:title", content: "Financeiro — Área do Paciente" },
      { property: "og:description", content: "Pagamentos, pendências, recibos e notas fiscais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

function Tela({ clinica }: { clinica: string | null }) {
  const ler = useServerFn(meuFinanceiro);
  const { baixar, baixando } = useBaixarPortal(clinica);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-financeiro", clinica],
    queryFn: () => ler({ data: { clinica } }),
  });
  const ocupado = (t: string, id: string) => baixando === `${t}:${id}`;
  return (
    <>
      <Link to="/paciente" className="mb-3 inline-flex items-center text-sm text-primary">
        <ArrowLeft className="mr-1 h-4 w-4" /> Início
      </Link>
      <h1 className="text-xl font-semibold">Financeiro</h1>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <div className="mt-4 space-y-6">
          <section>
            <h2 className="mb-2 font-semibold">Em aberto</h2>
            {data.emAberto.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <div className="space-y-2">
                {data.emAberto.map((p) => (
                  <Card key={p.id} className="p-3">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{p.descricao}</span>
                      <span className="font-semibold">{brl(p.valor)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vencimento: {dataBR(p.vencimento ?? p.data)} · para pagar, fale com a recepção
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Pagamentos</h2>
            {data.pagos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            ) : (
              <div className="space-y-2">
                {data.pagos.map((p) => (
                  <Card key={p.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{p.descricao}</span>
                        <span className="font-semibold">{brl(p.valor)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dataBR(p.data)} · {p.forma}{" "}
                        {p.situacao === "cancelado" ? (
                          <Badge variant="outline">Cancelado</Badge>
                        ) : (
                          <Badge variant="secondary">Pago</Badge>
                        )}
                      </p>
                    </div>
                    {p.situacao === "pago" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado("recibo", p.id)}
                        onClick={() => baixar("recibo", p.id)}
                      >
                        <Download className="mr-1 h-4 w-4" /> Recibo
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Notas fiscais</h2>
            {data.nfse.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma nota fiscal emitida.</p>
            ) : (
              <div className="space-y-2">
                {data.nfse.map((n) => (
                  <Card key={n.id} className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">NFS-e {n.numero ?? ""}</p>
                      <p className="text-xs text-muted-foreground">
                        {dataBR(n.data)} · {brl(n.valor)}
                      </p>
                    </div>
                    {n.temPdf && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado("nfse_pdf", n.id)}
                        onClick={() => baixar("nfse_pdf", n.id)}
                      >
                        PDF
                      </Button>
                    )}
                    {n.temXml && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado("nfse_xml", n.id)}
                        onClick={() => baixar("nfse_xml", n.id)}
                      >
                        XML
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
