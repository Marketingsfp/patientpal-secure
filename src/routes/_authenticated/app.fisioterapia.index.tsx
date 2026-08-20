import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AvaliacaoFisioTab } from "@/components/fisioterapia/avaliacao-fisio-tab";
import { FisioSubnav } from "@/components/fisioterapia/fisio-subnav";

export const Route = createFileRoute("/_authenticated/app/fisioterapia/")({
  component: FisioMapaPage,
  head: () => ({ meta: [{ title: "Fisioterapia — Mapa & Avaliação — ClinicaOS" }] }),
  // ?paciente=<uuid> abre a tela já com o paciente escolhido — usado pelo
  // botão "Abrir módulo completo" da aba Fisioterapia na ficha do paciente.
  validateSearch: (s: Record<string, unknown>): { paciente?: string } => ({
    paciente: typeof s.paciente === "string" ? s.paciente : undefined,
  }),
});

function FisioMapaPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("fisioterapia");
  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);

  // O ref garante que a pré-seleção aconteça uma única vez por valor: sem ele,
  // trocar de paciente na tela seria desfeito pelo próprio efeito.
  const { paciente: pacienteParam } = Route.useSearch();
  const paramAplicado = useRef<string | null>(null);
  useEffect(() => {
    if (!pacienteParam || !clinicaAtual) return;
    if (paramAplicado.current === pacienteParam) return;
    paramAplicado.current = pacienteParam;
    void (async () => {
      const { data } = await supabase
        .from("pacientes")
        .select(
          "id,nome,cpf,telefone,data_nascimento,clinica_id,codigo_prontuario,codigo_prontuario_anterior",
        )
        .eq("id", pacienteParam)
        .maybeSingle();
      if (!data) return;
      setPacienteSel(data as unknown as PatientOption);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteParam, clinicaAtual?.clinica_id]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mapa Corporal & Avaliação</h1>
          <p className="text-sm text-muted-foreground">
            Registro de queixas por região do corpo e avaliação fisioterapêutica.
          </p>
        </div>
      </div>

      <FisioSubnav />

      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label>Paciente</Label>
          <PatientSearchInput value={pacienteSel} onSelect={setPacienteSel} />
        </CardContent>
      </Card>

      {!pacienteSel ? (
        <p className="text-sm text-muted-foreground">Selecione um paciente para começar.</p>
      ) : !clinicaAtual ? (
        <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>
      ) : (
        <AvaliacaoFisioTab
          pacienteId={pacienteSel.id}
          clinicaId={clinicaAtual.clinica_id}
          userId={user?.id ?? null}
          readOnly={!podeEscrever}
        />
      )}
    </div>
  );
}
