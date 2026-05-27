import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { ClienteForm, type Paciente } from "@/components/clientes/cliente-form";

export const Route = createFileRoute("/_authenticated/app/clientes/$pacienteId/editar")({
  component: EditarClientePage,
  head: () => ({ meta: [{ title: "Editar cliente — ClinicaOS" }] }),
});

function EditarClientePage() {
  const { pacienteId } = Route.useParams();
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    void supabase.from("pacientes").select("*").eq("id", pacienteId).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          if (error) toast.error(error.message);
          return;
        }
        setPaciente(data as Paciente);
        setLoading(false);
      });
    return () => { active = false; };
  }, [pacienteId]);

  const voltar = () => navigate({ to: "/app/clientes" });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={voltar}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Editar cliente
          </h1>
          {paciente && (
            <p className="text-sm text-muted-foreground">{paciente.nome}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : notFound || !paciente ? (
          <p className="text-sm text-muted-foreground">Paciente não encontrado.</p>
        ) : !clinicaAtual ? (
          <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>
        ) : (
          <ClienteForm
            clinicaId={clinicaAtual.clinica_id}
            paciente={paciente}
            onCancel={voltar}
            onSaved={voltar}
          />
        )}
      </div>
    </div>
  );
}