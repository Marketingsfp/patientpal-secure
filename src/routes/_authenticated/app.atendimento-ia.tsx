import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Brain, Sparkles, FileHeart, Stethoscope, Save, Loader2, History, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceInput } from "@/components/voice-input";
import { Cid10Picker } from "@/components/cid10-picker";
import { toast } from "sonner";
import {
  gerarAnamneseEstruturada,
  sugerirCondutaClinica,
  resumirHistoricoPaciente,
} from "@/lib/atendimento-ai.functions";

export const Route = createFileRoute("/_authenticated/app/atendimento-ia")({
  component: AtendimentoIaPage,
  head: () => ({ meta: [{ title: "Atendimento médico — ClinicaOS" }] }),
});

type Modelo = { id: string; nome: string; prompt_ia: string | null };
type Paciente = { id: string; nome: string };
type Medico = { id: string; nome: string };

const SOAP_KEYS = [
  ["queixa_principal", "Queixa principal", 2],
  ["historia_doenca", "História da doença atual", 3],
  ["exame_fisico", "Exame físico", 3],
  ["hipotese_diagnostica", "Hipótese diagnóstica", 2],
  ["conduta", "Conduta", 3],
  ["prescricao", "Prescrição", 4],
] as const;
type Soap = Record<(typeof SOAP_KEYS)[number][0], string>;
const EMPTY: Soap = { queixa_principal: "", historia_doenca: "", exame_fisico: "", hipotese_diagnostica: "", conduta: "", prescricao: "" };

