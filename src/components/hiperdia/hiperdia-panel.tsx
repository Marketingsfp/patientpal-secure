import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface HiperdiaRegistro {
  id: string;
  data_registro: string;
  pressao_sistolica: number | null;
  pressao_diastolica: number | null;
  glicemia_jejum: number | null;
  glicemia_pos_prandial: number | null;
  peso: number | null;
  observacoes: string | null;
}

interface Form {
  data_registro: string;
  pressao_sistolica: string;
  pressao_diastolica: string;
  glicemia_jejum: string;
  glicemia_pos_prandial: string;
  peso: string;
  observacoes: string;
}

const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const vazio = (): Form => ({
  data_registro: agoraLocal(),
  pressao_sistolica: "",
  pressao_diastolica: "",
  glicemia_jejum: "",
  glicemia_pos_prandial: "",
  peso: "",
  observacoes: "",
});

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

/** Classificação simplificada da pressão arterial (referência SBC). */
function classificarPA(sis: number | null, dia: number | null) {
  if (sis == null || dia == null) return null;
  if (sis >= 180 || dia >= 110) return { label: "Muito elevada", tone: "text-destructive" };
  if (sis >= 140 || dia >= 90) return { label: "Elevada", tone: "text-destructive" };
  if (sis >= 130 || dia >= 85) return { label: "Limítrofe", tone: "text-amber-600" };
  if (sis < 90 || dia < 60) return { label: "Baixa", tone: "text-amber-600" };
  return { label: "Normal", tone: "text-emerald-600" };
}

/** Mini gráfico de linha sem dependências externas. */
function Sparkline({
  valores,
  cor,
  titulo,
  unidade,
}: {
  valores: { x: string; y: number }[];
  cor: string;
  titulo: string;
  unidade: string;
}) {
  if (valores.length < 2) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground mt-2">Dados insuficientes para o gráfico.</p>
      </div>
    );
  }
  const ys = valores.map((v) => v.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const w = 220;
  const h = 56;
  const pontos = valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * w;
    const y = h - ((v.y - min) / span) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ultimo = valores[valores.length - 1];
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="text-sm font-semibold tabular-nums">
          {ultimo.y}
          <span className="text-[10px] font-normal text-muted-foreground ml-1">{unidade}</span>
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 mt-1" preserveAspectRatio="none">
        <polyline
          points={pontos.join(" ")}
          fill="none"
          stroke={cor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="text-[10px] text-muted-foreground">
        mín {min} · máx {max} · {valores.length} aferições
      </p>
    </div>
  );
}

export function HiperdiaPanel({
  pacienteId,
  clinicaId,
  readOnly,
}: {
  pacienteId: string;
  clinicaId: string;
  readOnly?: boolean;
}) {
  const [itens, setItens] = useState<HiperdiaRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(vazio);

  const carregar = useCallback(async () => {
    if (!pacienteId || !clinicaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("hiperdia_registros")
      .select(
        "id, data_registro, pressao_sistolica, pressao_diastolica, glicemia_jejum, glicemia_pos_prandial, peso, observacoes",
      )
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", pacienteId)
      .order("data_registro", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setItens((data ?? []) as HiperdiaRegistro[]);
  }, [pacienteId, clinicaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const cronologico = useMemo(() => [...itens].reverse(), [itens]);
  const serie = (campo: keyof HiperdiaRegistro) =>
    cronologico
      .filter((r) => r[campo] != null)
      .map((r) => ({ x: r.data_registro, y: Number(r[campo]) }));

  const salvar = async () => {
    if (readOnly) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const payload = {
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      data_registro: new Date(form.data_registro).toISOString(),
      pressao_sistolica: num(form.pressao_sistolica),
      pressao_diastolica: num(form.pressao_diastolica),
      glicemia_jejum: num(form.glicemia_jejum),
      glicemia_pos_prandial: num(form.glicemia_pos_prandial),
      peso: num(form.peso),
      observacoes: form.observacoes.trim() || null,
    };
    const temAlgo =
      payload.pressao_sistolica != null ||
      payload.pressao_diastolica != null ||
      payload.glicemia_jejum != null ||
      payload.glicemia_pos_prandial != null ||
      payload.peso != null;
    if (!temAlgo) {
      toast.error("Informe pelo menos uma medição (pressão, glicemia ou peso).");
      return;
    }
    if (
      (payload.pressao_sistolica == null) !== (payload.pressao_diastolica == null) &&
      (payload.pressao_sistolica != null || payload.pressao_diastolica != null)
    ) {
      toast.error("Informe a pressão completa (sistólica e diastólica).");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("hiperdia_registros").insert(payload).select("id");
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Registro não foi salvo. Verifique suas permissões nesta clínica.");
      return;
    }
    toast.success("Aferição registrada.");
    setOpen(false);
    setForm(vazio());
    void carregar();
  };

  const campoNum = (
    key: keyof Form,
    label: string,
    placeholder: string,
    step?: string,
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/15">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Hiperdia</h2>
            <p className="text-xs text-muted-foreground">
              Controle de hipertensão e diabetes do paciente.
            </p>
          </div>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            onClick={() => {
              setForm(vazio());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Nova aferição
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Sparkline
          titulo="Pressão sistólica"
          unidade="mmHg"
          cor="hsl(var(--primary))"
          valores={serie("pressao_sistolica")}
        />
        <Sparkline
          titulo="Pressão diastólica"
          unidade="mmHg"
          cor="hsl(var(--muted-foreground))"
          valores={serie("pressao_diastolica")}
        />
        <Sparkline
          titulo="Glicemia em jejum"
          unidade="mg/dL"
          cor="hsl(var(--primary))"
          valores={serie("glicemia_jejum")}
        />
        <Sparkline titulo="Peso" unidade="kg" cor="hsl(var(--primary))" valores={serie("peso")} />
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-[11px] uppercase tracking-wider">Data</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Pressão</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Glicemia jejum</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Glicemia pós</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Peso</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Observações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhuma aferição registrada.
                </TableCell>
              </TableRow>
            ) : (
              itens.map((r) => {
                const cls = classificarPA(r.pressao_sistolica, r.pressao_diastolica);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(r.data_registro).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.pressao_sistolica != null && r.pressao_diastolica != null ? (
                        <span>
                          {r.pressao_sistolica}/{r.pressao_diastolica}
                          <span className="text-[10px] text-muted-foreground ml-1">mmHg</span>
                          {cls && (
                            <span className={`ml-2 text-[11px] font-medium ${cls.tone}`}>
                              {cls.label}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.glicemia_jejum ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.glicemia_pos_prandial ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.peso != null ? Number(r.peso).toFixed(2).replace(".", ",") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[16rem] truncate">
                      {r.observacoes ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova aferição</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <div className="space-y-1">
              <Label>Data e hora</Label>
              <Input
                type="datetime-local"
                value={form.data_registro}
                onChange={(e) => setForm({ ...form, data_registro: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {campoNum("pressao_sistolica", "Pressão sistólica (mmHg)", "120")}
              {campoNum("pressao_diastolica", "Pressão diastólica (mmHg)", "80")}
              {campoNum("glicemia_jejum", "Glicemia jejum (mg/dL)", "99")}
              {campoNum("glicemia_pos_prandial", "Glicemia pós-prandial (mg/dL)", "140")}
            </div>
            {campoNum("peso", "Peso (kg)", "70,5", "0.01")}
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
