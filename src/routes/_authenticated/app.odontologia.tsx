import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Smile, Save } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { OdontogramaClinico, type FacesEstado } from "@/components/odontologia/odontograma-clinico";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { type OdontoStatus, type OdontoFace, STATUS_LABEL, FACE_LABEL } from "@/lib/odonto";
import { formatDatePura } from "@/lib/date-utils";
import { OrcamentoTab } from "@/components/odontologia/orcamento-tab";
import { AnamneseOdontoTab } from "@/components/odontologia/anamnese-odonto-tab";
import { EvolucaoOdontoTab } from "@/components/odontologia/evolucao-odonto-tab";

export const Route = createFileRoute("/_authenticated/app/odontologia")({
  component: OdontologiaPage,
  head: () => ({ meta: [{ title: "Odontologia — ClinicaOS" }] }),
});

interface DenteRow {
  id: string; dente: number; face: OdontoFace; status: OdontoStatus; procedimento: string | null;
  observacoes: string | null; data: string;
}
interface ProntuarioOdonto {
  id: string; queixa_principal: string | null; historia_dental: string | null;
  plano_tratamento: string | null; observacoes: string | null;
}

function OdontologiaPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("odontologia");
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  const [pacienteIdOrc, setPacienteIdOrc] = useState<string | null>(null);
  const [pacienteSelOrc, setPacienteSelOrc] = useState<PatientOption | null>(null);
  const [dentes, setDentes] = useState<DenteRow[]>([]);
  const [prontuario, setProntuario] = useState<ProntuarioOdonto | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [faceSelecionada, setFaceSelecionada] = useState<OdontoFace>("INTEIRO");
  const [statusNovo, setStatusNovo] = useState<OdontoStatus>("cariado");
  const [procNovo, setProcNovo] = useState("");
  const [obsNovo, setObsNovo] = useState("");
  const [orcadoSet, setOrcadoSet] = useState<Set<number>>(new Set());
  const [itensPorDente, setItensPorDente] = useState<Array<{
    id: string; descricao: string; valor_total: number; orcamento_id: string;
    orcamento_numero: number | null; dentes: number[];
  }>>([]);
  const [especialidadeOdontoId, setEspecialidadeOdontoId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("especialidades")
        .select("id")
        .ilike("nome", "odontologia")
        .maybeSingle();
      setEspecialidadeOdontoId(data?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!pacienteId || !clinicaAtual) { setDentes([]); setProntuario(null); return; }
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId, clinicaAtual?.clinica_id]);

  async function carregar() {
    if (!pacienteId || !clinicaAtual) return;
    const [{ data: d }, { data: p }, { data: orcs }] = await Promise.all([
      supabase.from("odonto_dentes").select("id,dente,face,status,procedimento,observacoes,data")
        .eq("paciente_id", pacienteId).eq("clinica_id", clinicaAtual.clinica_id)
        .order("data", { ascending: false }),
      supabase.from("odonto_prontuarios").select("id,queixa_principal,historia_dental,plano_tratamento,observacoes")
        .eq("paciente_id", pacienteId).eq("clinica_id", clinicaAtual.clinica_id).maybeSingle(),
      supabase.from("orcamentos")
        .select("id, numero, status")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("paciente_id", pacienteId)
        .eq("status", "aberto"),
    ]);
    setDentes(((d as unknown) as DenteRow[]) ?? []);
    setProntuario((p as ProntuarioOdonto) ?? null);
    const orcIds = ((orcs ?? []) as { id: string; numero: number }[]).map((o) => o.id);
    if (orcIds.length === 0) { setOrcadoSet(new Set()); setItensPorDente([]); return; }
    const numeroById = new Map<string, number>(
      ((orcs ?? []) as { id: string; numero: number }[]).map((o) => [o.id, o.numero]),
    );
    const { data: itensAbertos } = await supabase
      .from("orcamento_itens")
      .select("id, descricao, valor_total, orcamento_id, dentes")
      .in("orcamento_id", orcIds)
      .not("dentes", "is", null);
    const rows = ((itensAbertos ?? []) as Array<{
      id: string; descricao: string; valor_total: number; orcamento_id: string; dentes: number[] | null;
    }>).map((r) => ({
      id: r.id,
      descricao: r.descricao,
      valor_total: Number(r.valor_total),
      orcamento_id: r.orcamento_id,
      orcamento_numero: numeroById.get(r.orcamento_id) ?? null,
      dentes: r.dentes ?? [],
    }));
    setItensPorDente(rows);
    const s = new Set<number>();
    for (const r of rows) for (const d of r.dentes) s.add(d);
    setOrcadoSet(s);
  }

  // Estado mais recente por (dente, face). `dentes` já vem ordenado desc por data,
  // então preservamos apenas o primeiro por chave.
  const estados: FacesEstado = useMemo(() => {
    const m: FacesEstado = {};
    for (const r of [...dentes].reverse()) {
      const face = (r.face ?? "INTEIRO") as OdontoFace;
      m[`${r.dente}-${face}`] = r.status;
    }
    return m;
  }, [dentes]);

  const itensDoDenteSelecionado = useMemo(
    () => (selecionado ? itensPorDente.filter((it) => it.dentes.includes(selecionado)) : []),
    [selecionado, itensPorDente],
  );

  const historicoDenteSelecionado = useMemo(
    () => (selecionado ? dentes.filter((r) => r.dente === selecionado) : []),
    [selecionado, dentes],
  );

  async function salvarDente() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!selecionado || !pacienteId || !clinicaAtual) return;
    const { error } = await supabase.from("odonto_dentes").insert({
      clinica_id: clinicaAtual.clinica_id,
      paciente_id: pacienteId,
      dente: selecionado,
      face: faceSelecionada,
      status: statusNovo,
      procedimento: procNovo || null,
      observacoes: obsNovo || null,
    });
    if (error) { mostrarErro(error); return; }
    toast.success(`Dente ${selecionado} · ${FACE_LABEL[faceSelecionada]} atualizado`);
    setProcNovo(""); setObsNovo("");
    void carregar();
  }

  function selecionarFace(dente: number, face: OdontoFace) {
    setSelecionado(dente);
    setFaceSelecionada(face);
    // Sugere o status atual da face para facilitar edição
    const atual = estados[`${dente}-${face}`] ?? estados[`${dente}-INTEIRO`];
    if (atual) setStatusNovo(atual);
  }

  type CampoProntuario = "queixa_principal" | "historia_dental" | "plano_tratamento" | "observacoes";
  async function salvarProntuario(campo: CampoProntuario, valor: string) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!pacienteId || !clinicaAtual) return;
    const patch: Partial<Record<CampoProntuario, string>> = { [campo]: valor };
    if (prontuario) {
      const { error } = await supabase.from("odonto_prontuarios").update(patch).eq("id", prontuario.id);
      if (error) { mostrarErro(error); return; }
      setProntuario({ ...prontuario, [campo]: valor });
    } else {
      const { data, error } = await supabase.from("odonto_prontuarios").insert({
        clinica_id: clinicaAtual.clinica_id,
        paciente_id: pacienteId,
        ...patch,
      }).select("id,queixa_principal,historia_dental,plano_tratamento,observacoes").maybeSingle();
      if (error) { mostrarErro(error); return; }
      setProntuario(data as ProntuarioOdonto);
    }
    toast.success("Prontuário salvo");
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2"><Smile className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">Odontologia</h1>
          <p className="text-sm text-muted-foreground">Odontograma e prontuário odontológico do paciente.</p>
        </div>
      </div>

      <Tabs defaultValue="prontuario" className="space-y-4">
          <TabsList>
            <TabsTrigger value="prontuario">Prontuário</TabsTrigger>
            <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
          </TabsList>

          <TabsContent value="prontuario" className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Label>Paciente</Label>
              <PatientSearchInput
                value={pacienteSel}
                onSelect={(p) => { setPacienteSel(p); setPacienteId(p?.id ?? null); }}
              />
            </CardContent>
          </Card>

          {!pacienteId ? (
            <p className="text-sm text-muted-foreground">Selecione um paciente para começar.</p>
          ) : (
          <>
          <Tabs defaultValue="odontograma" className="space-y-4">
            <TabsList>
              <TabsTrigger value="odontograma">Odontograma</TabsTrigger>
              <TabsTrigger value="anamnese">Anamnese</TabsTrigger>
              <TabsTrigger value="evolucao">Evolução</TabsTrigger>
              <TabsTrigger value="notas">Notas clínicas</TabsTrigger>
            </TabsList>

            <TabsContent value="odontograma" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Odontograma</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <OdontogramaClinico
                estados={estados}
                onClickFace={selecionarFace}
                orcadoSet={orcadoSet}
                denteSelecionado={selecionado}
              />
              {selecionado && itensDoDenteSelecionado.length > 0 && (
                <div className="border rounded-md p-3 bg-amber-50/60 border-amber-200 space-y-1">
                  <p className="text-sm font-medium text-amber-900">
                    Itens de orçamento aberto neste dente ({itensDoDenteSelecionado.length})
                  </p>
                  <ul className="text-xs text-amber-900/90 space-y-0.5">
                    {itensDoDenteSelecionado.map((it) => (
                      <li key={it.id}>
                        Orç. {it.orcamento_numero ?? "—"} · {it.descricao} · R$ {Number(it.valor_total).toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selecionado && podeEscrever && (
                <div className="border rounded-md p-4 space-y-3">
                  <p className="font-medium">
                    Dente {selecionado} · <span className="text-primary">{FACE_LABEL[faceSelecionada]}</span>
                  </p>
                  <div className="grid md:grid-cols-4 gap-3">
                    <div>
                      <Label>Face</Label>
                      <Select value={faceSelecionada} onValueChange={(v) => setFaceSelecionada(v as OdontoFace)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FACE_LABEL) as OdontoFace[]).map((f) => (
                            <SelectItem key={f} value={f}>{FACE_LABEL[f]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={statusNovo} onValueChange={(v) => setStatusNovo(v as OdontoStatus)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as OdontoStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Procedimento</Label>
                      <input className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={procNovo} onChange={(e) => setProcNovo(e.target.value)} placeholder="ex.: Restauração de resina" />
                    </div>
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Textarea value={obsNovo} onChange={(e) => setObsNovo(e.target.value)} rows={2} />
                  </div>
                  <Button onClick={salvarDente}><Save className="h-4 w-4 mr-1" />Registrar</Button>
                </div>
              )}
              {selecionado && historicoDenteSelecionado.length > 0 && (
                <div className="border rounded-md p-3 space-y-2">
                  <p className="text-sm font-medium">Histórico do dente {selecionado}</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-24">Data</TableHead>
                      <TableHead className="w-20">Face</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Procedimento</TableHead>
                      <TableHead>Observações</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{historicoDenteSelecionado.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{formatDatePura(r.data)}</TableCell>
                        <TableCell className="font-mono">{r.face ?? "INTEIRO"}</TableCell>
                        <TableCell>{STATUS_LABEL[r.status]}</TableCell>
                        <TableCell>{r.procedimento ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.observacoes ?? "—"}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="anamnese">
              <Card><CardContent className="pt-6">
                <AnamneseOdontoTab pacienteId={pacienteId} readOnly={!podeEscrever} />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="evolucao">
              <Card><CardContent className="pt-6">
                <EvolucaoOdontoTab pacienteId={pacienteId} readOnly={!podeEscrever} />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="notas" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Queixa principal</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  defaultValue={prontuario?.queixa_principal ?? ""}
                  onBlur={(e) => { if (e.target.value !== (prontuario?.queixa_principal ?? "")) void salvarProntuario("queixa_principal", e.target.value); }}
                  rows={3}
                  disabled={!podeEscrever}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>História dental</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  defaultValue={prontuario?.historia_dental ?? ""}
                  onBlur={(e) => { if (e.target.value !== (prontuario?.historia_dental ?? "")) void salvarProntuario("historia_dental", e.target.value); }}
                  rows={3}
                  disabled={!podeEscrever}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Plano de tratamento</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  defaultValue={prontuario?.plano_tratamento ?? ""}
                  onBlur={(e) => { if (e.target.value !== (prontuario?.plano_tratamento ?? "")) void salvarProntuario("plano_tratamento", e.target.value); }}
                  rows={4}
                  disabled={!podeEscrever}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Observações</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  defaultValue={prontuario?.observacoes ?? ""}
                  onBlur={(e) => { if (e.target.value !== (prontuario?.observacoes ?? "")) void salvarProntuario("observacoes", e.target.value); }}
                  rows={4}
                  disabled={!podeEscrever}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Histórico de intervenções</CardTitle></CardHeader>
            <CardContent>
              {dentes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Dente</TableHead><TableHead>Status</TableHead><TableHead>Procedimento</TableHead><TableHead>Observações</TableHead></TableRow></TableHeader>
                  <TableBody>{dentes.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{formatDatePura(d.data)}</TableCell>
                      <TableCell className="font-mono">{d.dente}{d.face && d.face !== "INTEIRO" ? `·${d.face}` : ""}</TableCell>
                      <TableCell>{STATUS_LABEL[d.status]}</TableCell>
                      <TableCell>{d.procedimento ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{d.observacoes ?? "—"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
          </>
          )}
          </TabsContent>

          <TabsContent value="orcamento">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Label>Paciente</Label>
                <PatientSearchInput
                  value={pacienteSelOrc}
                  onSelect={(p) => { setPacienteSelOrc(p); setPacienteIdOrc(p?.id ?? null); }}
                />
              </CardContent>
            </Card>
            {!pacienteIdOrc ? (
              <p className="text-sm text-muted-foreground mt-4">Selecione um paciente para começar.</p>
            ) : (
            <Card>
              <CardContent className="pt-6 mt-4">
                <OrcamentoTab
                  pacienteId={pacienteIdOrc}
                  pacienteNome={pacienteSelOrc?.nome ?? ""}
                  pacienteTelefone={pacienteSelOrc?.telefone ?? null}
                  especialidadeOdontoId={especialidadeOdontoId}
                />
              </CardContent>
            </Card>
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}