function AtendimentoIaPage() {
  const { clinicaAtual } = useClinica();
  const estruturar = useServerFn(gerarAnamneseEstruturada);
  const sugerir = useServerFn(sugerirCondutaClinica);
  const resumir = useServerFn(resumirHistoricoPaciente);

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);

  const [pacienteId, setPacienteId] = useState("");
  const [medicoId, setMedicoId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [transcricao, setTranscricao] = useState("");
  const [soap, setSoap] = useState<Soap>(EMPTY);
  const [sugestoes, setSugestoes] = useState<{ cids: { codigo: string; descricao: string }[]; exames: string[]; prescricao: string } | null>(null);
  const [resumo, setResumo] = useState<string>("");
  const [resumoOpen, setResumoOpen] = useState(false);
  const [loading, setLoading] = useState<"estruturar" | "sugerir" | "resumir" | "salvar" | null>(null);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      const cid = clinicaAtual.clinica_id;
      const [p, m, md] = await Promise.all([
        supabase.from("pacientes").select("id, nome").eq("clinica_id", cid).eq("ativo", true).order("nome"),
        supabase.from("medicos").select("id, nome").eq("clinica_id", cid).eq("ativo", true).order("nome"),
        supabase.from("prontuario_modelos").select("id, nome, prompt_ia").eq("clinica_id", cid).eq("ativo", true).order("nome"),
      ]);
      setPacientes(p.data ?? []);
      setMedicos(m.data ?? []);
      setModelos((md.data ?? []) as Modelo[]);
      if (md.data && md.data.length && !modeloId) setModeloId(md.data[0].id);
    })();
  }, [clinicaAtual?.clinica_id]);

  const modelo = useMemo(() => modelos.find((x) => x.id === modeloId) ?? null, [modelos, modeloId]);
  const especialidade = modelo?.nome ?? "Clínica Geral";

  async function handleEstruturar() {
    if (!transcricao.trim()) { toast.error("Grave ou cole a transcrição primeiro"); return; }
    setLoading("estruturar");
    try {
      const out = await estruturar({ data: { transcricao, especialidade, promptExtra: modelo?.prompt_ia ?? undefined } });
      setSoap((s) => ({
        queixa_principal: out.queixa_principal || s.queixa_principal,
        historia_doenca: out.historia_doenca || s.historia_doenca,
        exame_fisico: out.exame_fisico || s.exame_fisico,
        hipotese_diagnostica: out.hipotese_diagnostica || s.hipotese_diagnostica,
        conduta: out.conduta || s.conduta,
        prescricao: out.prescricao || s.prescricao,
      }));
      toast.success("Anamnese estruturada");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(null); }
  }

  async function handleSugerir() {
    setLoading("sugerir");
    try {
      const out = await sugerir({ data: { ...soap, especialidade } });
      setSugestoes(out);
      toast.success("Sugestões geradas");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(null); }
  }

  async function handleResumir() {
    if (!pacienteId) { toast.error("Selecione o paciente"); return; }
    setLoading("resumir");
    try {
      const out = await resumir({ data: { pacienteId } });
      setResumo(out.resumo);
      setResumoOpen(true);
      if (out.total === 0) toast.info("Sem prontuários anteriores");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(null); }
  }

  async function handleSalvar() {
    if (!clinicaAtual || !pacienteId) { toast.error("Selecione o paciente"); return; }
    setLoading("salvar");
    try {
      const { error } = await supabase.from("prontuarios").insert({
        clinica_id: clinicaAtual.clinica_id,
        paciente_id: pacienteId,
        medico_id: medicoId || null,
        data: new Date().toISOString(),
        queixa_principal: soap.queixa_principal || null,
        historia_doenca: soap.historia_doenca || null,
        exame_fisico: soap.exame_fisico || null,
        hipotese_diagnostica: soap.hipotese_diagnostica || null,
        conduta: soap.conduta || null,
        prescricao: soap.prescricao || null,
        observacoes: transcricao ? `Transcrição:\n${transcricao}` : null,
      });
      if (error) throw error;
      toast.success("Prontuário salvo");
      setSoap(EMPTY); setTranscricao(""); setSugestoes(null); setResumo("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar"); }
    finally { setLoading(null); }
  }

  function addToHipotese(t: string) {
    setSoap((s) => ({ ...s, hipotese_diagnostica: s.hipotese_diagnostica ? `${s.hipotese_diagnostica} ${t}` : t }));
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Atendimento médico</h1>
          <p className="text-sm text-muted-foreground">Transcreva a consulta, estruture o prontuário e receba sugestões clínicas.</p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Paciente *</Label>
            <Select value={pacienteId} onValueChange={setPacienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Profissional</Label>
            <Select value={medicoId} onValueChange={setMedicoId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{medicos.map((m) => <SelectItem key={m.id} value={m.id} className="uppercase">{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Modelo / Especialidade</Label>
            <Select value={modeloId} onValueChange={setModeloId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleResumir} disabled={loading === "resumir" || !pacienteId}>
            {loading === "resumir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            Resumir histórico
          </Button>
        </div>
        {resumo && (
          <Collapsible open={resumoOpen} onOpenChange={setResumoOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                Resumo IA do histórico {resumoOpen ? "▲" : "▼"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{resumo}</div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Transcrição */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Transcrição da consulta</h2>
            </div>
            <VoiceInput
              size="sm"
              currentValue={transcricao}
              onTranscript={setTranscricao}
              append
              prompt="Transcreva fielmente a conversa entre médico e paciente em português do Brasil. Retorne apenas o texto, sem rótulos."
              title="Gravar conversa"
            />
          </div>
          <Textarea
            rows={14}
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            placeholder="Clique no microfone para gravar a consulta, ou cole/digite aqui o relato…"
          />
          <Button onClick={handleEstruturar} disabled={loading === "estruturar"} className="w-full">
            {loading === "estruturar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Estruturar prontuário com IA
          </Button>
        </Card>

        {/* SOAP */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileHeart className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Prontuário ({especialidade})</h2>
          </div>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {SOAP_KEYS.map(([k, label, rows]) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-1">
                    {k === "hipotese_diagnostica" && (
                      <Cid10Picker onPick={(t) => addToHipotese(t)} />
                    )}
                    <VoiceInput
                      size="sm"
                      currentValue={soap[k]}
                      onTranscript={(t) => setSoap((s) => ({ ...s, [k]: t }))}
                      prompt={`Transcreva o áudio em português como anotação médica do campo "${label}". Retorne apenas o texto.`}
                      title={`Ditar ${label}`}
                    />
                  </div>
                </div>
                <Textarea
                  rows={rows}
                  value={soap[k]}
                  onChange={(e) => setSoap((s) => ({ ...s, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Sugestões IA */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold">Sugestões clínicas</h2>
          </div>
          <Button variant="outline" size="sm" onClick={handleSugerir} disabled={loading === "sugerir"}>
            {loading === "sugerir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Sugerir CID, exames e prescrição
          </Button>
        </div>
        {!sugestoes ? (
          <p className="text-sm text-muted-foreground">Preencha o prontuário e clique em "Sugerir" para a IA propor CIDs, exames e prescrição.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">CIDs sugeridos (clique para adicionar)</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {sugestoes.cids.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                {sugestoes.cids.map((c, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => addToHipotese(`[CID ${c.codigo} — ${c.descricao}]`)}>
                    {c.codigo} · {c.descricao}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Exames sugeridos</Label>
              <ul className="list-disc pl-5 text-sm space-y-0.5 mt-1">
                {sugestoes.exames.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              {sugestoes.exames.length > 0 && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setSoap((s) => ({ ...s, conduta: `${s.conduta}${s.conduta ? "\n" : ""}Solicito: ${sugestoes.exames.join(", ")}.` }))}>
                  Adicionar à conduta
                </Button>
              )}
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Prescrição sugerida</Label>
              <pre className="text-sm whitespace-pre-wrap rounded-md bg-muted/30 p-3 mt-1 border">{sugestoes.prescricao || "—"}</pre>
              {sugestoes.prescricao && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setSoap((s) => ({ ...s, prescricao: sugestoes.prescricao }))}>
                  Usar como prescrição
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSalvar} disabled={loading === "salvar" || !pacienteId}>
          {loading === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar prontuário
        </Button>
      </div>
    </div>
  );
}
