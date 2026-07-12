import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { DateInputBR } from "@/components/ui/date-input-br";
export type DividirItem = {
  id: string;
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
  data: string;        // YYYY-MM-DD
  hora: string;        // HH:MM (slot escolhido)
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

const pad2 = (n: number) => String(n).padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toHmStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const combineLocal = (data: string, hora: string) => new Date(`${data}T${hora}:00`);

type DispoRow = {
  dia_semana: number;
  hora_inicio: string; // HH:MM:SS
  hora_fim: string;
  intervalo_min: number | null;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
};

const hmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};
const minToHm = (n: number) => `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;

function agruparItens(itens: DividirItem[]): GrupoForm[] {
  // Se TODOS os itens forem de laboratório (por grupo, tipo ou nome), colapsa
  // em um único grupo. Laboratório nunca é dividido entre profissionais —
  // vira um único agendamento no médico/recurso "Laboratório".
  const ehLab = (it: DividirItem) => {
    const g = norm(it.grupo);
    const t = norm(it.tipo);
    return g === "LABORATORIO" || t === "EXAME" || t === "LABORATORIO";
  };
  if (itens.length > 0 && itens.every(ehLab)) {
    return [{
      key: "LABORATORIO",
      label: "Laboratório",
      itens: [...itens],
      medico_id: "",
      data: "",
      hora: "",
      duracao: 30,
      observacoes: "",
    }];
  }
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
        data: "",
        hora: "",
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

// Calcula slots livres para um profissional/recurso numa data, com base nas
// disponibilidades semanais e nos agendamentos já existentes. Retorna null
// quando o profissional não tem agenda configurada nem slots pré-gerados
// (fallback para horário livre). Quando há slots pré-gerados ("DISPONIVEL"),
// usa-os como universo de horários. O segundo elemento do retorno mapeia
// HH:MM → id do placeholder a ser reutilizado no save.
async function computarSlots(
  profId: string,
  dataStr: string,
  duracaoMin: number,
  ehRecurso: boolean,
): Promise<{ slots: string[] | null; placeholders: Record<string, string> }> {
  const dia = new Date(`${dataStr}T00:00:00`);
  const dow = dia.getDay(); // 0..6

  let dispos: DispoRow[] = [];
  if (ehRecurso) {
    const { data } = await supabase
      .from("enfermagem_recurso_disponibilidades")
      .select("dia_semana, hora_inicio, hora_fim, intervalo_min")
      .eq("recurso_id", profId)
      .eq("dia_semana", dow)
      .eq("ativo", true);
    dispos = (data ?? []) as DispoRow[];
  } else {
    const { data } = await supabase
      .from("medico_disponibilidades")
      .select("dia_semana, hora_inicio, hora_fim, intervalo_min, vigencia_inicio, vigencia_fim")
      .eq("medico_id", profId)
      .eq("dia_semana", dow)
      .eq("ativo", true);
    dispos = ((data ?? []) as DispoRow[]).filter((d) => {
      if (d.vigencia_inicio && dataStr < d.vigencia_inicio) return false;
      if (d.vigencia_fim && dataStr > d.vigencia_fim) return false;
      return true;
    });
  }

  // Carrega agendamentos do dia para este profissional.
  const inicioDia = new Date(`${dataStr}T00:00:00`).toISOString();
  const fimDia = new Date(`${dataStr}T23:59:59`).toISOString();
  const ags = ehRecurso
    ? await supabase
        .from("agendamentos")
        .select("id, inicio, fim, status, paciente_id, paciente_nome")
        .eq("enfermagem_recurso_id", profId)
        .gte("inicio", inicioDia)
        .lte("inicio", fimDia)
    : await supabase
        .from("agendamentos")
        .select("id, inicio, fim, status, paciente_id, paciente_nome")
        .eq("medico_id", profId)
        .gte("inicio", inicioDia)
        .lte("inicio", fimDia);

  type Ag = { id: string; inicio: string; fim: string; status: string | null; paciente_id: string | null; paciente_nome: string | null };
  const todos = ((ags.data ?? []) as Ag[]).filter((a) => a.status !== "cancelado");
  const placeholdersAg = todos.filter(
    (a) => !a.paciente_id && (a.paciente_nome === null || a.paciente_nome === "" || a.paciente_nome === "DISPONIVEL"),
  );
  const ocupados = todos
    .filter((a) => !placeholdersAg.some((p) => p.id === a.id))
    .map((a) => ({ ini: new Date(a.inicio).getTime(), fim: new Date(a.fim).getTime() }));

  // Sem disponibilidade semanal: se há slots pré-gerados ("Criar/gerar horários"),
  // usá-los como universo de horários.
  if (dispos.length === 0) {
    if (placeholdersAg.length === 0) return { slots: null, placeholders: {} };
    const map: Record<string, string> = {};
    const out: string[] = [];
    for (const p of placeholdersAg) {
      const d = new Date(p.inicio);
      const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      if (!map[hm]) {
        map[hm] = p.id;
        out.push(hm);
      }
    }
    out.sort();
    return { slots: out, placeholders: map };
  }

  const out: string[] = [];
  for (const d of dispos) {
    const step = d.intervalo_min && d.intervalo_min > 0 ? d.intervalo_min : duracaoMin;
    const startMin = hmToMin(d.hora_inicio.slice(0, 5));
    const endMin = hmToMin(d.hora_fim.slice(0, 5));
    for (let m = startMin; m + duracaoMin <= endMin; m += step) {
      const hm = minToHm(m);
      const slotIni = combineLocal(dataStr, hm).getTime();
      const slotFim = slotIni + duracaoMin * 60_000;
      const conflita = ocupados.some((o) => slotIni < o.fim && slotFim > o.ini);
      if (!conflita && !out.includes(hm)) out.push(hm);
    }
  }
  out.sort();
  return { slots: out, placeholders: {} };
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
      // Quebra o datetime padrão em data + hora; cada bloco subsequente recebe sugestão +30min.
      const base = new Date(inicioPadrao);
      const gs = agruparItens(itens).map((g, i) => {
        const d = new Date(base);
        d.setMinutes(d.getMinutes() + i * 30);
        // Pré-seleciona o profissional "Laboratório" quando o grupo é lab.
        let medico_id = "";
        if (g.key === "LABORATORIO") {
          const lab = medicos.find((m) => norm(m.nome).includes("LABORATORIO"));
          if (lab) medico_id = lab.id;
        }
        return { ...g, data: toDateStr(d), hora: toHmStr(d), medico_id };
      });
      setGrupos(gs);
    }
  }, [open, itens, inicioPadrao, medicos]);

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
      if (inter === null) {
        inter = allowed;
      } else {
        const next = new Set<string>();
        inter.forEach((x) => { if (allowed.has(x)) next.add(x); });
        inter = next;
      }
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

  // Cache de slots: chave `${profId}|${data}|${duracao}` → { slots, placeholders }.
  // slots === null significa sem agenda configurada nem placeholders (fallback livre).
  type SlotsEntry = { slots: string[] | null; placeholders: Record<string, string> };
  const [slotsCache, setSlotsCache] = useState<Map<string, SlotsEntry>>(new Map());
  const [loadingSlotsKey, setLoadingSlotsKey] = useState<string | null>(null);

  const slotKey = (profId: string, data: string, dur: number) => `${profId}|${data}|${dur}`;

  // Carrega slots disponíveis para os grupos que já têm profissional + data + duração.
  useEffect(() => {
    if (!open) return;
    const pendentes = grupos
      .filter((g) => g.medico_id && g.data && g.duracao > 0)
      .map((g) => ({ profId: g.medico_id, data: g.data, dur: g.duracao }))
      .filter((x) => !slotsCache.has(slotKey(x.profId, x.data, x.dur)));
    if (pendentes.length === 0) return;
    // Deduplica
    const unicos = Array.from(new Map(pendentes.map((p) => [slotKey(p.profId, p.data, p.dur), p])).values());
    let cancel = false;
    (async () => {
      for (const p of unicos) {
        if (cancel) return;
        const key = slotKey(p.profId, p.data, p.dur);
        setLoadingSlotsKey(key);
        const res = await computarSlots(p.profId, p.data, p.dur, recursoSet.has(p.profId));
        if (cancel) return;
        setSlotsCache((prev) => {
          const next = new Map(prev);
          next.set(key, res);
          return next;
        });
      }
      if (!cancel) setLoadingSlotsKey(null);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grupos, recursoSet]);

  const podeSalvar = grupos.length > 0 && grupos.every((g) => g.medico_id && g.data && g.hora && g.duracao > 0);

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
      const insertPayloads: Array<{ payload: Record<string, unknown>; itens: DividirItem[] }> = [];
      const updates: Array<{ id: string; payload: Record<string, unknown>; itens: DividirItem[] }> = [];
      for (const g of grupos) {
        const inicioDate = combineLocal(g.data, g.hora);
        const fimDate = new Date(inicioDate.getTime() + g.duracao * 60_000);
        const inicioIso = inicioDate.toISOString();
        const fimIso = fimDate.toISOString();
        const ehRecurso = recursoSet.has(g.medico_id);
        const payload = {
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
        // Se o slot escolhido é um placeholder pré-gerado, atualiza a linha existente.
        const entry = slotsCache.get(slotKey(g.medico_id, g.data, g.duracao));
        const placeholderId = entry?.placeholders[g.hora];
        if (placeholderId) {
          updates.push({ id: placeholderId, payload, itens: g.itens });
        } else {
          insertPayloads.push({ payload, itens: g.itens });
        }
      }

      const agendamentoIds: Array<{ id: string; itens: DividirItem[] }> = [];
      if (insertPayloads.length > 0) {
        const { data: inseridos, error } = await supabase
          .from("agendamentos")
          .insert(insertPayloads.map((x) => x.payload) as never)
          .select("id");
        if (error) { mostrarErro(error); return; }
        (inseridos ?? []).forEach((r: { id: string }, i: number) => {
          agendamentoIds.push({ id: r.id, itens: insertPayloads[i].itens });
        });
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("agendamentos")
          .update(u.payload as never)
          .eq("id", u.id);
        if (error) { mostrarErro(error); return; }
        agendamentoIds.push({ id: u.id, itens: u.itens });
      }

      // Grava vínculo agendamento ↔ itens do orçamento (1 linha por item).
      const vinculos: Array<{
        clinica_id: string; agendamento_id: string; orcamento_id: string; orcamento_item_id: string;
      }> = [];
      for (const a of agendamentoIds) {
        for (const it of a.itens) {
          if (!it.id) continue;
          vinculos.push({
            clinica_id: clinicaId,
            agendamento_id: a.id,
            orcamento_id: orcamento.id,
            orcamento_item_id: it.id,
          });
        }
      }
      if (vinculos.length > 0) {
        const { error: vErr } = await supabase
          .from("agendamento_orcamento_itens")
          .insert(vinculos as never);
        if (vErr) mostrarErro(vErr, "agendamentos criados, mas vínculo com itens falhou");
      }
      toast.success(`${grupos.length} agendamentos criados (pacote do orçamento #${String(orcamento.numero).padStart(5, "0")}).`);
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
                  <Label className="text-xs">Data</Label>
                  <DateInputBR
                    value={g.data}
                    onChange={(e) => updateGrupo(idx, { data: e.target.value, hora: "" })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Horário disponível</Label>
                  {(() => {
                    if (!g.medico_id || !g.data) {
                      return <Input value="" disabled placeholder="Escolha profissional e data" />;
                    }
                    const key = slotKey(g.medico_id, g.data, g.duracao);
                    const entry = slotsCache.get(key);
                    const loading = loadingSlotsKey === key || (entry === undefined);
                    if (loading) {
                      return <Input value="" disabled placeholder="Carregando horários…" />;
                    }
                    const slots = entry!.slots;
                    // slots === null → sem agenda configurada → fallback livre
                    if (slots === null) {
                      return (
                        <>
                          <Input
                            type="time"
                            value={g.hora}
                            onChange={(e) => updateGrupo(idx, { hora: e.target.value })}
                          />
                          <div className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>Sem agenda configurada — horário livre.</span>
                          </div>
                        </>
                      );
                    }
                    if (slots.length === 0) {
                      return (
                        <>
                          <Input value="" disabled placeholder="Sem horários nessa data" />
                          <div className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>Nenhum horário livre nessa data. Escolha outro dia.</span>
                          </div>
                        </>
                      );
                    }
                    return (
                      <Select value={g.hora} onValueChange={(v) => updateGrupo(idx, { hora: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {slots.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
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