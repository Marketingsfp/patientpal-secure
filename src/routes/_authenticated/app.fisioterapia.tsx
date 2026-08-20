import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Activity, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AvaliacaoFisioTab } from "@/components/fisioterapia/avaliacao-fisio-tab";
import { PacotesFisioTab } from "@/components/fisioterapia/pacotes-fisio-tab";

export const Route = createFileRoute("/_authenticated/app/fisioterapia")({
  component: FisioterapiaPage,
  head: () => ({ meta: [{ title: "Fisioterapia — ClinicaOS" }] }),
  // ?paciente=<uuid> abre a tela já com o paciente escolhido — usado pelo
  // botão "Abrir módulo completo" da aba Fisioterapia na ficha do paciente.
  validateSearch: (s: Record<string, unknown>): { paciente?: string } => ({
    paciente: typeof s.paciente === "string" ? s.paciente : undefined,
  }),
});

function FisioterapiaPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("fisioterapia");

  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  const [pacienteSelPac, setPacienteSelPac] = useState<PatientOption | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInitial, setQuickInitial] = useState("");
  const [novoPacoteOpen, setNovoPacoteOpen] = useState(false);

  // Aba principal controlada pelo hash (#avaliacao / #pacotes), mesmo padrão
  // da Odontologia e da Nina: é o que dá entrada própria no menu lateral.
  const location = useLocation();
  const navigate = useNavigate();
  const hashAba = (location.hash ?? "").replace(/^#/, "");
  const abaAtiva = hashAba === "pacotes" ? "pacotes" : "avaliacao";
  const setAbaAtiva = (v: string) => {
    navigate({ to: "/app/fisioterapia", hash: v, search: (prev) => prev, replace: true });
  };

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
      const opt = data as unknown as PatientOption;
      setPacienteSel(opt);
      setPacienteSelPac(opt);
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
          <h1 className="text-2xl font-bold">Fisioterapia</h1>
          <p className="text-sm text-muted-foreground">
            Mapa corporal, avaliação e pacotes de sessões do paciente.
          </p>
        </div>
      </div>

      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
        <TabsList>
          <TabsTrigger value="avaliacao">Mapa & Avaliação</TabsTrigger>
          <TabsTrigger value="pacotes">Pacotes de Sessões</TabsTrigger>
        </TabsList>

        <TabsContent value="avaliacao" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="pacotes" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold">Pacotes de sessões</h2>
                  <p className="text-xs text-muted-foreground">
                    Sem paciente selecionado, a lista mostra os pacotes de toda a clínica.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setNovoPacoteOpen(true)}
                  disabled={!podeEscrever || !pacienteSelPac}
                  title={!pacienteSelPac ? "Escolha um paciente para criar o pacote" : undefined}
                >
                  <Plus className="h-4 w-4 mr-1" /> Novo pacote
                </Button>
              </div>
              <Label>Filtrar por paciente</Label>
              <PatientSearchInput
                value={pacienteSelPac}
                onSelect={setPacienteSelPac}
                onRequestCreate={(q) => {
                  setQuickInitial(q);
                  setQuickOpen(true);
                }}
              />
            </CardContent>
          </Card>

          {clinicaAtual && (
            <PacotesFisioTab
              clinicaId={clinicaAtual.clinica_id}
              pacienteId={pacienteSelPac?.id ?? null}
              pacienteNome={pacienteSelPac?.nome ?? null}
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
                setPacienteSelPac(p);
                setQuickOpen(false);
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
