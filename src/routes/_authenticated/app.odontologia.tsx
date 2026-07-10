import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Smile, Save } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { Odontograma } from "@/components/odontograma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type OdontoStatus, STATUS_LABEL } from "@/lib/odonto";
import { formatDatePura } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/odontologia")({
  component: OdontologiaPage,
  head: () => ({ meta: [{ title: "Odontologia — ClinicaOS" }] }),
});

interface DenteRow {
  id: string; dente: number; status: OdontoStatus; procedimento: string | null;
  observacoes: string | null; data: string;
}
interface ProntuarioOdonto {
  id: string; queixa_principal: string | null; historia_dental: string | null;
  plano_tratamento: string | null; observacoes: string | null;
}

function OdontologiaPage() {
  const { clinicaAtual } = useClinica();
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  const [dentes, setDentes] = useState<DenteRow[]>([]);
  const [prontuario, setProntuario] = useState<ProntuarioOdonto | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [statusNovo, setStatusNovo] = useState<OdontoStatus>("cariado");
  const [procNovo, setProcNovo] = useState("");
  const [obsNovo, setObsNovo] = useState("");

  useEffect(() => {
    if (!pacienteId || !clinicaAtual) { setDentes([]); setProntuario(null); return; }
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId, clinicaAtual?.clinica_id]);

  async function carregar() {
    if (!pacienteId || !clinicaAtual) return;
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from("odonto_dentes").select("id,dente,status,procedimento,observacoes,data")
        .eq("paciente_id", pacienteId).eq("clinica_id", clinicaAtual.clinica_id)
        .order("data", { ascending: false }),
      supabase.from("odonto_prontuarios").select("id,queixa_principal,historia_dental,plano_tratamento,observacoes")
        .eq("paciente_id", pacienteId).eq("clinica_id", clinicaAtual.clinica_id).maybeSingle(),
    ]);
    setDentes((d as DenteRow[]) ?? []);
    setProntuario((p as ProntuarioOdonto) ?? null);
  }

  // Pega o estado mais recente de cada dente
  const estados: Record<number, OdontoStatus> = {};
  for (const r of [...dentes].reverse()) estados[r.dente] = r.status;

  async function salvarDente() {
    if (!selecionado || !pacienteId || !clinicaAtual) return;
    const { error } = await supabase.from("odonto_dentes").insert({
      clinica_id: clinicaAtual.clinica_id,
      paciente_id: pacienteId,
      dente: selecionado,
      face: "O",
      status: statusNovo,
      procedimento: procNovo || null,
      observacoes: obsNovo || null,
    });
    if (error) { mostrarErro(error); return; }
    toast.success(`Dente ${selecionado} atualizado`);
    setProcNovo(""); setObsNovo("");
    void carregar();
  }

  type CampoProntuario = "queixa_principal" | "historia_dental" | "plano_tratamento" | "observacoes";
  async function salvarProntuario(campo: CampoProntuario, valor: string) {
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

      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label>Paciente</Label>
          <PatientSearchInput
            value={pacienteSel}
            onSelect={(p) => { setPacienteSel(p); setPacienteId(p?.id ?? null); }}
          />
        </CardContent>
      </Card>

      {pacienteId && (
        <>
          <Card>
            <CardHeader><CardTitle>Odontograma</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Odontograma estados={estados} onClickDente={setSelecionado} selecionado={selecionado} />
              {selecionado && (
                <div className="border rounded-md p-4 space-y-3">
                  <p className="font-medium">Dente {selecionado}</p>
                  <div className="grid md:grid-cols-3 gap-3">
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
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Queixa principal</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  defaultValue={prontuario?.queixa_principal ?? ""}
                  onBlur={(e) => { if (e.target.value !== (prontuario?.queixa_principal ?? "")) void salvarProntuario("queixa_principal", e.target.value); }}
                  rows={3}
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
                      <TableCell className="font-mono">{d.dente}</TableCell>
                      <TableCell>{STATUS_LABEL[d.status]}</TableCell>
                      <TableCell>{d.procedimento ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{d.observacoes ?? "—"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}