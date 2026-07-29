import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, Plus, RefreshCw, Send, Trash2, AlertTriangle, Copy, FileDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  obterRelatorioDiario, salvarEntradaRelatorio, excluirEntradaRelatorio, enviarRelatorioAgora,
  type EntradaInput,
} from "@/lib/relatorio-diario.functions";

export const Route = createFileRoute("/_authenticated/app/relatorio-diario")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Relatório Diário de Alterações — ClinicaOS" },
      { name: "description", content: "Resumo diário das alterações do sistema, das 07:00 às 19:00, com detecção de loops de erro e envio automático por WhatsApp às 20:00." },
      { property: "og:title", content: "Relatório Diário de Alterações — ClinicaOS" },
      { property: "og:description", content: "Resumo diário das alterações do sistema com envio automático por WhatsApp às 20:00." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TIPOS = [
  { v: "correcao", l: "Correção" },
  { v: "melhoria", l: "Melhoria" },
  { v: "novo", l: "Novidade" },
  { v: "banco", l: "Banco de dados" },
  { v: "ajuste", l: "Ajuste" },
  { v: "investigacao", l: "Investigação" },
  { v: "documento", l: "Documento" },
];
const rotulo = (t: string) => TIPOS.find((x) => x.v === t)?.l ?? t;

interface Relatorio {
  data: string;
  janela: string;
  total: number;
  porArea: Array<{ area: string; total: number }>;
  porTipo: Array<{ tipo: string; total: number }>;
  entradas: Array<{
    id: string; data: string; hora: string; titulo: string; descricao: string | null;
    area: string | null; tipo: string; chave_loop: string | null; loop_manual: boolean;
    loop_motivo: string | null; origem: string;
  }>;
  loops: Array<{ chave: string; titulo: string; manual: boolean; motivo: string | null; datas: string[] }>;
  resumo: string;
  texto: string;
}

interface Envio { id: string; data: string; status: string; destinatarios: number; erro: string | null; enviado_em: string }
interface Destinatario { id: string; nome: string; telefone: string; ativo: boolean }

function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const VAZIO: EntradaInput = {
  data: hojeSP(), hora: "09:00", titulo: "", descricao: "", area: "", tipo: "ajuste",
  chave_loop: "", loop_manual: false, loop_motivo: "",
};

function Page() {
  const [dia, setDia] = useState(hojeSP());
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [dests, setDests] = useState<Destinatario[]>([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState<EntradaInput | null>(null);
  const [novoDest, setNovoDest] = useState({ nome: "", telefone: "" });

  const obter = useServerFn(obterRelatorioDiario);
  const salvar = useServerFn(salvarEntradaRelatorio);
  const excluir = useServerFn(excluirEntradaRelatorio);
  const enviar = useServerFn(enviarRelatorioAgora);
  const baixarPdf = useServerFn(baixarRelatorioPdf);
  const [baixando, setBaixando] = useState(false);

  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await baixarPdf({ data: { data: dia } });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.arquivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { mostrarErro(e); }
    finally { setBaixando(false); }
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e, d] = await Promise.all([
        obter({ data: { data: dia } }),
        supabase.from("dev_relatorio_envios").select("*").order("enviado_em", { ascending: false }).limit(15),
        supabase.from("dev_relatorio_destinatarios").select("*").order("nome"),
      ]);
      setRel(r as unknown as Relatorio);
      setEnvios((e.data ?? []) as unknown as Envio[]);
      setDests((d.data ?? []) as unknown as Destinatario[]);
    } catch (err) { mostrarErro(err); }
    finally { setLoading(false); }
  }, [dia, obter]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvarEntrada = async () => {
    if (!form) return;
    try {
      await salvar({ data: form });
      toast.success("Registro salvo");
      setForm(null);
      await carregar();
    } catch (e) { mostrarErro(e); }
  };

  const remover = async (id: string) => {
    if (!confirm("Excluir este registro do relatório?")) return;
    try { await excluir({ data: { id } }); await carregar(); toast.success("Registro excluído"); }
    catch (e) { mostrarErro(e); }
  };

  const enviarAgora = async () => {
    setEnviando(true);
    try {
      const r = await enviar({ data: { data: dia } });
      if (r.enviados) toast.success(`Relatório enviado para ${r.enviados} destinatário(s)`);
      if (r.erros.length) toast.error(r.erros.join(" | "));
      await carregar();
    } catch (e) { mostrarErro(e); }
    finally { setEnviando(false); }
  };

  const addDest = async () => {
    if (!novoDest.nome.trim() || !novoDest.telefone.trim()) { toast.error("Informe nome e telefone"); return; }
    const { error } = await supabase.from("dev_relatorio_destinatarios").insert(novoDest as never);
    if (error) { toast.error(error.message); return; }
    setNovoDest({ nome: "", telefone: "" });
    await carregar();
  };

  const toggleDest = async (d: Destinatario) => {
    await supabase.from("dev_relatorio_destinatarios").update({ ativo: !d.ativo } as never).eq("id", d.id);
    await carregar();
  };

  const removerDest = async (id: string) => {
    await supabase.from("dev_relatorio_destinatarios").delete().eq("id", id);
    await carregar();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold mr-auto">Relatório Diário de Alterações</h1>
        <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="w-[170px]" />
        <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        <Button size="sm" onClick={() => setForm({ ...VAZIO, data: dia })}>
          <Plus className="h-4 w-4 mr-1" /> Novo registro
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void enviarAgora()} disabled={enviando}>
          <Send className="h-4 w-4 mr-1" /> Enviar agora
        </Button>
        <Button size="sm" variant="outline" onClick={() => void baixar()} disabled={baixando}>
          <FileDown className="h-4 w-4 mr-1" /> Baixar PDF
        </Button>
      </div>

      <Card className="p-4 space-y-2">
        <div className="text-xs text-muted-foreground">
          Janela {rel?.janela ?? "07:00–19:00"} · envio automático às 20:00 pelo WhatsApp
        </div>
        <p className="text-sm">{rel?.resumo ?? "Carregando..."}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          {(rel?.porTipo ?? []).map((t) => (
            <Badge key={t.tipo} variant="outline">{rotulo(t.tipo)}: {t.total}</Badge>
          ))}
        </div>
      </Card>

      {!!rel?.loops.length && (
        <Card className="p-4 border-amber-500/50">
          <div className="flex items-center gap-2 mb-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium text-sm">Loops de erro — assuntos que voltaram</span>
          </div>
          <ul className="space-y-1 text-sm">
            {rel.loops.map((l) => (
              <li key={l.chave}>
                • {l.titulo}{" "}
                <Badge variant="secondary" className="ml-1">
                  {l.manual ? "marcado manualmente" : `${l.datas.length}x em 30 dias`}
                </Badge>
                {l.motivo && <div className="text-xs text-muted-foreground ml-3">{l.motivo}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left p-2 w-[70px]">Hora</th>
              <th className="text-left p-2 w-[110px]">Tipo</th>
              <th className="text-left p-2 w-[140px]">Área</th>
              <th className="text-left p-2">O que mudou</th>
              <th className="p-2 w-[90px]"></th>
            </tr>
          </thead>
          <tbody>
            {(rel?.entradas ?? []).map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="p-2">{e.hora.slice(0, 5)}</td>
                <td className="p-2">{rotulo(e.tipo)}</td>
                <td className="p-2">{e.area || "—"}</td>
                <td className="p-2">
                  <div className="font-medium">
                    {e.titulo}
                    {e.loop_manual && <Badge variant="destructive" className="ml-2">loop</Badge>}
                  </div>
                  {e.descricao && <div className="text-xs text-muted-foreground">{e.descricao}</div>}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setForm({
                    id: e.id, data: e.data, hora: e.hora.slice(0, 5), titulo: e.titulo,
                    descricao: e.descricao ?? "", area: e.area ?? "", tipo: e.tipo,
                    chave_loop: e.chave_loop ?? "", loop_manual: e.loop_manual,
                    loop_motivo: e.loop_motivo ?? "",
                  })}>Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => void remover(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {!rel?.entradas.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum registro neste dia.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="font-medium text-sm">Quem recebe no WhatsApp</div>
          <div className="flex gap-2">
            <Input placeholder="Nome" value={novoDest.nome}
              onChange={(e) => setNovoDest({ ...novoDest, nome: e.target.value })} />
            <Input placeholder="5521999999999" value={novoDest.telefone}
              onChange={(e) => setNovoDest({ ...novoDest, telefone: e.target.value })} />
            <Button size="sm" onClick={() => void addDest()}><Plus className="h-4 w-4" /></Button>
          </div>
          <ul className="space-y-1 text-sm">
            {dests.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <Checkbox checked={d.ativo} onCheckedChange={() => void toggleDest(d)} />
                <span className={d.ativo ? "" : "line-through text-muted-foreground"}>
                  {d.nome} — {d.telefone}
                </span>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void removerDest(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {!dests.length && <li className="text-muted-foreground">Nenhum destinatário cadastrado.</li>}
          </ul>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Prévia da mensagem</span>
            <Button variant="ghost" size="sm" className="ml-auto"
              onClick={() => { void navigator.clipboard.writeText(rel?.texto ?? ""); toast.success("Texto copiado"); }}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
          </div>
          <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-64 overflow-auto">
            {rel?.texto ?? ""}
          </pre>
          <div className="font-medium text-sm pt-2">Últimos envios</div>
          <ul className="text-xs space-y-1">
            {envios.map((e) => (
              <li key={e.id}>
                {new Date(e.enviado_em).toLocaleString("pt-BR")} · {e.data} · {e.status} · {e.destinatarios} destinatário(s)
                {e.erro && <span className="text-destructive"> — {e.erro}</span>}
              </li>
            ))}
            {!envios.length && <li className="text-muted-foreground">Nenhum envio registrado.</li>}
          </ul>
        </Card>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Editar registro" : "Novo registro"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Data</Label>
                  <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
                <div><Label className="text-xs">Hora</Label>
                  <Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} /></div>
                <div><Label className="text-xs">Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              <div><Label className="text-xs">Área (ex.: Agenda, Caixa, Contratos)</Label>
                <Input value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
              <div><Label className="text-xs">O que mudou (título curto)</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
              <div><Label className="text-xs">Explicação em linguagem simples</Label>
                <Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              <div><Label className="text-xs">Assunto para agrupar repetições (opcional)</Label>
                <Input placeholder="ex.: retroativo-caixa" value={form.chave_loop ?? ""}
                  onChange={(e) => setForm({ ...form, chave_loop: e.target.value })} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se o mesmo assunto aparecer 2 vezes ou mais em 30 dias, o sistema marca como possível loop de erro.
                </p></div>
              <div className="flex items-center gap-2">
                <Checkbox checked={!!form.loop_manual}
                  onCheckedChange={(v) => setForm({ ...form, loop_manual: !!v })} />
                <Label className="text-xs">Marcar como loop de erro</Label>
              </div>
              {form.loop_manual && (
                <div><Label className="text-xs">Motivo</Label>
                  <Input value={form.loop_motivo ?? ""} onChange={(e) => setForm({ ...form, loop_motivo: e.target.value })} /></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => void salvarEntrada()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}