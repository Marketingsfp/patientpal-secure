import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";

interface Agenda {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}
interface Procedimento {
  id: string;
  nome: string;
}

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
  const [multipla, setMultipla] = useState<boolean>(false);
  const procedimentoIdsKey = (procedimentoIds ?? []).slice().sort().join("|");

  const load = async () => {
    const [a, mp] = await Promise.all([
      supabase
        .from("medico_agendas")
        .select("id, nome, ativo, ordem")
        .eq("medico_id", medicoId)
        .eq("clinica_id", clinicaId)
        .order("ordem")
        .order("nome"),
      supabase.from("medico_procedimentos").select("procedimento_id").eq("medico_id", medicoId),
    ]);
    let ags = (a.data as Agenda[]) ?? [];
    // C-1: garante agenda padrão para todo médico (necessária para FK de medico_disponibilidades).
    if (ags.length === 0 && medicoId && clinicaId) {
      const { data: novaAg, error: errAg } = await supabase
        .from("medico_agendas")
        .insert({
          clinica_id: clinicaId,
          medico_id: medicoId,
          nome: "AGENDA",
          ordem: 0,
          ativo: true,
        } as never)
        .select("id, nome, ativo, ordem")
        .single();
      if (errAg) {
        mostrarErro(errAg, "falha ao criar agenda padrão");
      } else if (novaAg) {
        ags = [novaAg as Agenda];
      }
    }
    setAgendas(ags);
    setMultipla(ags.length > 1);
    const idsFromDb = new Set(
      ((mp.data as { procedimento_id: string }[] | null) ?? []).map((x) => x.procedimento_id),
    );
    const idsDoFormulario = new Set(procedimentoIds ?? []);
    const idsPermitidos = Array.from(new Set([...idsFromDb, ...idsDoFormulario]));
    if (idsPermitidos.length > 0) {
      const { data: ps, error: pe } = await supabase
        .from("procedimentos")
        .select("id, nome")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .in("id", idsPermitidos)
        .order("nome");
      if (pe) mostrarErro(pe);
      setProcs((ps as Procedimento[]) ?? []);
    } else {
      setProcs([]);
    }
    if (ags.length > 0) {
      const { data: vincs } = await supabase
        .from("medico_agenda_procedimentos")
        .select("agenda_id, procedimento_id")
        .in(
          "agenda_id",
          ags.map((x) => x.id),
        );
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

  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [medicoId, clinicaId, procedimentoIdsKey]);

  const criar = async () => {
<<<<<<< HEAD
    const nome = nova.trim();
    if (!nome) {
      toast.error("Informe o nome");
      return;
    }
    const { data, error } = await supabase
=======
    const base = nova.trim();
    if (!base) { toast.error("Informe o nome"); return; }
    // Existe unique index (medico_id, lower(nome)) em medico_agendas.
    // Se o nome colidir com uma agenda já existente do médico, gera um sufixo
    // numérico automaticamente ("AGENDA 2", "AGENDA 3"…) para o usuário
    // conseguir criar mais horários sem precisar renomear manualmente.
    const nomesExistentes = new Set(agendas.map((x) => x.nome.trim().toLowerCase()));
    let nome = base;
    if (nomesExistentes.has(nome.toLowerCase())) {
      let n = 2;
      while (nomesExistentes.has(`${base} ${n}`.toLowerCase())) n++;
      nome = `${base} ${n}`;
    }
    const { error } = await supabase
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
      .from("medico_agendas")
      .insert({ clinica_id: clinicaId, medico_id: medicoId, nome, ordem: agendas.length } as never)
      .select("id")
      .single();
<<<<<<< HEAD
    if (error) {
      mostrarErro(error);
      return;
    }
=======
    if (error) { mostrarErro(error); return; }
    if (nome !== base) toast.success(`Agenda criada como "${nome}" (já existia uma "${base}").`);
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
    setNova("");
    await load();
  };

  const renomear = async (a: Agenda, novoNome: string) => {
    const nome = novoNome.trim();
    if (!nome || nome === a.nome) return;
    const { error } = await supabase.from("medico_agendas").update({ nome }).eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    void load();
  };

  const toggleAtivo = async (a: Agenda) => {
    const { error } = await supabase
      .from("medico_agendas")
      .update({ ativo: !a.ativo })
      .eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    void load();
  };

  const remover = async (a: Agenda) => {
    if (
      !confirm(
        `Remover agenda "${a.nome}"?\n\n` +
          `- Os horários semanais (disponibilidades) desta agenda serão removidos.\n` +
          `- Consultas já agendadas NÃO serão excluídas, mas perderão o vínculo com esta agenda.`,
      )
    )
      return;
    const { error } = await supabase.from("medico_agendas").delete().eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    void load();
  };

  const toggleProc = async (agendaId: string, procId: string, checked: boolean) => {
    if (!agendaId) return;
    // optimistic update to avoid double-click race producing duplicates
    setVinculos((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(agendaId) ?? new Set<string>());
      if (checked) set.add(procId);
      else set.delete(procId);
      next.set(agendaId, set);
      return next;
    });
    if (checked) {
      const { error } = await supabase
        .from("medico_agenda_procedimentos")
        .upsert(
          { clinica_id: clinicaId, agenda_id: agendaId, procedimento_id: procId } as never,
          { onConflict: "agenda_id,procedimento_id", ignoreDuplicates: true } as never,
        );
      if (error) {
        mostrarErro(error);
        void load();
        return;
      }
    } else {
      const { error } = await supabase
        .from("medico_agenda_procedimentos")
        .delete()
        .eq("agenda_id", agendaId)
        .eq("procedimento_id", procId);
      if (error) {
        mostrarErro(error);
        void load();
        return;
      }
    }
    void load();
  };

  // `procs` is already filtered to services tied to this doctor via medico_procedimentos
  // plus current unsaved services from the Especialidades tab.
  const procsDoMedico = procs;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">Este médico possui mais de uma agenda</Label>
            <p className="text-xs text-muted-foreground">
              Por padrão, o médico tem uma única agenda para tudo. Ative apenas se ele atende em
              agendas separadas (ex.: "Consultas" e "Exames").
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
          O médico utilizará uma única agenda padrão para todos os atendimentos. Nada mais a
          configurar aqui.
        </p>
      )}

      {multipla && (
        <>
          {agendas.map((a) => {
            const vincSet = vinculos.get(a.id) ?? new Set<string>();
            const procsFiltrados = procsDoMedico;
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
                  </div>
                  <div className="border rounded-md p-2 flex flex-wrap gap-2">
                    {procsFiltrados.map((p) => {
                      const selected = vincSet.has(p.id);
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => void toggleProc(a.id, p.id, !selected)}
                          className={`px-3 py-1 rounded-full text-xs uppercase border transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {p.nome}
                        </button>
                      );
                    })}
                    {procsFiltrados.length === 0 && (
                      <p className="text-xs text-muted-foreground w-full text-center py-3">
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
                <Plus className="h-4 w-4 mr-1" />
                Adicionar agenda
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
