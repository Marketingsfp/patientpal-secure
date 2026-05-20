import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/imprimir/$agendamentoId")({
  component: PrintPage,
  head: () => ({ meta: [{ title: "Comprovante — ClinicaOS" }] }),
});

interface Ag {
  id: string; paciente_nome: string; inicio: string; procedimento: string | null;
  observacoes: string | null; clinica_id: string;
}
interface Clin { nome: string }

function PrintPage() {
  const { agendamentoId } = Route.useParams();
  const [ag, setAg] = useState<Ag | null>(null);
  const [clin, setClin] = useState<Clin | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("agendamentos")
        .select("id, paciente_nome, inicio, procedimento, observacoes, clinica_id")
        .eq("id", agendamentoId).single();
      if (data) {
        setAg(data as Ag);
        const { data: c } = await supabase.from("clinicas").select("nome").eq("id", data.clinica_id).single();
        if (c) setClin(c as Clin);
      }
    })();
  }, [agendamentoId]);

  if (!ag) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        .receipt { width: 72mm; font-family: 'Inter', sans-serif; font-size: 11px; line-height: 1.4; color: #000; }
        .receipt h1 { font-size: 14px; font-weight: 700; text-align: center; margin: 4px 0; }
        .receipt .row { display: flex; justify-content: space-between; gap: 6px; }
        .receipt .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .receipt .lbl { color: #555; }
      `}</style>
      <div className="no-print p-4 flex gap-2 border-b">
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Imprimir 80mm</Button>
        <Button size="sm" variant="ghost" onClick={() => window.history.back()}>Voltar</Button>
      </div>
      <div className="flex justify-center py-6">
        <div className="receipt bg-white p-2 shadow">
          <h1>{clin?.nome ?? "Comprovante"}</h1>
          <div className="divider" />
          <div className="row"><span className="lbl">Paciente</span><span>{ag.paciente_nome}</span></div>
          <div className="row"><span className="lbl">Data</span><span>{new Date(ag.inicio).toLocaleDateString("pt-BR")}</span></div>
          <div className="row"><span className="lbl">Hora</span><span>{new Date(ag.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div>
          <div className="row"><span className="lbl">Procedimento</span><span>{ag.procedimento ?? "—"}</span></div>
          {ag.observacoes && (<>
            <div className="divider" />
            <div className="lbl">Observações:</div>
            <div>{ag.observacoes}</div>
          </>)}
          <div className="divider" />
          <div style={{ textAlign: "center", fontSize: 10 }}>
            Emitido em {new Date().toLocaleString("pt-BR")}
          </div>
          <div style={{ textAlign: "center", fontSize: 9, marginTop: 4 }}>
            ID: {ag.id.slice(0, 8)}
          </div>
        </div>
      </div>
    </div>
  );
}