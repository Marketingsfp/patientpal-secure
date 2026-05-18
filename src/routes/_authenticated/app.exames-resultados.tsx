import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles, Save, Stethoscope, AlertTriangle, CheckCircle2, Bell, Upload } from "lucide-react";
import { classificarResultadoExame, extrairTextoExameDeArquivo, type ClassificacaoExame } from "@/lib/exames-ia.functions";

export const Route = createFileRoute("/_authenticated/app/exames-resultados")({
  component: ExamesResultadosPage,
  head: () => ({ meta: [{ title: "Resultados de Exames — ClinicaOS" }] }),
});

type Paciente = { id: string; nome: string };
type Row = {
  id: string;
  paciente_nome: string | null;
  tipo_exame: string;
  resultado_texto: string;
  status: "pendente" | "normal" | "alterado" | "critico";
  ia_resumo: string | null;
  ia_recomendacao: string | null;
  ia_mensagem_paciente: string | null;
  created_at: string;
};

const STATUS_COR: Record<Row["status"], string> = {
  pendente: "bg-muted text-muted-foreground",
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  alterado: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  critico: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function ExamesResultadosPage() {
  const { clinicaAtual } = useClinica();
  const classificar = useServerFn(classificarResultadoExame);
  const extrair = useServerFn(extrairTextoExameDeArquivo);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [pacienteId, setPacienteId] = useState("");
  const [tipo, setTipo] = useState("");
  const [texto, setTexto] = useState("");
  const [contexto, setContexto] = useState("");
  const [classificando, setClassificando] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [analise, setAnalise] = useState<ClassificacaoExame | null>(null);

  const clinicaId = clinicaAtual?.clinica_id;

  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      const [p, r] = await Promise.all([
        supabase.from("pacientes").select("id,nome").eq("clinica_id", clinicaId).eq("ativo", true).order("nome").limit(500),
        supabase.from("exame_resultados").select("id,paciente_nome,tipo_exame,resultado_texto,status,ia_resumo,ia_recomendacao,ia_mensagem_paciente,created_at")
          .eq("clinica_id", clinicaId).order("created_at", { ascending: false }).limit(50),
      ]);
      if (p.data) setPacientes(p.data);
      if (r.data) setRows(r.data as Row[]);
    })();
  }, [clinicaId]);

  const pacienteNome = useMemo(
    () => pacientes.find((p) => p.id === pacienteId)?.nome ?? "",
    [pacienteId, pacientes],
  );

  const handleClassificar = async () => {
    if (!tipo.trim() || texto.trim().length < 3) {
      toast.error("Informe o tipo de exame e cole o resultado.");
      return;
    }
    setClassificando(true);
    setAnalise(null);
    try {
      const result = await classificar({
        data: { tipo_exame: tipo.trim(), resultado_texto: texto.trim(), paciente_nome: pacienteNome || undefined, contexto: contexto.trim() || undefined },
      });
      setAnalise(result);
      toast.success("Classificação concluída.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao classificar");
    } finally {
      setClassificando(false);
    }
  };

  const handleArquivo = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    const ok = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!ok) {
      toast.error("Envie uma imagem (JPG/PNG) ou PDF do laudo.");
      return;
    }
    setExtraindo(true);
    setAnalise(null);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      const { texto: extraido, tipo_sugerido } = await extrair({
        data: { arquivo_base64: dataUrl, mime: file.type, nome_arquivo: file.name },
      });
      if (!extraido) {
        toast.error("Não foi possível ler o laudo. Tente outra imagem ou cole o texto.");
        return;
      }
      setTexto(extraido);
      if (!tipo.trim() && tipo_sugerido) setTipo(tipo_sugerido);
      toast.success("Laudo lido. Classificando com IA…");
      // classifica automaticamente
      setClassificando(true);
      try {
        const result = await classificar({
          data: {
            tipo_exame: (tipo || tipo_sugerido || "Exame").trim(),
            resultado_texto: extraido,
            paciente_nome: pacienteNome || undefined,
            contexto: contexto.trim() || undefined,
          },
        });
        setAnalise(result);
        toast.success("Classificação concluída.");
      } finally {
        setClassificando(false);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar arquivo");
    } finally {
      setExtraindo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSalvar = async () => {
    if (!clinicaId) return toast.error("Selecione uma clínica");
    if (!pacienteId) return toast.error("Selecione o paciente");
    if (!tipo.trim() || texto.trim().length < 3) return toast.error("Preencha exame e resultado");
    setSalvando(true);
    try {
      const status = analise?.status ?? "pendente";
      const { data: ins, error } = await supabase
        .from("exame_resultados")
        .insert({
          clinica_id: clinicaId,
          paciente_id: pacienteId,
          paciente_nome: pacienteNome,
          tipo_exame: tipo.trim(),
          resultado_texto: texto.trim(),
          status,
          ia_classificacao: analise as unknown as never,
          ia_resumo: analise?.resumo ?? null,
          ia_recomendacao: analise?.recomendacao ?? null,
          ia_mensagem_paciente: analise?.mensagem_paciente ?? null,
          classificado_em: analise ? new Date().toISOString() : null,
        })
        .select("id,paciente_nome,tipo_exame,resultado_texto,status,ia_resumo,ia_recomendacao,ia_mensagem_paciente,created_at")
        .single();
      if (error) throw error;

      // Cria alerta para enfermagem se alterado/crítico
      if (analise && analise.precisa_contato && status !== "normal") {
        await supabase.from("alertas_enfermagem").insert({
          clinica_id: clinicaId,
          paciente_id: pacienteId,
          paciente_nome: pacienteNome,
          origem: "exame",
          origem_id: ins!.id,
          severidade: status,
          titulo: `${tipo.trim()} ${status === "critico" ? "CRÍTICO" : "alterado"}`,
          descricao: analise.resumo,
          mensagem_sugerida: analise.mensagem_paciente,
          status: "aberto",
        });
        toast.success("Resultado salvo e alerta enviado à enfermagem.");
      } else {
        toast.success("Resultado salvo.");
      }
      setRows((r) => [ins as Row, ...r].slice(0, 50));
      setTipo(""); setTexto(""); setContexto(""); setAnalise(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-6 w-6 text-amber-600" />
        <h1 className="text-2xl font-bold">Resultados de Exames</h1>
        <Badge variant="secondary" className="ml-2">IA classifica e dispara alerta para enfermagem</Badge>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Paciente</Label>
            <Select value={pacienteId} onValueChange={setPacienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de exame</Label>
            <Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex.: Hemograma completo, TSH, Glicemia de jejum…" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Resultado (cole o texto do laudo)</Label>
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui o resultado completo do exame…" />
          <div className="flex items-center gap-2 pt-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleArquivo(f);
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={extraindo} onClick={() => fileRef.current?.click()}>
              {extraindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Anexar laudo (imagem/PDF) — IA lê e classifica
            </Button>
            <span className="text-xs text-muted-foreground">Suporta JPG, PNG ou PDF até 10 MB.</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Contexto clínico (opcional)</Label>
          <Input value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: paciente diabético em uso de metformina" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleClassificar} disabled={classificando} variant="default">
            {classificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Classificar com IA
          </Button>
          <Button onClick={handleSalvar} disabled={salvando} variant="secondary">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar resultado{analise?.precisa_contato ? " + abrir alerta" : ""}
          </Button>
        </div>

        {analise && (
          <Card className="p-4 border-l-4 space-y-2"
            style={{ borderLeftColor: analise.status === "critico" ? "#dc2626" : analise.status === "alterado" ? "#d97706" : "#16a34a" }}>
            <div className="flex items-center gap-2">
              {analise.status === "normal" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              <span className="font-semibold uppercase tracking-wide">
                {analise.status} · severidade {analise.severidade}
              </span>
              {analise.precisa_contato && <Badge variant="destructive"><Bell className="h-3 w-3 mr-1" />contato necessário</Badge>}
            </div>
            {analise.achados_relevantes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analise.achados_relevantes.map((a, i) => <Badge key={i} variant="outline">{a}</Badge>)}
              </div>
            )}
            {analise.resumo && <p className="text-sm"><strong>Resumo:</strong> {analise.resumo}</p>}
            {analise.recomendacao && <p className="text-sm"><strong>Recomendação:</strong> {analise.recomendacao}</p>}
            {analise.mensagem_paciente && (
              <div className="text-sm bg-muted/50 p-3 rounded">
                <strong>Mensagem sugerida ao paciente:</strong>
                <p className="mt-1 whitespace-pre-wrap">{analise.mensagem_paciente}</p>
              </div>
            )}
          </Card>
        )}
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">Últimos 50 resultados</h2>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum resultado registrado ainda.</p>}
          {rows.map((r) => (
            <Card key={r.id} className="p-3 flex items-start gap-3">
              <Badge className={`uppercase ${STATUS_COR[r.status]}`}>{r.status}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.tipo_exame} — {r.paciente_nome ?? "—"}</div>
                {r.ia_resumo && <div className="text-xs text-muted-foreground line-clamp-2">{r.ia_resumo}</div>}
                <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
