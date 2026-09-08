import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Users } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { useAcessoModulo, usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClienteForm, type Paciente } from "@/components/clientes/cliente-form";
import { PacienteCartoesBeneficios } from "@/components/clientes/paciente-cartoes-beneficios";
import { PacienteAtendimentosResumo } from "@/components/clientes/paciente-atendimentos-resumo";
import { PacienteOdontoPanel } from "@/components/clientes/paciente-odonto-panel";
import { PacienteFisioPanel } from "@/components/clientes/paciente-fisio-panel";
import { PacienteSessoesPanel } from "@/components/clientes/paciente-sessoes-panel";
import { prontuarioExibicao } from "@/lib/prontuario";
import { HiperdiaPanel } from "@/components/hiperdia/hiperdia-panel";
import { CriteriosSbd2025 } from "@/components/hiperdia/criterios-sbd-2025";

export const Route = createFileRoute("/_authenticated/app/clientes/$pacienteId/visualizar")({
  component: VisualizarClientePage,
  head: () => ({ meta: [{ title: "Visualizar cliente — ClinicaOS" }] }),
});

function VisualizarClientePage() {
  const { pacienteId } = Route.useParams();
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("clientes");
  const podeHiperdia = usePodeEscrever("hiperdia");
  // A aba de Odontologia só aparece para quem tem o módulo liberado no perfil
  // de acesso — dado clínico não deve vazar para quem não atende odonto.
  const acessoOdonto = useAcessoModulo("odontologia");
  const verOdonto = acessoOdonto !== "none";
  const acessoFisio = useAcessoModulo("fisioterapia");
  const verFisio = acessoFisio !== "none";
  const { user } = useAuth();
  const [paciente, setPaciente] = useState<
    (Paciente & { codigo_prontuario?: string | null }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [aba, setAba] = useState("cadastro");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    void supabase
      .from("pacientes")
      .select("*")
      .eq("id", pacienteId)
      .single()
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
    return () => {
      active = false;
    };
  }, [pacienteId]);

  const voltar = () => navigate({ to: "/app/clientes" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={voltar}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Visualizar cliente
            </h1>
            {paciente && (
              <p className="text-sm text-muted-foreground">
                {paciente.nome}
                {prontuarioExibicao(paciente) && (
                  <span className="ml-2 font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                    Prontuário {prontuarioExibicao(paciente)}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {paciente && podeEscrever && (
          <Button asChild size="sm">
            <Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: paciente.id }}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      ) : notFound || !paciente ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Paciente não encontrado.</p>
        </div>
      ) : !clinicaAtual ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>
        </div>
      ) : (
        // Antes esta página empilhava cadastro, cartões, atendimentos e hiperdia
        // num scroll único e muito longo. As abas mantêm exatamente os mesmos
        // painéis, só que um de cada vez — e abrem espaço para as abas por
        // especialidade (Odontologia hoje, Fisioterapia depois).
        <Tabs value={aba} onValueChange={setAba} className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
            <TabsTrigger value="cartoes">Cartões</TabsTrigger>
            <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
            <TabsTrigger value="hiperdia">Hiperdia</TabsTrigger>
            {/* Sem trava de módulo de propósito: a recepção precisa responder
                "quantas sessões faltam?" no balcão, e ela não tem Fisioterapia
                liberada. A leitura vem de `fn_pacotes_do_paciente`, que devolve
                só a parte administrativa — nada de evolução clínica. */}
            <TabsTrigger value="sessoes">Sessões</TabsTrigger>
            {verOdonto && <TabsTrigger value="odontologia">Odontologia</TabsTrigger>}
            {verFisio && <TabsTrigger value="fisioterapia">Fisioterapia</TabsTrigger>}
          </TabsList>

          <TabsContent value="cadastro">
            <div className="rounded-lg border border-border bg-card p-6">
              <ClienteForm
                clinicaId={clinicaAtual.clinica_id}
                paciente={paciente}
                onCancel={voltar}
                onSaved={voltar}
                readOnly
              />
            </div>
          </TabsContent>

          <TabsContent value="cartoes">
            <PacienteCartoesBeneficios
              pacienteId={paciente.id}
              clinicaId={clinicaAtual.clinica_id}
            />
          </TabsContent>

          <TabsContent value="atendimentos">
            <PacienteAtendimentosResumo
              pacienteId={paciente.id}
              clinicaId={clinicaAtual.clinica_id}
            />
          </TabsContent>

          <TabsContent value="sessoes">
            <PacienteSessoesPanel pacienteId={paciente.id} />
          </TabsContent>

          <TabsContent value="hiperdia" className="space-y-6">
            <HiperdiaPanel
              pacienteId={paciente.id}
              clinicaId={clinicaAtual.clinica_id}
              readOnly={!podeHiperdia}
            />
            <CriteriosSbd2025 />
          </TabsContent>

          {verOdonto && (
            <TabsContent value="odontologia">
              <div className="rounded-lg border border-border bg-card p-6">
                <PacienteOdontoPanel
                  pacienteId={paciente.id}
                  clinicaId={clinicaAtual.clinica_id}
                  readOnly={acessoOdonto !== "write"}
                />
              </div>
            </TabsContent>
          )}

          {verFisio && (
            <TabsContent value="fisioterapia">
              <div className="rounded-lg border border-border bg-card p-6">
                <PacienteFisioPanel
                  pacienteId={paciente.id}
                  pacienteNome={paciente.nome}
                  clinicaId={clinicaAtual.clinica_id}
                  userId={user?.id ?? null}
                  readOnly={acessoFisio !== "write"}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
