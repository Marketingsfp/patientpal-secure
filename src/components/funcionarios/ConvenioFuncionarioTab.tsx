import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Loader2, Trash2, UserPlus, ShieldCheck } from "lucide-react";

interface Props {
  hrContratoId: string;
  clinicaId: string;
  funcionarioNome: string;
  cpf: string;
  podeEscrever: boolean;
}

interface ConvenioContrato {
  id: string;
  status: string;
  paciente_id: string;
  paciente_nome: string;
  convenio_id: string | null;
}

interface Dependente {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  incluido_em: string;
  ativo: boolean;
}

/**
 * Aba "Convênio" no cadastro do funcionário. Ao habilitar, cria um
 * contrato-sombra em `contratos_assinatura` vinculado ao "Convênio
 * Funcionário" da clínica — sem taxa e sem mensalidade —, o que faz o
 * motor de preços da agenda já reconhecer titular e dependentes como
 * associados do convênio.
 */
export function ConvenioFuncionarioTab({ hrContratoId, clinicaId, funcionarioNome, cpf, podeEscrever }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [contrato, setContrato] = useState<ConvenioContrato | null>(null);
  const [titular, setTitular] = useState<PatientOption | null>(null);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [novoDep, setNovoDep] = useState<PatientOption | null>(null);
  const [novoParentesco, setNovoParentesco] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data: hr } = await supabase
      .from("hr_contratos")
      .select("convenio_contrato_id")
      .eq("id", hrContratoId)
      .maybeSingle();
    const contratoId = (hr as { convenio_contrato_id: string | null } | null)?.convenio_contrato_id ?? null;
    if (!contratoId) {
      setContrato(null);
      setDependentes([]);
      // Tenta pré-selecionar o paciente titular pelo CPF do funcionário.
      if (cpf && funcionarioNome) {
        const cpfDigits = cpf.replace(/\D/g, "");
        if (cpfDigits.length === 11) {
          const { data: p } = await supabase
            .from("pacientes")
            .select("id, nome, cpf, telefone, data_nascimento, clinica_id")
            .eq("clinica_id", clinicaId)
            .eq("cpf", cpfDigits)
            .maybeSingle();
          if (p) setTitular(p as unknown as PatientOption);
        }
      }
      setLoading(false);
      return;
    }
    const [{ data: c }, { data: deps }] = await Promise.all([
      supabase.from("contratos_assinatura").select("id,status,paciente_id,paciente_nome,convenio_id").eq("id", contratoId).maybeSingle(),
      supabase.from("contrato_dependentes").select("id,paciente_id,paciente_nome,parentesco,incluido_em,ativo").eq("contrato_id", contratoId).eq("ativo", true).order("paciente_nome"),
    ]);
    setContrato((c as ConvenioContrato | null) ?? null);
    setDependentes(((deps ?? []) as Dependente[]));
    setLoading(false);
  }, [hrContratoId, clinicaId, cpf, funcionarioNome]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function habilitar() {
    if (!titular) { toast.error("Selecione o paciente titular. O funcionário precisa estar cadastrado como cliente."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("hr_toggle_convenio_funcionario", {
      _hr_contrato_id: hrContratoId,
      _titular_paciente_id: titular.id,
      _habilitar: true,
    });
    setBusy(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Convênio Funcionário habilitado");
    void carregar();
  }

  async function desabilitar() {
    if (!confirm("Deseja realmente desligar o Convênio Funcionário deste funcionário? Os dependentes também serão desativados.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("hr_toggle_convenio_funcionario", {
      _hr_contrato_id: hrContratoId,
      _titular_paciente_id: contrato?.paciente_id ?? hrContratoId,
      _habilitar: false,
    });
    setBusy(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Convênio Funcionário desligado");
    void carregar();
  }

  async function adicionarDependente() {
    if (!novoDep) { toast.error("Selecione o dependente (deve estar cadastrado como cliente)."); return; }
    if (!novoParentesco.trim()) { toast.error("Informe o grau de parentesco."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("hr_convenio_add_dependente", {
      _hr_contrato_id: hrContratoId,
      _paciente_id: novoDep.id,
      _parentesco: novoParentesco.trim(),
    });
    setBusy(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Dependente incluído");
    setNovoDep(null);
    setNovoParentesco("");
    void carregar();
  }

  async function removerDependente(depId: string) {
    if (!confirm("Remover este dependente do convênio?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("hr_convenio_remove_dependente", { _dependente_id: depId });
    setBusy(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Dependente removido");
    void carregar();
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 inline animate-spin" />Carregando…</div>;
  }

  const habilitado = contrato && contrato.status === "ativo";

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div className="font-medium">Convênio Funcionário</div>
          {habilitado && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">Ativo</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Ao habilitar, o funcionário e seus dependentes passam a usar o convênio de funcionários da clínica na agenda —
          sem cobrança de mensalidade nem taxa de inclusão.
        </p>

        {!habilitado ? (
          <div className="space-y-3">
            <div>
              <Label>Paciente titular (funcionário) *</Label>
              <PatientSearchInput
                value={titular}
                onSelect={setTitular}
                clinicaIdsOverride={[clinicaId]}
                placeholder="Buscar o funcionário na lista de pacientes…"
              />
              <p className="text-xs text-muted-foreground mt-1">
                O funcionário precisa estar cadastrado como cliente. {cpf ? `Sugerimos buscar pelo CPF ${cpf}.` : ""}
              </p>
            </div>
            {podeEscrever && (
              <Button onClick={habilitar} disabled={busy || !titular}>
                {busy ? "Habilitando…" : "Habilitar Convênio Funcionário"}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Titular:</span> <span className="font-medium">{contrato?.paciente_nome}</span></div>
            {podeEscrever && (
              <Button variant="outline" size="sm" onClick={desabilitar} disabled={busy}>
                Desligar convênio
              </Button>
            )}
          </div>
        )}
      </Card>

      {habilitado && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <div className="font-medium">Dependentes</div>
          </div>
          {dependentes.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum dependente cadastrado.</div>
          ) : (
            <div className="border rounded-md divide-y">
              {dependentes.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2 text-sm">
                  <div>
                    <div className="font-medium">{d.paciente_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.parentesco || "sem parentesco"} · desde {new Date(d.incluido_em).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  {podeEscrever && (
                    <Button variant="ghost" size="sm" onClick={() => removerDependente(d.id)} disabled={busy}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {podeEscrever && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-medium">Adicionar dependente</div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr,200px,auto] gap-2 items-end">
                <div>
                  <Label>Paciente *</Label>
                  <PatientSearchInput
                    value={novoDep}
                    onSelect={setNovoDep}
                    clinicaIdsOverride={[clinicaId]}
                    placeholder="Buscar o dependente…"
                  />
                </div>
                <div>
                  <Label>Parentesco *</Label>
                  <Input value={novoParentesco} onChange={(e) => setNovoParentesco(e.target.value)} placeholder="Cônjuge, Filho(a)…" />
                </div>
                <Button onClick={adicionarDependente} disabled={busy || !novoDep || !novoParentesco.trim()}>
                  {busy ? "Incluindo…" : "Incluir"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">O dependente precisa estar cadastrado como cliente antes.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}