import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Label } from "@/components/ui/label";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { HiperdiaPanel } from "@/components/hiperdia/hiperdia-panel";
import { HiperdiaIAChat } from "@/components/hiperdia/hiperdia-ia-chat";

export const Route = createFileRoute("/_authenticated/app/hiperdia")({
  component: HiperdiaPage,
  head: () => ({
    meta: [
      { title: "Hiperdia — ClinicaOS" },
      {
        name: "description",
        content: "Acompanhamento de pacientes hipertensos e diabéticos: pressão, glicemia e peso.",
      },
    ],
  }),
});

function HiperdiaPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("hiperdia");
  const [paciente, setPaciente] = useState<PatientOption | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mt-2">
        <div className="p-2.5 rounded-2xl bg-primary/10 text-primary border border-primary/15">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hiperdia</h1>
          <p className="text-xs text-muted-foreground">
            Controle de hipertensão e diabetes por paciente.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="space-y-1 max-w-xl">
          <Label>Paciente</Label>
          <PatientSearchInput
            value={paciente}
            onSelect={setPaciente}
            placeholder="Digite nome, CPF, pasta ou nascimento…"
          />
        </div>
      </div>

      {!clinicaAtual ? (
        <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>
      ) : paciente ? (
        <>
          <HiperdiaPanel
            pacienteId={paciente.id}
            clinicaId={clinicaAtual.clinica_id}
            readOnly={!podeEscrever}
          />
          <HiperdiaIAChat pacienteId={paciente.id} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Selecione um paciente para ver o histórico de aferições.
        </p>
      )}
    </div>
  );
}
