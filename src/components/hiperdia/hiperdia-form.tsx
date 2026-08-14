import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  pacienteId: string;
  clinicaId: string;
  /** Chamado após gravar com sucesso, para a lista recarregar. */
  onSaved?: () => void;
  disabled?: boolean;
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

/** `datetime-local` usa horário local, sem fuso — igual ao form de prontuários. */
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

/** "" → null; texto numérico → número. Espelha os CHECK da tabela. */
const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Valida antes de ir ao banco. As mesmas regras existem como CHECK na tabela —
 * aqui elas só servem para dar mensagem em português em vez de erro do Postgres.
 */
function validar(f: Form): string | null {
  const sis = num(f.pressao_sistolica);
  const dia = num(f.pressao_diastolica);
  const jej = num(f.glicemia_jejum);
  const pos = num(f.glicemia_pos_prandial);
  const peso = num(f.peso);

  if (!f.data_registro) return "Informe a data da aferição.";
  if (new Date(f.data_registro).getTime() > Date.now())
    return "A data da aferição não pode estar no futuro.";

  if ((sis === null) !== (dia === null))
    return "Preencha a pressão completa (sistólica e diastólica) ou deixe as duas em branco.";

  if (sis === null && jej === null && pos === null && peso === null)
    return "Preencha ao menos uma medida: pressão, glicemia ou peso.";

  if (sis !== null && (sis < 40 || sis > 300)) return "Pressão sistólica fora da faixa (40 a 300).";
  if (dia !== null && (dia < 20 || dia > 200))
    return "Pressão diastólica fora da faixa (20 a 200).";
  if (sis !== null && dia !== null && dia >= sis)
    return "A pressão diastólica deve ser menor que a sistólica. Confira se os valores não foram trocados.";
  if (jej !== null && (jej < 10 || jej > 1000))
    return "Glicemia de jejum fora da faixa (10 a 1000).";
  if (pos !== null && (pos < 10 || pos > 1000))
    return "Glicemia pós-prandial fora da faixa (10 a 1000).";
  if (peso !== null && (peso < 0.5 || peso > 500)) return "Peso fora da faixa (0,5 a 500 kg).";
  if (f.observacoes.length > 2000) return "Observações: máximo de 2000 caracteres.";

  return null;
}

export function HiperdiaForm({ pacienteId, clinicaId, onSaved, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(vazio);
  const [salvando, setSalvando] = useState(false);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const erro = validar(form);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
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
    // `hiperdia_registros` ainda não existe no types.ts gerado pelo Supabase CLI.
    // Mesmo escape usado por SimpleCrud e useCrud.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("hiperdia_registros" as any) as any).insert(payload);
    setSalvando(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Aferição registrada");
    setForm(vazio());
    setOpen(false);
    onSaved?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setForm(vazio());
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <HeartPulse className="h-4 w-4 mr-2" /> Nova aferição
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova aferição — Hiperdia</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="hd-data">Data e hora *</Label>
            <Input
              id="hd-data"
              type="datetime-local"
              value={form.data_registro}
              onChange={(e) => set({ data_registro: e.target.value })}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Pressão arterial (mmHg)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="hd-sis" className="text-xs text-muted-foreground">
                  Sistólica (máxima)
                </Label>
                <Input
                  id="hd-sis"
                  type="number"
                  inputMode="numeric"
                  placeholder="120"
                  value={form.pressao_sistolica}
                  onChange={(e) => set({ pressao_sistolica: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hd-dia" className="text-xs text-muted-foreground">
                  Diastólica (mínima)
                </Label>
                <Input
                  id="hd-dia"
                  type="number"
                  inputMode="numeric"
                  placeholder="80"
                  value={form.pressao_diastolica}
                  onChange={(e) => set({ pressao_diastolica: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Glicemia (mg/dL)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="hd-jej" className="text-xs text-muted-foreground">
                  Em jejum
                </Label>
                <Input
                  id="hd-jej"
                  type="number"
                  inputMode="numeric"
                  placeholder="99"
                  value={form.glicemia_jejum}
                  onChange={(e) => set({ glicemia_jejum: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hd-pos" className="text-xs text-muted-foreground">
                  Pós-prandial
                </Label>
                <Input
                  id="hd-pos"
                  type="number"
                  inputMode="numeric"
                  placeholder="140"
                  value={form.glicemia_pos_prandial}
                  onChange={(e) => set({ glicemia_pos_prandial: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="hd-peso">Peso (kg)</Label>
            <Input
              id="hd-peso"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="70,5"
              value={form.peso}
              onChange={(e) => set({ peso: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="hd-obs">Observações</Label>
            <Textarea
              id="hd-obs"
              rows={3}
              maxLength={2000}
              value={form.observacoes}
              onChange={(e) => set({ observacoes: e.target.value })}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Preencha ao menos uma medida. A aferição não pode ser editada depois de gravada — para
            corrigir, registre uma nova.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar aferição"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
