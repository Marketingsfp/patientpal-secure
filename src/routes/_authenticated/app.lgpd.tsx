import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SEGURANCA_TABS, SEGURANCA_META } from "@/components/section-tabs";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { formatDateTime } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/lgpd")({
  component: LgpdPageWithTabs,
  head: () => ({ meta: [{ title: "LGPD — ClinicaOS" }] }),
});

interface Solicitacao {
  id: string; tipo: string; descricao: string | null; status: string;
  resposta: string | null; respondido_em: string | null; created_at: string;
}

const TIPOS: Record<string, string> = {
  acesso: "Acesso aos dados",
  retificacao: "Retificação",
  exclusao: "Exclusão",
  portabilidade: "Portabilidade",
  anonimizacao: "Anonimização",
  revogacao: "Revogação de consentimento",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  pendente: "secondary",
  em_andamento: "default",
  atendida: "default",
  rejeitada: "destructive",
};

function LgpdPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("lgpd");
  const [rows, setRows] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "acesso", descricao: "" });
  const [saving, setSaving] = useState(false);
  const [respondendo, setRespondendo] = useState<Solicitacao | null>(null);
  const [respostaForm, setRespostaForm] = useState({ status: "atendida", resposta: "" });

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lgpd_solicitacoes")
      .select("id,tipo,descricao,status,resposta,respondido_em,created_at")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false });
    if (error) mostrarErro(error);
    else setRows((data ?? []) as Solicitacao[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  async function criarSolicitacao() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual) return;
    if (!form.descricao.trim()) { toast.error("Descreva sua solicitação"); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("lgpd_solicitacoes").insert({
      clinica_id: clinicaAtual.clinica_id,
      user_id: user?.id,
      tipo: form.tipo,
      descricao: form.descricao.trim(),
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Solicitação registrada");
    setOpen(false);
    setForm({ tipo: "acesso", descricao: "" });
    void load();
  }

  async function responder() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!respondendo) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("lgpd_solicitacoes").update({
      status: respostaForm.status,
      resposta: respostaForm.resposta.trim() || null,
      respondido_em: new Date().toISOString(),
      respondido_por: user?.id,
    }).eq("id", respondendo.id);
    if (error) { mostrarErro(error); return; }
    toast.success("Solicitação atualizada");
    setRespondendo(null);
    void load();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">LGPD — Lei Geral de Proteção de Dados</h1>
          <p className="text-sm text-muted-foreground">Gerencie consentimentos e solicitações dos titulares de dados.</p>
        </div>
        {podeEscrever && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova solicitação</Button>}
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-2">Direitos do titular (LGPD)</h2>
        <p className="text-sm text-muted-foreground">
          De acordo com a Lei nº 13.709/2018, o titular dos dados pode solicitar a qualquer momento: confirmação da existência de tratamento, acesso aos dados, correção de dados incompletos ou desatualizados, anonimização, bloqueio ou eliminação de dados desnecessários, portabilidade, eliminação dos dados tratados com o consentimento, informação sobre compartilhamento e revogação do consentimento.
        </p>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Data</TableHead>
              <TableHead className="w-44">Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-32">Situação</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma solicitação registrada.</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{formatDateTime(r.created_at)}</TableCell>
                <TableCell>{TIPOS[r.tipo] ?? r.tipo}</TableCell>
                <TableCell className="text-sm text-muted-foreground line-clamp-2 max-w-md">{r.descricao}</TableCell>
                <TableCell><Badge variant={STATUS_COLORS[r.status] ?? "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {podeEscrever && (
                    <Button size="sm" variant="ghost" onClick={() => { setRespondendo(r); setRespostaForm({ status: r.status, resposta: r.resposta ?? "" }); }}>
                      Responder
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova solicitação LGPD</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição *</Label>
              <Textarea rows={4} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva detalhadamente sua solicitação..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={criarSolicitacao} disabled={saving || !podeEscrever}>{saving ? "Enviando…" : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondendo} onOpenChange={v => !v && setRespondendo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Responder solicitação</DialogTitle></DialogHeader>
          {respondendo && (
            <div className="space-y-3">
              <div className="text-sm bg-muted p-3 rounded">
                <div><strong>Tipo:</strong> {TIPOS[respondendo.tipo] ?? respondendo.tipo}</div>
                <div className="mt-1"><strong>Solicitação:</strong> {respondendo.descricao}</div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={respostaForm.status} onValueChange={v => setRespostaForm({ ...respostaForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="atendida">Atendida</SelectItem>
                    <SelectItem value="rejeitada">Rejeitada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Resposta</Label>
                <Textarea rows={4} value={respostaForm.resposta} onChange={e => setRespostaForm({ ...respostaForm, resposta: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondendo(null)}>Cancelar</Button>
            <Button onClick={responder} disabled={!podeEscrever}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function LgpdPageWithTabs() {
  return (
    <>
      <SectionTabs title={SEGURANCA_META.title} icon={SEGURANCA_META.icon} tabs={SEGURANCA_TABS} />
      <LgpdPage />
    </>
  );
}
