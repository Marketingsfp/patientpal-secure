import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Receipt, ExternalLink, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/nfse")({
  component: NfsePage,
  head: () => ({ meta: [{ title: "Notas Fiscais — ClinicaOS" }] }),
});

interface Emitente { id: string; nome: string; cnpj: string }
interface Row {
  id: string;
  numero: string | null;
  data_emissao: string;
  valor_servicos: number;
  status: string;
  url_pdf: string | null;
  tomador_nome: string | null;
  emitente_id: string | null;
  emitente: { nome: string; cnpj: string } | null;
}

function NfsePage() {
  const { clinicaAtual } = useClinica();
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [filtroEmitente, setFiltroEmitente] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicaAtual) return;
    void (async () => {
      const { data } = await supabase
        .from("nfse_emitentes")
        .select("id, nome, cnpj")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("nome");
      setEmitentes((data ?? []) as Emitente[]);
    })();
  }, [clinicaAtual?.clinica_id]);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("nfse")
      .select("id, numero, data_emissao, valor_servicos, status, url_pdf, tomador_nome, emitente_id, emitente:nfse_emitentes(nome, cnpj)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("data_emissao", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as Row[]);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const filtrados = useMemo(() => rows.filter((r) => {
    if (filtroEmitente !== "todos" && r.emitente_id !== filtroEmitente) return false;
    if (filtroStatus !== "todos" && r.status !== filtroStatus) return false;
    return true;
  }), [rows, filtroEmitente, filtroStatus]);

  const totais = useMemo(() => {
    const porEmitente = new Map<string, { nome: string; qtd: number; valor: number }>();
    for (const r of filtrados) {
      const k = r.emitente?.nome ?? "Sem emitente";
      const cur = porEmitente.get(k) ?? { nome: k, qtd: 0, valor: 0 };
      cur.qtd += 1;
      cur.valor += Number(r.valor_servicos) || 0;
      porEmitente.set(k, cur);
    }
    return Array.from(porEmitente.values());
  }, [filtrados]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Receipt className="h-6 w-6 text-primary" /> Notas Fiscais (NFS-e)</h1>
          <p className="text-sm text-muted-foreground">Emissão e controle de notas fiscais de serviço.</p>
        </div>
        <Button asChild><Link to="/app/nfse/testar"><FilePlus2 className="h-4 w-4 mr-2" /> Emitir NFS-e</Link></Button>
      </div>

      <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Emitente</label>
          <Select value={filtroEmitente} onValueChange={setFiltroEmitente}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os emitentes</SelectItem>
              {emitentes.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome} — {e.cnpj}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="processando">Processando</SelectItem>
              <SelectItem value="emitida">Emitida</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {totais.length > 0 && (
          <div className="ml-auto flex gap-2 text-xs">
            {totais.map((t) => (
              <div key={t.nome} className="rounded-md bg-muted px-3 py-1.5">
                <div className="font-medium">{t.nome}</div>
                <div className="text-muted-foreground">{t.qtd} nota{t.qtd !== 1 ? "s" : ""} · {t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-44">Emitente</TableHead>
              <TableHead className="w-24">Número</TableHead>
              <TableHead className="w-28">Emissão</TableHead>
              <TableHead>Tomador</TableHead>
              <TableHead className="w-32 text-right">Valor</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-20 text-right">PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma nota.</TableCell></TableRow>
            ) : filtrados.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.emitente ? (
                    <div>
                      <div className="font-medium text-sm">{r.emitente.nome}</div>
                      <div className="text-xs text-muted-foreground">{r.emitente.cnpj}</div>
                    </div>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>{r.numero ?? "—"}</TableCell>
                <TableCell>{new Date(r.data_emissao).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{r.tomador_nome ?? "—"}</TableCell>
                <TableCell className="text-right">{Number(r.valor_servicos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    r.status === "emitida" ? "bg-green-500/10 text-green-700" :
                    r.status === "erro" ? "bg-red-500/10 text-red-700" :
                    r.status === "cancelada" ? "bg-gray-500/10 text-gray-700" :
                    "bg-amber-500/10 text-amber-700"
                  }`}>{r.status}</span>
                </TableCell>
                <TableCell className="text-right">
                  {r.url_pdf ? (
                    <a href={r.url_pdf} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /></a>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}