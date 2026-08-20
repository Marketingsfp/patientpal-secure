import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Receipt, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useEspecialidadeOdontoId } from "@/hooks/use-especialidade-odonto";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OrcamentoTab } from "@/components/odontologia/orcamento-tab";
import { OdontoSubnav } from "@/components/odontologia/odonto-subnav";

export const Route = createFileRoute("/_authenticated/app/odontologia/orcamentos")({
  component: OrcamentosOdontoPage,
  head: () => ({ meta: [{ title: "Orçamentos de Odonto — ClinicaOS" }] }),
  validateSearch: (s: Record<string, unknown>): { paciente?: string } => ({
    paciente: typeof s.paciente === "string" ? s.paciente : undefined,
  }),
});

function OrcamentosOdontoPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("odontologia");
  const especialidadeOdontoId = useEspecialidadeOdontoId();

  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  const [novoOrcOpen, setNovoOrcOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInitial, setQuickInitial] = useState("");

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
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Orçamentos de Odonto</h1>
          <p className="text-sm text-muted-foreground">
            Orçamentos com procedimentos da especialidade Odontologia.
          </p>
        </div>
      </div>

      <OdontoSubnav />

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Sem paciente selecionado, a lista mostra os orçamentos de toda a clínica.
            </p>
            <Button
              size="sm"
              onClick={() => setNovoOrcOpen(true)}
              disabled={!podeEscrever || !especialidadeOdontoId || !clinicaAtual}
              title={
                !especialidadeOdontoId ? "Especialidade Odontologia não encontrada" : undefined
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Novo orçamento
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

      <Card>
        <CardContent className="pt-6">
          <OrcamentoTab
            pacienteId={pacienteSel?.id ?? null}
            pacienteNome={pacienteSel?.nome ?? null}
            pacienteTelefone={pacienteSel?.telefone ?? null}
            especialidadeOdontoId={especialidadeOdontoId}
            novoOpen={novoOrcOpen}
            onNovoOpenChange={setNovoOrcOpen}
          />
        </CardContent>
      </Card>

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
