import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Loader2, Trash2, UserPlus, ShieldCheck, AlertCircle } from "lucide-react";

interface Props {
  hrContratoId: string;
  clinicaId: string;
  pacienteId: string | null;
  pacienteNome: string;
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
export function ConvenioFuncionarioTab({ hrContratoId, clinicaId, pacienteId, pacienteNome, podeEscrever }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [contrato, setContrato] = useState<ConvenioContrato | null>(null);
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
  }, [hrContratoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function habilitar() {
    if (!pacienteId) { toast.error("Vincule o funcionário a um cliente na aba \"Dados do contrato\" antes de habilitar o convênio."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("hr_toggle_convenio_funcionario", {
      _hr_contrato_id: hrContratoId,
      _titular_paciente_id: pacienteId,
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
      _titular_paciente_id: contrato!.paciente_id,
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
            {pacienteId ? (
              <div className="text-sm rounded-md border p-2 bg-muted/30">
                <span className="text-muted-foreground">Titular:</span>{" "}
                <span className="font-medium">{pacienteNome || "(cliente selecionado)"}</span>
              </div>
            ) : (
              <div className="text-sm rounded-md border border-dashed p-3 flex items-start gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Vincule o funcionário a um cliente na aba <b>Dados do contrato</b> para habilitar o convênio.
                </span>
              </div>
            )}
            {podeEscrever && (
              <Button onClick={habilitar} disabled={busy || !pacienteId}>
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

      <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <div className="font-medium">Dependentes</div>
          </div>
        {!habilitado ? (
          <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
            Habilite o Convênio Funcionário acima para começar a incluir dependentes.
          </div>
        ) : dependentes.length === 0 ? (
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

        {podeEscrever && habilitado && (
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
    </div>
  );
}