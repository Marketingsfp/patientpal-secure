import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";

interface Agenda { id: string; nome: string; ativo: boolean; ordem: number }
interface Procedimento { id: string; nome: string }

export function MedicoAgendasTab({
  clinicaId,
  medicoId,
  procedimentoIds,
}: {
  clinicaId: string;
  medicoId: string;
  procedimentoIds?: string[];
}) {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, Set<string>>>(new Map());
  const [nova, setNova] = useState("");
  const [filtroProc, setFiltroProc] = useState<Map<string, string>>(new Map());
  const [multipla, setMultipla] = useState<boolean>(false);

  const load = async () => {
    const [a, p] = await Promise.all([
      supabase.from("medico_agendas").select("id, nome, ativo, ordem").eq("medico_id", medicoId).order("ordem").order("nome"),
      supabase.from("procedimentos").select("id, nome").eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
    ]);
    const ags = ((a.data as Agenda[]) ?? []);
    setAgendas(ags);
    setMultipla(ags.length > 1);
    setProcs(((p.data as Procedimento[]) ?? []));
    if (ags.length > 0) {
      const { data: vincs } = await supabase
        .from("medico_agenda_procedimentos")
        .select("agenda_id, procedimento_id")
        .in("agenda_id", ags.map((x) => x.id));
      const map = new Map<string, Set<string>>();
      for (const v of (vincs ?? []) as { agenda_id: string; procedimento_id: string }[]) {
        if (!map.has(v.agenda_id)) map.set(v.agenda_id, new Set());
        map.get(v.agenda_id)!.add(v.procedimento_id);
      }
      setVinculos(map);
    } else {
      setVinculos(new Map());
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [medicoId, clinicaId]);

  const criar = async () => {
    const nome = nova.trim();
    if (!nome) { toast.error("Informe o nome"); return; }
    const { data, error } = await supabase
      .from("medico_agendas")
      .insert({ clinica_id: clinicaId, medico_id: medicoId, nome, ordem: agendas.length } as never)
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    setNova("");
    await load();
  };

  const renomear = async (a: Agenda, novoNome: string) => {
    const nome = novoNome.trim();
    if (!nome || nome === a.nome) return;
    const { error } = await supabase.from("medico_agendas").update({ nome }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const toggleAtivo = async (a: Agenda) => {
    const { error } = await supabase.from("medico_agendas").update({ ativo: !a.ativo }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const remover = async (a: Agenda) => {
    if (!confirm(`Remover agenda "${a.nome}"? Os horários vinculados também serão removidos.`)) return;
    const { error } = await supabase.from("medico_agendas").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const toggleProc = async (agendaId: string, procId: string, checked: boolean) => {
    if (!agendaId) return;
    if (checked) {
      const { error } = await supabase
        .from("medico_agenda_procedimentos")
        .insert({ clinica_id: clinicaId, agenda_id: agendaId, procedimento_id: procId } as never);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase
        .from("medico_agenda_procedimentos")
        .delete()
        .eq("agenda_id", agendaId)
        .eq("procedimento_id", procId);
      if (error) { toast.error(error.message); return; }
    }
    void load();
  };

  const idsMedico = procedimentoIds && procedimentoIds.length > 0 ? new Set(procedimentoIds) : null;
  const procsDoMedico = idsMedico ? procs.filter((p) => idsMedico.has(p.id)) : procs;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">Este médico possui mais de uma agenda</Label>
            <p className="text-xs text-muted-foreground">
              Por padrão, o médico tem uma única agenda para tudo. Ative apenas se ele atende em agendas separadas (ex.: "Consultas" e "Exames").
            </p>
          </div>
          <Switch
            checked={multipla}
            onCheckedChange={(v) => {
              if (!v && agendas.length > 1) {
                toast.error("Remova as agendas extras antes de desativar.");
                return;
              }
              setMultipla(!!v);
            }}
          />
        </CardContent>
      </Card>

      {!multipla && (
        <p className="text-sm text-muted-foreground">
          O médico utilizará uma única agenda padrão para todos os atendimentos. Nada mais a configurar aqui.
        </p>
      )}

      {multipla && (
        <>
          {agendas.map((a) => {
            const vincSet = vinculos.get(a.id) ?? new Set<string>();
            const filtro = filtroProc.get(a.id) ?? "";
            const procsFiltrados = procsDoMedico.filter(
              (p) => !filtro || p.nome.toLowerCase().includes(filtro.toLowerCase()),
            );
            return (
              <Card key={a.id}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs uppercase text-muted-foreground mr-2">Agenda</Label>
                    <Input
                      defaultValue={a.nome}
                      className="max-w-xs uppercase"
                      onBlur={(e) => void renomear(a, e.target.value)}
                    />
                    <label className="flex items-center gap-1 text-xs ml-2">
                      <Checkbox checked={a.ativo} onCheckedChange={() => void toggleAtivo(a)} />
                      Ativa
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => void remover(a)}
                      disabled={agendas.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-2 border-t">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Serviços vinculados
                    </Label>
                    <Input
                      placeholder="Filtrar procedimento..."
                      className="max-w-xs"
                      value={filtro}
                      onChange={(e) => {
                        const next = new Map(filtroProc);
                        next.set(a.id, e.target.value);
                        setFiltroProc(next);
                      }}
                    />
                  </div>
                  <div className="max-h-72 overflow-auto border rounded-md p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {procsFiltrados.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm py-1">
                        <Checkbox
                          checked={vincSet.has(p.id)}
                          onCheckedChange={(v) => void toggleProc(a.id, p.id, !!v)}
                        />
                        <span className="uppercase">{p.nome}</span>
                      </label>
                    ))}
                    {procsFiltrados.length === 0 && (
                      <p className="text-xs text-muted-foreground col-span-full text-center py-3">
                        Nenhum serviço cadastrado para este médico na aba "Especialidades".
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardContent className="py-4 flex gap-2">
              <Input
                placeholder="Nome da nova agenda"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                className="max-w-xs uppercase"
              />
              <Button type="button" onClick={() => void criar()}>
                <Plus className="h-4 w-4 mr-1" />Adicionar agenda
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}