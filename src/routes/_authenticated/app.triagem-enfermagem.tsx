import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { HeartPulse, Bell, ChevronRight, AlertTriangle, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/triagem-enfermagem")({
  component: TriagemEnfermagemPage,
  head: () => ({ meta: [{ title: "Triagem - Enfermagem — ClinicaOS" }] }),
});

type Ag = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  fluxo_etapa: string;
  prioridade?: "normal" | "prioritario" | "urgente";
  medicos?: { nome: string } | null;
};

const DOENCAS_COMUNS = [
  "Diabetes", "Hipertensão", "Asma", "Cardiopatia", "Dislipidemia",
  "Hipotireoidismo", "Hipertireoidismo", "DPOC", "Câncer", "Depressão", "Ansiedade",
];

type Form = {
  peso: string; altura: string;
  pa_sis: string; pa_dia: string;
  fc: string; temp: string; sat: string; glicemia: string;
  queixa: string;
  doencas: string[];
  outras_doencas: string;
  medicamentos: string;
  alergias: string;
  observacoes: string;
};

const formVazio: Form = {
  peso: "", altura: "", pa_sis: "", pa_dia: "", fc: "", temp: "", sat: "", glicemia: "",
  queixa: "", doencas: [], outras_doencas: "", medicamentos: "", alergias: "", observacoes: "",
};

function TriagemEnfermagemPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [ags, setAgs] = useState<Ag[]>([]);
  const [aberto, setAberto] = useState<Ag | null>(null);
  const [form, setForm] = useState<Form>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [consultorio, setConsultorio] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("triagem_consultorio") ?? "" : ""
  );
  useEffect(() => { localStorage.setItem("triagem_consultorio", consultorio); }, [consultorio]);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, procedimento, inicio, fluxo_etapa, prioridade, medicos(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("fluxo_etapa", "triagem")
      .gte("inicio", hoje.toISOString())
      .lt("inicio", amanha.toISOString())
      .order("inicio");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setAgs((data ?? []) as unknown as Ag[]);
  }, [clinicaAtual]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel("triagem-enf")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
          () => void carregar())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual, carregar]);

  const imc = useMemo(() => {
    const p = parseFloat(form.peso.replace(",", "."));
    const a = parseFloat(form.altura.replace(",", "."));
    if (!p || !a) return "";
    const aM = a > 3 ? a / 100 : a; // aceita cm ou m
    const v = p / (aM * aM);
    if (!isFinite(v)) return "";
    return v.toFixed(2);
  }, [form.peso, form.altura]);

  function abrir(a: Ag) {
    setAberto(a); setForm(formVazio);
  }

  function toggleDoenca(d: string) {
    setForm(f => ({ ...f, doencas: f.doencas.includes(d) ? f.doencas.filter(x => x !== d) : [...f.doencas, d] }));
  }

  async function chamarPaciente(a: Ag) {
    if (!clinicaAtual) return;
    if (!consultorio.trim()) { toast.error("Informe o consultório/sala da enfermagem no topo."); return; }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: ult } = await supabase
      .from("senhas").select("numero")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("data_dia", hoje).eq("tipo", "N")
      .order("numero", { ascending: false }).limit(1).maybeSingle();
    const proximoNum = Math.min(9999, (ult?.numero ?? 0) + 1);
    const nomeCurto = a.paciente_nome.split(/\s+/).slice(0, 2).join(" ").toUpperCase().slice(0, 24);
    const guicheStr = `Triagem · Sala ${consultorio.trim()}`;
    const { error } = await supabase.from("senhas").insert({
      clinica_id: clinicaAtual.clinica_id, tipo: "N", numero: proximoNum,
      codigo: nomeCurto, status: "chamada", paciente_id: a.paciente_id,
      guiche: guicheStr, chamada_em: new Date().toISOString(),
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`Chamando ${nomeCurto} · ${guicheStr}`);
    abrir(a);
  }

  async function salvarEAvancar(avancar: boolean) {
    if (!clinicaAtual || !aberto) return;
    setSalvando(true);
    const num = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      return isFinite(n) ? n : null;
    };
    const int = (v: string) => {
      const n = parseInt(v, 10);
      return isFinite(n) ? n : null;
    };
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      agendamento_id: aberto.id,
      paciente_id: aberto.paciente_id,
      enfermeira_id: user?.id ?? null,
      enfermeira_nome: user?.email ?? null,
      peso_kg: num(form.peso),
      altura_cm: num(form.altura),
      imc: imc ? Number(imc) : null,
      pa_sistolica: int(form.pa_sis),
      pa_diastolica: int(form.pa_dia),
      freq_cardiaca: int(form.fc),
      temperatura: num(form.temp),
      saturacao: int(form.sat),
      glicemia: int(form.glicemia),
      queixa_principal: form.queixa || null,
      doencas: form.outras_doencas.trim()
        ? [...form.doencas, ...form.outras_doencas.split(",").map(s => s.trim()).filter(Boolean)]
        : form.doencas,
      medicamentos: form.medicamentos || null,
      alergias: form.alergias || null,
      observacoes: form.observacoes || null,
    };
    const { error } = await supabase.from("triagens_enfermagem").insert(payload as never);
    if (error) { setSalvando(false); toast.error(error.message); return; }

    if (avancar) {
      const isExame = /exame|raio|usg|ultra|tomo|ressona/i.test(aberto.procedimento ?? "");
      const proxima = isExame ? "exame" : "atendimento";
      await supabase.from("agendamentos").update({ fluxo_etapa: proxima } as never).eq("id", aberto.id);
    }
    setSalvando(false);
    toast.success(avancar ? "Triagem salva. Paciente liberado." : "Triagem salva.");
    setAberto(null); setForm(formVazio);
    void carregar();
  }

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-rose-500" /> Triagem - Enfermagem
          </h1>
          <p className="text-sm text-muted-foreground">
            Pacientes na etapa <b>Triagem</b> do fluxo. Chame, registre a anamnese e libere para o atendimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Sala/Consultório</Label>
          <Input value={consultorio} onChange={(e) => setConsultorio(e.target.value.slice(0, 10))}
                 placeholder="Ex.: 1, 2, A" className="h-9 w-24" />
          <Button variant="outline" onClick={carregar} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </div>

      {ags.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum paciente na fila de triagem.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ags.map((a) => {
            const h = new Date(a.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            return (
              <Card key={a.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.paciente_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {h} · {a.procedimento ?? "—"}{a.medicos?.nome ? ` · ${a.medicos.nome}` : ""}
                    </div>
                  </div>
                  {a.prioridade && a.prioridade !== "normal" && (
                    <Badge className={`border-0 text-[10px] gap-1 ${a.prioridade === "urgente" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {a.prioridade === "urgente" ? "URGENTE" : "PRIORITÁRIO"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="flex-1" onClick={() => chamarPaciente(a)}>
                    <Bell className="h-4 w-4 mr-1" /> Chamar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => abrir(a)}>
                    <Stethoscope className="h-4 w-4 mr-1" /> Atender
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Triagem · {aberto?.paciente_nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label className="text-xs">Peso (kg)</Label>
                <Input value={form.peso} onChange={(e) => setForm({ ...form, peso: e.target.value })} placeholder="70" /></div>
              <div><Label className="text-xs">Altura (cm ou m)</Label>
                <Input value={form.altura} onChange={(e) => setForm({ ...form, altura: e.target.value })} placeholder="170" /></div>
              <div><Label className="text-xs">IMC</Label>
                <Input value={imc} readOnly placeholder="—" /></div>
              <div><Label className="text-xs">Temperatura (°C)</Label>
                <Input value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} placeholder="36.5" /></div>
              <div><Label className="text-xs">PA Sistólica</Label>
                <Input value={form.pa_sis} onChange={(e) => setForm({ ...form, pa_sis: e.target.value })} placeholder="120" /></div>
              <div><Label className="text-xs">PA Diastólica</Label>
                <Input value={form.pa_dia} onChange={(e) => setForm({ ...form, pa_dia: e.target.value })} placeholder="80" /></div>
              <div><Label className="text-xs">Freq. Cardíaca</Label>
                <Input value={form.fc} onChange={(e) => setForm({ ...form, fc: e.target.value })} placeholder="75" /></div>
              <div><Label className="text-xs">Saturação O₂ (%)</Label>
                <Input value={form.sat} onChange={(e) => setForm({ ...form, sat: e.target.value })} placeholder="98" /></div>
              <div><Label className="text-xs">Glicemia (mg/dL)</Label>
                <Input value={form.glicemia} onChange={(e) => setForm({ ...form, glicemia: e.target.value })} placeholder="90" /></div>
            </div>

            <div>
              <Label className="text-xs">Queixa principal</Label>
              <Textarea rows={2} value={form.queixa} onChange={(e) => setForm({ ...form, queixa: e.target.value })}
                placeholder="O que trouxe o paciente hoje?" />
            </div>

            <div>
              <Label className="text-xs">Doenças pré-existentes</Label>
              <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {DOENCAS_COMUNS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.doencas.includes(d)} onCheckedChange={() => toggleDoenca(d)} />
                    {d}
                  </label>
                ))}
              </div>
              <Input className="mt-2" value={form.outras_doencas}
                onChange={(e) => setForm({ ...form, outras_doencas: e.target.value })}
                placeholder="Outras (separe por vírgula)" />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Medicamentos em uso</Label>
                <Textarea rows={2} value={form.medicamentos}
                  onChange={(e) => setForm({ ...form, medicamentos: e.target.value })}
                  placeholder="Nome, dose e frequência" />
              </div>
              <div>
                <Label className="text-xs">Alergias</Label>
                <Textarea rows={2} value={form.alergias}
                  onChange={(e) => setForm({ ...form, alergias: e.target.value })}
                  placeholder="Medicamentos, alimentos, etc." />
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações da enfermagem</Label>
              <Textarea rows={2} value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="secondary" onClick={() => salvarEAvancar(false)} disabled={salvando}>
              Salvar
            </Button>
            <Button onClick={() => salvarEAvancar(true)} disabled={salvando}>
              Salvar e liberar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}