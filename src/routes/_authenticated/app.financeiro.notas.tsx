import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, FileText, Pencil, Trash2, ExternalLink, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { montarDiscriminacaoNfse } from "@/lib/nfse-descricao";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useServerFn } from "@tanstack/react-start";
import { emitirNfse, consultarNfse } from "@/lib/nfse.functions";
import { usePickTomador, aplicarValorParcial } from "@/components/nfse/use-pick-tomador";
import { usePromptDescricaoNfse } from "@/components/nfse/use-prompt-descricao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/financeiro/notas")({
  component: Page,
  head: () => ({ meta: [{ title: "Notas Pacientes — Financeiro" }] }),
});

interface Nota {
  id: string; numero: string | null; serie: string | null; data_emissao: string;
  valor: number; status: string; url_pdf: string | null; observacoes: string | null;
  paciente_id: string | null;
}
interface Pac { id: string; nome: string }
interface PacFull {
  id: string; nome: string; cpf: string | null; email: string | null;
  cep: string | null; logradouro: string | null; numero: string | null;
  bairro: string | null; cidade: string | null; estado: string | null;
}
interface Emitente { id: string; nome: string; codigo_municipio: string | null }
const EMPTY = {
  numero: "", serie: "", data_emissao: new Date().toISOString().slice(0, 10), valor: "",
  status: "emitida", url_pdf: "", paciente_id: "", observacoes: "",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("financeiro");
  const [items, setItems] = useState<Nota[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Nota | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [emitDialog, setEmitDialog] = useState<{ open: boolean; nota: Nota | null }>({ open: false, nota: null });
  const [emitenteId, setEmitenteId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [emitting, setEmitting] = useState(false);
  const emitirFn = useServerFn(emitirNfse);
  const consultarFn = useServerFn(consultarNfse);
  const { pick: pickTomadorNfse, dialog: tomadorNfseDialog } = usePickTomador();
  const { prompt: pedirDescricaoNfse, dialog: descricaoNfseDialog } = usePromptDescricaoNfse();

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("fin_notas_pacientes")
      .select("id, numero, serie, data_emissao, valor, status, url_pdf, observacoes, paciente_id")
      .eq("clinica_id", clinicaAtual.clinica_id).order("data_emissao", { ascending: false }).limit(200);
    if (error) mostrarErro(error); else setItems((data ?? []) as Nota[]);
    setLoading(false);
  };
  const loadPac = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase.from("pacientes").select("id, nome")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500);
    setPacientes((data ?? []) as Pac[]);
  };
  const loadEmit = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase.from("nfse_emitentes_publico")
      .select("id, nome, codigo_municipio")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome");
    const list = (data ?? []) as Emitente[];
    setEmitentes(list);
    if (list.length && !emitenteId) setEmitenteId(list[0].id);
  };
  useEffect(() => { void load(); void loadPac(); void loadEmit(); }, [clinicaAtual?.clinica_id]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (n: Nota) => { setEditing(n); setForm({
    numero: n.numero ?? "", serie: n.serie ?? "", data_emissao: n.data_emissao, valor: String(n.valor),
    status: n.status, url_pdf: n.url_pdf ?? "", paciente_id: n.paciente_id ?? "", observacoes: n.observacoes ?? "",
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, numero: form.numero || null, serie: form.serie || null,
      data_emissao: form.data_emissao, valor: Number(form.valor), status: form.status,
      url_pdf: form.url_pdf || null, paciente_id: form.paciente_id || null, observacoes: form.observacoes || null,
    };
    const { error } = editing
      ? await supabase.from("fin_notas_pacientes").update(payload).eq("id", editing.id)
      : await supabase.from("fin_notas_pacientes").insert(payload);
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (n: Nota) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!confirm(`Excluir nota ${n.numero ?? ""}?`)) return;
    const { error } = await supabase.from("fin_notas_pacientes").delete().eq("id", n.id);
    if (error) mostrarErro(error); else { toast.success("Removida"); await load(); }
  };

  const openEmit = async (n: Nota) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!emitentes.length) { toast.error("Cadastre um emitente em Configurações › NFS-e"); return; }
    setDescricao(n.observacoes || `Serviços médicos prestados${n.paciente_id ? ` ao paciente ${pacMap.get(n.paciente_id) ?? ""}` : ""}`.trim());
    setTomadorCpf("");
    if (n.paciente_id) {
      const { data: pac } = await supabase.from("pacientes").select("cpf").eq("id", n.paciente_id).maybeSingle();
      setTomadorCpf((pac?.cpf ?? "").toString());
    }
    setEmitDialog({ open: true, nota: n });
  };

  const [tomadorCpf, setTomadorCpf] = useState("");

  const doEmit = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const n = emitDialog.nota;
    if (!n || !emitenteId) return;
    if (!n.paciente_id) { toast.error("Vincule um paciente à nota antes de emitir."); return; }
    setEmitting(true);
    try {
      const { data: pac, error: pacErr } = await supabase.from("pacientes")
        .select("id, nome, cpf, email, cep, logradouro, numero, bairro, cidade, estado")
        .eq("id", n.paciente_id).maybeSingle();
      if (pacErr || !pac) throw new Error("Paciente não encontrado");
      const p = pac as PacFull;
      const cpfPaciente = (tomadorCpf || p.cpf || "").replace(/\D/g, "");
      const tomador = await pickTomadorNfse({
        paciente: {
          nome: p.nome,
          cpfCnpj: cpfPaciente || undefined,
          email: p.email ?? undefined,
          cep: p.cep ?? undefined,
          logradouro: p.logradouro ?? undefined,
          numero: p.numero ?? undefined,
          bairro: p.bairro ?? undefined,
          municipio: p.cidade ?? undefined,
          uf: p.estado ?? undefined,
        },
        valorBase: Number(n.valor) || 0,
      });
      if (!tomador) { setEmitting(false); toast.error("Emissão cancelada."); return; }
      const cpfLimpo = (tomador.cpfCnpj ?? "").replace(/\D/g, "");
      if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
        throw new Error("CPF/CNPJ do tomador é obrigatório (11 ou 14 dígitos).");
      }
      const parcial = aplicarValorParcial(Number(n.valor) || 0, tomador);
      const descBase = (descricao && descricao.trim())
        ? descricao.trim()
        : montarDiscriminacaoNfse({
            procedimento: null,
            pacienteNome: p.nome,
            dataReferencia: n.data_emissao,
          });
      const descComDep = tomador.dependenteAtendido
        ? `${descBase} — Atendido: ${tomador.dependenteAtendido}`
        : descBase;
      const descSugerida = `${descComDep}${parcial.descricaoSufixo}`;
      const descFinal = await pedirDescricaoNfse(descSugerida);
      if (!descFinal) { setEmitting(false); toast.error("Emissão cancelada."); return; }
      const res = await emitirFn({ data: {
        emitenteId,
        pacienteId: p.id,
        pagamentoId: n.id ?? undefined,
        valorServicos: parcial.valor,
        descricaoServicos: descFinal,
        tomador: { ...tomador, cpfCnpj: cpfLimpo },
      } });
      const nfseId = (res as { id?: string })?.id;
      toast.success("NFS-e enviada. Consultando status...");
      // Aguarda processamento e consulta
      if (nfseId) {
        await new Promise((r) => setTimeout(r, 4000));
        const cons = await consultarFn({ data: { id: nfseId } }) as { focus?: { url_danfse?: string; status?: string } };
        const url = cons?.focus?.url_danfse;
        if (url) {
          await supabase.from("fin_notas_pacientes").update({
            url_pdf: url, status: "emitida",
          }).eq("id", n.id);
        }
      }
      setEmitDialog({ open: false, nota: null });
      await load();
    } catch (e) {
      mostrarErro(e);
    } finally { setEmitting(false); }
  };

  const pacMap = new Map(pacientes.map((p) => [p.id, p.nome]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Notas dos pacientes</h1>
          <p className="text-sm text-muted-foreground">Registro e controle de NFs emitidas</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          {podeEscrever && (
            <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Nova nota</Button></DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} nota</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Número</Label>
                  <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                <div className="space-y-2"><Label>Série</Label>
                  <Input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} /></div>
                <div className="space-y-2"><Label>Data</Label>
                  <DateInputBR required value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor *</Label>
                  <CurrencyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emitida">Emitida</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
              <div className="space-y-2"><Label>Paciente</Label>
                <Select value={form.paciente_id || "none"} onValueChange={(v) => setForm({ ...form, paciente_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>URL do PDF</Label>
                <Input type="url" value={form.url_pdf} onChange={(e) => setForm({ ...form, url_pdf: e.target.value })} placeholder="https://..." /></div>
              <div className="space-y-2"><Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />Nenhuma nota emitida.</div>
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Número/Série</TableHead>
              <TableHead>Paciente</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead className="w-32"></TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="text-sm">{
                  /^\d{4}-\d{2}-\d{2}$/.test(n.data_emissao)
                    ? new Date(`${n.data_emissao}T12:00:00`).toLocaleDateString("pt-BR")
                    : new Date(n.data_emissao).toLocaleDateString("pt-BR")
                }</TableCell>
                <TableCell className="text-sm">{n.numero ?? "—"} {n.serie && `/ ${n.serie}`}</TableCell>
                <TableCell className="text-sm">{n.paciente_id ? pacMap.get(n.paciente_id) ?? "—" : "—"}</TableCell>
                <TableCell><Badge variant={n.status === "emitida" ? "default" : "secondary"}>{n.status}</Badge></TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(n.valor))}</TableCell>
                <TableCell className="text-right">
                  {podeEscrever && (
                    <Button variant="ghost" size="icon" title="Emitir NFS-e" onClick={() => openEmit(n)} disabled={!n.paciente_id}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {n.url_pdf && <a href={n.url_pdf} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon"><ExternalLink className="h-3.5 w-3.5" /></Button></a>}
                  {podeEscrever && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(n)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(n)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>}
      </CardContent></Card>

      <Dialog open={emitDialog.open} onOpenChange={(o) => setEmitDialog({ open: o, nota: o ? emitDialog.nota : null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Emitir NFS-e</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Emitente *</Label>
              <Select value={emitenteId} onValueChange={setEmitenteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{emitentes.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="text-sm text-muted-foreground">
              Tomador: <b>{emitDialog.nota?.paciente_id ? pacMap.get(emitDialog.nota.paciente_id) : "—"}</b><br />
              Valor: <b>{emitDialog.nota ? fmt(Number(emitDialog.nota.valor)) : ""}</b>
            </div>
            <div className="space-y-2"><Label>CPF/CNPJ do tomador *</Label>
              <Input
                value={tomadorCpf}
                onChange={(e) => setTomadorCpf(e.target.value)}
                placeholder="Somente números (11 ou 14 dígitos)"
                required
              />
              <p className="text-xs text-muted-foreground">Obrigatório para emissão da NFS-e.</p>
            </div>
            <div className="space-y-2"><Label>Descrição dos serviços *</Label>
              <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmitDialog({ open: false, nota: null })} disabled={emitting}>Cancelar</Button>
            <Button
              onClick={doEmit}
              disabled={
                emitting ||
                !emitenteId ||
                !((tomadorCpf || "").replace(/\D/g, "").length === 11 || (tomadorCpf || "").replace(/\D/g, "").length === 14)
              }
            >
              {emitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitindo...</> : <><Send className="h-4 w-4 mr-2" />Emitir</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {tomadorNfseDialog}
      {descricaoNfseDialog}
    </div>
  );
}
