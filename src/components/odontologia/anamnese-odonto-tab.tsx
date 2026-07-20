import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface Row {
  id?: string;
  em_tratamento_medico: boolean | null;
  em_tratamento_desc: string | null;
  medicamentos: string | null;
  alergias: string | null;
  doencas: string | null;
  cirurgias: string | null;
  gestante: boolean | null;
  fumante: boolean | null;
  bebida_alcoolica: boolean | null;
  bruxismo: boolean | null;
  sangramento_gengival: boolean | null;
  sensibilidade: boolean | null;
  ultima_visita_dentista: string | null;
  motivo_consulta: string | null;
  observacoes: string | null;
  respondida_em?: string | null;
}

const EMPTY: Row = {
  em_tratamento_medico: false, em_tratamento_desc: "",
  medicamentos: "", alergias: "", doencas: "", cirurgias: "",
  gestante: false, fumante: false, bebida_alcoolica: false,
  bruxismo: false, sangramento_gengival: false, sensibilidade: false,
  ultima_visita_dentista: "", motivo_consulta: "", observacoes: "",
};

const YESNO: Array<{ key: keyof Row; label: string }> = [
  { key: "em_tratamento_medico", label: "Está em tratamento médico?" },
  { key: "gestante", label: "Gestante?" },
  { key: "fumante", label: "Fumante?" },
  { key: "bebida_alcoolica", label: "Consome bebida alcoólica?" },
  { key: "bruxismo", label: "Bruxismo (range os dentes)?" },
  { key: "sangramento_gengival", label: "Sangramento gengival?" },
  { key: "sensibilidade", label: "Sensibilidade dentária?" },
];

export function AnamneseOdontoTab({ pacienteId, readOnly = false }: { pacienteId: string; readOnly?: boolean }) {
  const { clinicaAtual } = useClinica();
  const [row, setRow] = useState<Row>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clinicaAtual || !pacienteId) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("odonto_anamnese")
        .select("*")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("paciente_id", pacienteId)
        .maybeSingle();
      setRow(data ? { ...EMPTY, ...(data as unknown as Row) } : EMPTY);
      setLoading(false);
    })();
  }, [pacienteId, clinicaAtual?.clinica_id]);

  async function salvar() {
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      paciente_id: pacienteId,
      ...row,
      respondida_em: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from("odonto_anamnese").select("id")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("paciente_id", pacienteId).maybeSingle();
    const { error } = existing
      ? await supabase.from("odonto_anamnese").update(payload).eq("id", existing.id)
      : await supabase.from("odonto_anamnese").insert(payload);
    setSaving(false);
    if (error) return mostrarErro(error);
    toast.success("Anamnese salva");
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const set = <K extends keyof Row>(k: K, v: Row[K]) => setRow(r => ({ ...r, [k]: v }));

  return (
    <div className="space-y-4">
      <div>
        <Label>Motivo da consulta</Label>
        <Textarea disabled={readOnly} rows={2} value={row.motivo_consulta ?? ""} onChange={e => set("motivo_consulta", e.target.value)} />
      </div>
      <div>
        <Label>Última visita ao dentista</Label>
        <Input disabled={readOnly} value={row.ultima_visita_dentista ?? ""} onChange={e => set("ultima_visita_dentista", e.target.value)} placeholder="ex.: há 6 meses" />
      </div>

      <div className="grid md:grid-cols-2 gap-3 pt-2">
        {YESNO.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
            <Checkbox
              disabled={readOnly}
              checked={Boolean(row[key])}
              onCheckedChange={v => set(key, Boolean(v) as never)}
            />
            {label}
          </label>
        ))}
      </div>

      {row.em_tratamento_medico && (
        <div>
          <Label>Detalhes do tratamento médico</Label>
          <Textarea disabled={readOnly} rows={2} value={row.em_tratamento_desc ?? ""} onChange={e => set("em_tratamento_desc", e.target.value)} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Medicamentos em uso</Label>
          <Textarea disabled={readOnly} rows={2} value={row.medicamentos ?? ""} onChange={e => set("medicamentos", e.target.value)} />
        </div>
        <div>
          <Label>Alergias</Label>
          <Textarea disabled={readOnly} rows={2} value={row.alergias ?? ""} onChange={e => set("alergias", e.target.value)} />
        </div>
        <div>
          <Label>Doenças / condições</Label>
          <Textarea disabled={readOnly} rows={2} value={row.doencas ?? ""} onChange={e => set("doencas", e.target.value)} />
        </div>
        <div>
          <Label>Cirurgias anteriores</Label>
          <Textarea disabled={readOnly} rows={2} value={row.cirurgias ?? ""} onChange={e => set("cirurgias", e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Observações</Label>
        <Textarea disabled={readOnly} rows={3} value={row.observacoes ?? ""} onChange={e => set("observacoes", e.target.value)} />
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {row.respondida_em ? `Última atualização: ${new Date(row.respondida_em).toLocaleString("pt-BR")}` : "Ainda não respondida"}
          </p>
          <Button onClick={salvar} disabled={saving}><Save className="h-4 w-4 mr-1" />Salvar anamnese</Button>
        </div>
      )}
    </div>
  );
}