import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AlertTriangle, Package, Trash2 } from "lucide-react";

export type DividirItem = {
  descricao: string;
  procedimento_id: string | null;
  grupo: string | null;
  tipo: string | null;
};

export type DividirMedicoOpt = {
  id: string;
  nome: string;
  isRecurso: boolean;
};

type GrupoForm = {
  key: string;
  label: string;
  itens: DividirItem[];
  medico_id: string;
  inicio: string;
  duracao: number; // minutos
  observacoes: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  orcamento: { id: string; numero: number; paciente_id: string | null; paciente_nome: string | null };
  itens: DividirItem[];
  medicos: DividirMedicoOpt[];
  inicioPadrao: string; // datetime-local
  onCreated: () => void;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const addMin = (localInput: string, min: number) => {
  const d = new Date(localInput);
  d.setMinutes(d.getMinutes() + min);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function agruparItens(itens: DividirItem[]): GrupoForm[] {
  const map = new Map<string, GrupoForm>();
  for (const it of itens) {
    const g = norm(it.grupo) || norm(it.tipo) || "OUTROS";
    const label = (it.grupo ?? it.tipo ?? "Outros").toUpperCase();
    if (!map.has(g)) {
      map.set(g, {
        key: g,
        label,
        itens: [],
        medico_id: "",
        inicio: "",
        duracao: 30,
        observacoes: "",
      });
    }
    map.get(g)!.itens.push(it);
  }
  return Array.from(map.values());
}

function montarDescricao(g: GrupoForm): string {
  const nomes = g.itens.map((i) => i.descricao);
  if (g.itens.length === 1) return nomes[0];
  const isLab = g.key === "LABORATORIO" || g.key === "LABORATÓRIO" || g.itens.every((i) => norm(i.tipo) === "EXAME" && (norm(i.grupo) === "LABORATORIO" || norm(i.grupo) === "LABORATÓRIO"));
  if (isLab) return `LABORATÓRIO (${nomes.length} EXAMES): ${nomes.join(", ")}`;
  return `${g.label} (${nomes.length} ITENS): ${nomes.join(", ")}`;
}

export function DividirOrcamentoDialog({
  open, onOpenChange, clinicaId, orcamento, itens, medicos, inicioPadrao, onCreated,
}: Props) {
  const [grupos, setGrupos] = useState<GrupoForm[]>([]);
  const [saving, setSaving] = useState(false);
  // Mapas procedimento_id -> Set(medico_id | recurso_id) que executam aquele procedimento.
  const [vincMedicos, setVincMedicos] = useState<Map<string, Set<string>>>(new Map());
  const [vincRecursos, setVincRecursos] = useState<Map<string, Set<string>>>(new Map());
  const [loadingVinc, setLoadingVinc] = useState(false);

  useEffect(() => {
    if (open) {
      const gs = agruparItens(itens).map((g, i) => ({
        ...g,
        inicio: i === 0 ? inicioPadrao : addMin(inicioPadrao, i * 30),
      }));
      setGrupos(gs);
    }
  }, [open, itens, inicioPadrao]);

  // Carrega vínculos profissionais x procedimentos do orçamento.
  useEffect(() => {
    if (!open) return;
    const procIds = Array.from(
      new Set(itens.map((i) => i.procedimento_id).filter((x): x is string => !!x)),
    );
    if (procIds.length === 0) {
      setVincMedicos(new Map());
      setVincRecursos(new Map());
      return;
    }
    let cancel = false;
    (async () => {
      setLoadingVinc(true);
      try {
        const [{ data: mp }, { data: rp }] = await Promise.all([
          supabase
            .from("medico_procedimentos")
            .select("medico_id, procedimento_id")
            .in("procedimento_id", procIds),
          supabase
            .from("enfermagem_recurso_procedimentos")
            .select("recurso_id, procedimento_id")
            .in("procedimento_id", procIds),
        ]);
        if (cancel) return;
        const m = new Map<string, Set<string>>();
        for (const r of mp ?? []) {
          if (!r.procedimento_id || !r.medico_id) continue;
          if (!m.has(r.procedimento_id)) m.set(r.procedimento_id, new Set());
          m.get(r.procedimento_id)!.add(r.medico_id);
        }
        const re = new Map<string, Set<string>>();
        for (const r of rp ?? []) {
          if (!r.procedimento_id || !r.recurso_id) continue;
          if (!re.has(r.procedimento_id)) re.set(r.procedimento_id, new Set());
          re.get(r.procedimento_id)!.add(r.recurso_id);
        }
        setVincMedicos(m);
        setVincRecursos(re);
      } finally {
        if (!cancel) setLoadingVinc(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, itens]);

  const updateGrupo = (idx: number, patch: Partial<GrupoForm>) => {
    setGrupos((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };

  const removerGrupo = (idx: number) => {
    setGrupos((prev) => prev.filter((_, i) => i !== idx));
  };

  const recursoSet = useMemo(() => new Set(medicos.filter((m) => m.isRecurso).map((m) => m.id)), [medicos]);

  // Retorna o set de profissionais permitidos para um grupo (interseção entre todos
  // os procedimentos com procedimento_id). Itens sem procedimento_id são ignorados.
  // Retorna null quando nenhum item do grupo tem procedimento_id → sem restrição.
  const permitidosDoGrupo = (g: GrupoForm): Set<string> | null => {
    const procIds = Array.from(
      new Set(g.itens.map((i) => i.procedimento_id).filter((x): x is string => !!x)),
    );
    if (procIds.length === 0) return null;
    let inter: Set<string> | null = null;
    for (const pid of procIds) {
      const allowed = new Set<string>([
        ...(vincMedicos.get(pid) ?? []),
        ...(vincRecursos.get(pid) ?? []),
      ]);
      inter = inter ? new Set([...inter].filter((x) => allowed.has(x))) : allowed;
      if (inter.size === 0) break;
    }
    return inter;
  };

  const opcoesPorGrupo = (g: GrupoForm) => {
    const permitidos = permitidosDoGrupo(g);
    const filtrados = permitidos ? medicos.filter((m) => permitidos.has(m.id)) : medicos;
    return filtrados.map((m) => ({
      value: m.id,
      label: `${m.isRecurso ? "🏥 " : "👤 "}${m.nome}`,
    }));
  };

  // Limpa profissional selecionado quando ele deixar de pertencer ao set permitido
  // (ex.: após carregar vínculos, ou alteração de itens do grupo).
  useEffect(() => {
    setGrupos((prev) => prev.map((g) => {
      if (!g.medico_id) return g;
      const permitidos = permitidosDoGrupo(g);
      if (!permitidos) return g;
      if (permitidos.has(g.medico_id)) return g;
      return { ...g, medico_id: "" };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vincMedicos, vincRecursos]);

  const podeSalvar = grupos.length > 0 && grupos.every((g) => g.medico_id && g.inicio && g.duracao > 0);

  const handleSalvar = async () => {
    if (!podeSalvar) {
      toast.error("Preencha profissional e horário em todos os grupos.");
      return;
    }
    // Revalida: profissional escolhido precisa executar todos os procedimentos do grupo.
    for (const g of grupos) {
      const permitidos = permitidosDoGrupo(g);
      if (permitidos && !permitidos.has(g.medico_id)) {
        const med = medicos.find((m) => m.id === g.medico_id);
        toast.error(`${med?.nome ?? "Profissional"} não realiza ${g.label}. Selecione outro profissional ou cadastre o serviço no perfil dele.`);
        return;
      }
    }
    if (!orcamento.paciente_id && !orcamento.paciente_nome) {
      toast.error("Orçamento sem paciente.");
      return;
    }
    setSaving(true);
    try {
      const pacote_id = crypto.randomUUID();
      const payloads = grupos.map((g) => {
        const inicioIso = new Date(g.inicio).toISOString();
        const fimIso = new Date(addMin(g.inicio, g.duracao)).toISOString();
        const ehRecurso = recursoSet.has(g.medico_id);
        return {
          clinica_id: clinicaId,
          paciente_nome: orcamento.paciente_nome ?? "",
          paciente_id: orcamento.paciente_id ?? null,
          medico_id: ehRecurso ? null : g.medico_id,
          enfermagem_recurso_id: ehRecurso ? g.medico_id : null,
          inicio: inicioIso,
          fim: fimIso,
          procedimento: montarDescricao(g),
          status: "agendado" as const,
          observacoes: g.observacoes.trim() || null,
          orcamento_id: orcamento.id,
          pacote_id,
        };
      });
      const { error } = await supabase.from("agendamentos").insert(payloads as never);
      if (error) { toast.error(error.message); return; }
      toast.success(`${payloads.length} agendamentos criados (pacote do orçamento #${String(orcamento.numero).padStart(5, "0")}).`);
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Dividir orçamento #{String(orcamento.numero).padStart(5, "0")}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-2">
          Paciente: <span className="font-medium text-foreground">{orcamento.paciente_nome ?? "—"}</span>
          <span className="ml-3">Itens agrupados por tipo. Defina profissional/recurso e horário em cada bloco — os agendamentos ficarão vinculados como um pacote.</span>
        </div>

        <div className="space-y-4">
          {grupos.map((g, idx) => {
            const opts = opcoesPorGrupo(g);
            const permitidos = permitidosDoGrupo(g);
            const vazio = permitidos !== null && opts.length === 0;
            return (
            <div key={g.key} className="border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{g.label}</Badge>
                  <span className="text-xs text-muted-foreground">{g.itens.length} item(ns)</span>
                </div>
                {grupos.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removerGrupo(idx)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="text-xs bg-muted/50 rounded p-2 mb-3 max-h-20 overflow-y-auto">
                {g.itens.map((i) => i.descricao).join(" · ")}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-3">
                  <Label className="text-xs">Profissional / Recurso</Label>
                  <SearchableSelect
                    value={g.medico_id}
                    onChange={(v) => updateGrupo(idx, { medico_id: v })}
                    options={opts}
                    placeholder={loadingVinc ? "Carregando…" : (vazio ? "Nenhum profissional cadastrado para este serviço" : "Selecione…")}
                  />
                  {vazio && (
                    <div className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>Nenhum profissional cadastrado para este serviço. Vincule em Equipe → Médico → Serviços.</span>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input
                    type="datetime-local"
                    value={g.inicio}
                    onChange={(e) => updateGrupo(idx, { inicio: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Duração (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={g.duracao}
                    onChange={(e) => updateGrupo(idx, { duracao: Math.max(5, Number(e.target.value) || 30) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    rows={1}
                    value={g.observacoes}
                    onChange={(e) => updateGrupo(idx, { observacoes: e.target.value })}
                  />
                </div>
              </div>
            </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!podeSalvar || saving || loadingVinc}>
            {saving ? "Criando…" : `Criar ${grupos.length} agendamentos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}