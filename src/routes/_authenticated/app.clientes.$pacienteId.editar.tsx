import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { ClienteForm, type Paciente } from "@/components/clientes/cliente-form";
import { PacienteCartoesBeneficios } from "@/components/clientes/paciente-cartoes-beneficios";
import { PacienteAtendimentosResumo } from "@/components/clientes/paciente-atendimentos-resumo";

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
          if (error) mostrarErro(error);
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
            <p className="text-sm text-muted-foreground">
              {paciente.nome}
              {(paciente as any).codigo_prontuario && (
                <span className="ml-2 font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                  Prontuário {(paciente as any).codigo_prontuario}
                </span>
              )}
            </p>
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
      {!loading && paciente && clinicaAtual && (
        <PacienteCartoesBeneficios pacienteId={paciente.id} clinicaId={clinicaAtual.clinica_id} />
      )}
      {!loading && paciente && clinicaAtual && (
        <PacienteAtendimentosResumo pacienteId={paciente.id} clinicaId={clinicaAtual.clinica_id} />
      )}
    </div>
  );
}