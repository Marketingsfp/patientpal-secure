import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PacotesFisioTab } from "@/components/fisioterapia/pacotes-fisio-tab";
import { FisioSubnav } from "@/components/fisioterapia/fisio-subnav";

export const Route = createFileRoute("/_authenticated/app/fisioterapia/pacotes")({
  component: FisioPacotesPage,
  head: () => ({ meta: [{ title: "Fisioterapia — Pacotes de Sessões — ClinicaOS" }] }),
  validateSearch: (s: Record<string, unknown>): { paciente?: string } => ({
    paciente: typeof s.paciente === "string" ? s.paciente : undefined,
  }),
});

function FisioPacotesPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("fisioterapia");

  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInitial, setQuickInitial] = useState("");
  const [novoPacoteOpen, setNovoPacoteOpen] = useState(false);

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
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pacotes de Sessões</h1>
          <p className="text-sm text-muted-foreground">
            Sessões contratadas, vínculo com a agenda e controle de presença.
          </p>
        </div>
      </div>

      <FisioSubnav />

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Sem paciente selecionado, a lista mostra os pacotes de toda a clínica.
            </p>
            <Button
              size="sm"
              onClick={() => setNovoPacoteOpen(true)}
              disabled={!podeEscrever || !pacienteSel}
              title={!pacienteSel ? "Escolha um paciente para criar o pacote" : undefined}
            >
              <Plus className="h-4 w-4 mr-1" /> Novo pacote
            </Button>
          </div>
          <Label>Filtrar por paciente</Label>
          <PatientSearchInput
            value={pacienteSel}
            onSelect={setPacienteSel}
            onRequestCreate={(q) => {
              setQuickInitial(q);
              setQuickOpen(true);
            }}
          />
        </CardContent>
      </Card>

      {!clinicaAtual ? (
        <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>
      ) : (
        <PacotesFisioTab
          clinicaId={clinicaAtual.clinica_id}
          pacienteId={pacienteSel?.id ?? null}
          pacienteNome={pacienteSel?.nome ?? null}
          userId={user?.id ?? null}
          readOnly={!podeEscrever}
          novoOpen={novoPacoteOpen}
          onNovoOpenChange={setNovoPacoteOpen}
        />
      )}

      {clinicaAtual && (
        <QuickPatientDialog
          open={quickOpen}
          onOpenChange={setQuickOpen}
          clinicaId={clinicaAtual.clinica_id}
          nomeInicial={quickInitial}
          onCreated={(p) => {
            setPacienteSel(p);
            setQuickOpen(false);
          }}
        />
      )}
    </div>
  );
}
