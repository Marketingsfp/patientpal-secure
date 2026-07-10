import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CreditCard, Plus, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";

interface Contrato {
  id: string;
  numero: number;
  convenio_id: string | null;
  convenio_nome: string;
  status: string;
  data_inicio: string;
  valor_mensal: number;
  vencidas: number;
  total_aberto: number;
}

interface Dependente {
  id: string;
  contrato_id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  ativo: boolean;
}

/**
 * Bloco "Cartão Benefícios" da ficha do paciente.
 * - Lista contratos onde o paciente é TITULAR (com aviso de mensalidades vencidas)
 * - Lista contratos onde o paciente é DEPENDENTE
 * - Permite adicionar dependente diretamente em qualquer contrato em que é titular
 */
export function PacienteCartoesBeneficios({
  pacienteId,
  clinicaId,
}: { pacienteId: string; clinicaId: string }) {
  const [titulares, setTitulares] = useState<Contrato[]>([]);
  const [dependeDe, setDependeDe] = useState<(Contrato & { parentesco: string | null })[]>([]);
  const [deps, setDeps] = useState<Record<string, Dependente[]>>({});
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState<string | null>(null); // contrato_id
  const [novoDep, setNovoDep] = useState<PatientOption | null>(null);
  const [parentesco, setParentesco] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);

    // 1. Contratos como titular
    const { data: cTit } = await supabase
      .from("contratos_assinatura")
      .select("id, numero, convenio_id, status, data_inicio, valor_mensal, cb_convenios(nome)")
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", pacienteId);

    // 2. Contratos onde é dependente
    const { data: dRows } = await supabase
      .from("contrato_dependentes")
      .select("id, contrato_id, parentesco, ativo, contratos_assinatura!inner(id, numero, convenio_id, status, data_inicio, valor_mensal, clinica_id, cb_convenios(nome))")
      .eq("paciente_id", pacienteId)
      .eq("ativo", true);

    const contratoIdsTit = (cTit ?? []).map((c) => c.id);
    const contratoIdsAll = [
      ...contratoIdsTit,
      ...((dRows ?? []) as Array<{ contrato_id: string }>).map((d) => d.contrato_id),
    ];

    // 3. Mensalidades em aberto/vencidas para esses contratos
    let abertas: Record<string, { vencidas: number; total: number }> = {};
    if (contratoIdsAll.length) {
      const { data: ms } = await supabase
        .from("contrato_mensalidades")
        .select("contrato_id, valor, status, vencimento")
        .in("contrato_id", contratoIdsAll)
        .in("status", ["pendente", "aberto", "atrasado", "vencida", "vencido"]);
      for (const m of (ms ?? []) as Array<{ contrato_id: string; valor: number; status: string; vencimento: string }>) {
        const cur = (abertas[m.contrato_id] ??= { vencidas: 0, total: 0 });
        if (m.vencimento < hoje) {
          cur.vencidas++;
          cur.total += Number(m.valor || 0);
        }
      }
    }

    // 4. Dependentes de cada contrato onde é titular (para mostrar lista)
    const depsMap: Record<string, Dependente[]> = {};
    if (contratoIdsTit.length) {
      const { data: dependentesRows } = await supabase
        .from("contrato_dependentes")
        .select("id, contrato_id, paciente_id, paciente_nome, parentesco, ativo")
        .in("contrato_id", contratoIdsTit)
        .eq("ativo", true);
      for (const d of (dependentesRows ?? []) as Dependente[]) {
        (depsMap[d.contrato_id] ??= []).push(d);
      }
    }

    setTitulares(((cTit ?? []) as Array<{ id: string; numero: number; convenio_id: string | null; status: string; data_inicio: string; valor_mensal: number; cb_convenios?: { nome?: string } | null }>).map((c) => ({
      id: c.id, numero: c.numero, convenio_id: c.convenio_id,
      convenio_nome: c.cb_convenios?.nome ?? "Cartão",
      status: c.status, data_inicio: c.data_inicio, valor_mensal: Number(c.valor_mensal),
      vencidas: abertas[c.id]?.vencidas ?? 0, total_aberto: abertas[c.id]?.total ?? 0,
    })));
    setDependeDe(((dRows ?? []) as Array<{ parentesco: string | null; contratos_assinatura: { id: string; numero: number; convenio_id: string | null; status: string; data_inicio: string; valor_mensal: number; cb_convenios?: { nome?: string } | null } }>).map((d) => ({
      id: d.contratos_assinatura.id,
      numero: d.contratos_assinatura.numero,
      convenio_id: d.contratos_assinatura.convenio_id,
      convenio_nome: d.contratos_assinatura.cb_convenios?.nome ?? "Cartão",
      status: d.contratos_assinatura.status,
      data_inicio: d.contratos_assinatura.data_inicio,
      valor_mensal: Number(d.contratos_assinatura.valor_mensal),
      vencidas: abertas[d.contratos_assinatura.id]?.vencidas ?? 0,
      total_aberto: abertas[d.contratos_assinatura.id]?.total ?? 0,
      parentesco: d.parentesco,
    })));
    setDeps(depsMap);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pacienteId, clinicaId]);

  const adicionar = async () => {
    if (!openAdd || !novoDep) return;
    setSaving(true);
    const { error } = await supabase.from("contrato_dependentes").insert({
      contrato_id: openAdd,
      paciente_id: novoDep.id,
      paciente_nome: novoDep.nome,
      parentesco: parentesco.trim() || null,
      ativo: true,
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Dependente adicionado.");
    setOpenAdd(null); setNovoDep(null); setParentesco("");
    await load();
  };

  const remover = async (depId: string) => {
    if (!confirm("Excluir este dependente do contrato?")) return;
    const { error } = await supabase
      .from("contrato_dependentes")
      .update({ ativo: false, excluido_em: new Date().toISOString().slice(0,10) })
      .eq("id", depId);
    if (error) { mostrarErro(error); return; }
    toast.success("Dependente removido.");
    await load();
  };

  const totalContratos = titulares.length + dependeDe.length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-5 w-5 text-primary" />
          Cartão Benefícios
          {totalContratos > 0 && <Badge variant="outline">{totalContratos} contrato(s)</Badge>}
        </div>
      </div>
      <div className="p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : totalContratos === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este paciente não está vinculado a nenhum cartão benefícios.
            <br />
            Para incluí-lo, abra <Link to="/app/cartao-beneficios/contratos" className="text-primary underline">Cartão Benefícios → Vendas</Link>.
          </p>
        ) : (
          <>
            {titulares.map((c) => (
              <div key={c.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground">TITULAR</Badge>
                    <span className="font-medium">{c.convenio_nome}</span>
                    <span className="text-xs text-muted-foreground">#{c.numero}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.vencidas > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {c.vencidas} vencida(s) — R$ {c.total_aberto.toFixed(2)}
                      </Badge>
                    )}
                    <Link to="/app/cartao-beneficios/contratos" search={{ contratoId: c.id }} className="text-xs text-primary underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </Link>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  R$ {c.valor_mensal.toFixed(2)}/mês · início {c.data_inicio.split("-").reverse().join("/")}
                </div>
                <div className="pt-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Dependentes ({deps[c.id]?.length ?? 0})
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setOpenAdd(c.id)} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {(deps[c.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum dependente cadastrado neste contrato.</p>
                  ) : (
                    <ul className="space-y-1">
                      {deps[c.id]!.map((d) => (
                        <li key={d.id} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-muted/30">
                          <span>
                            {d.paciente_nome}
                            {d.parentesco && <span className="text-xs text-muted-foreground ml-2">({d.parentesco})</span>}
                          </span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remover(d.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {dependeDe.map((c) => (
              <div key={`dep-${c.id}`} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">DEPENDENTE{c.parentesco ? ` (${c.parentesco})` : ""}</Badge>
                    <span className="font-medium">{c.convenio_nome}</span>
                    <span className="text-xs text-muted-foreground">#{c.numero}</span>
                  </div>
                  {c.vencidas > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Titular com {c.vencidas} mens. vencida(s)
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <Dialog open={openAdd !== null} onOpenChange={(o) => { if (!o) { setOpenAdd(null); setNovoDep(null); setParentesco(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar dependente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Paciente</Label>
              <PatientSearchInput value={novoDep} onSelect={setNovoDep} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Parentesco</Label>
              <Input value={parentesco} onChange={(e) => setParentesco(e.target.value)} placeholder="Filho(a), Cônjuge, Pai/Mãe..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAdd(null)}>Cancelar</Button>
            <Button onClick={adicionar} disabled={!novoDep || saving}>
              {saving ? "Salvando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}