import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SEGURANCA_TABS, SEGURANCA_META } from "@/components/section-tabs";
import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/export-csv";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/auditoria")({
  component: PageWithTabs,
  head: () => ({ meta: [{ title: "Auditoria — ClinicaOS" }] }),
});

interface AuditRow {
  id: string;
  user_email: string | null;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Excluiu" };
const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
};

// Rótulos amigáveis para nomes técnicos de tabelas e colunas
const TABLE_LABEL: Record<string, string> = {
  agendamentos: "Agendamento",
  pacientes: "Paciente",
  medicos: "Médico",
  fin_lancamentos: "Lançamento financeiro",
  fin_atendimentos: "Atendimento financeiro",
  contratos_assinatura: "Contrato",
  contrato_mensalidades: "Mensalidade do contrato",
  contrato_dependentes: "Dependente do contrato",
  orcamentos: "Orçamento",
  orcamento_itens: "Item de orçamento",
  pagamentos: "Pagamento",
  caixa_sessoes: "Sessão de caixa",
  caixa_movimentos: "Movimento de caixa",
  triagens_enfermagem: "Triagem de enfermagem",
  prontuarios: "Prontuário",
  senhas: "Senha",
};

const FIELD_LABEL: Record<string, string> = {
  inicio: "Início", fim: "Fim", status: "Status", observacoes: "Observações",
  procedimento: "Procedimento", fluxo_etapa: "Etapa", prioridade: "Prioridade",
  paciente_id: "Paciente", medico_id: "Médico", agenda_id: "Agenda",
  clinica_id: "Clínica", pacote_id: "Pacote", ficha_numero: "Ficha",
  executado_em: "Executado em", orcamento_id: "Orçamento",
  valor: "Valor", valor_total: "Valor total", valor_pago: "Valor pago",
  desconto: "Desconto", forma_pagamento: "Forma de pagamento",
  data_vencimento: "Vencimento", data_pagamento: "Pago em",
  competencia: "Competência", numero_parcela: "Parcela",
  ativo: "Ativo", nome: "Nome", cpf: "CPF", telefone: "Telefone",
  email: "E-mail", data_nascimento: "Nascimento",
  repasse_pago: "Repasse pago", repasse_valor: "Valor do repasse",
};

// Campos técnicos que não interessam ao operador
const CAMPOS_OCULTOS = new Set([
  "id", "created_at", "updated_at", "criado_por", "atualizado_por",
  "clinica_id", "search_tsv", "nome_norm",
]);

function labelTabela(t: string): string {
  return TABLE_LABEL[t] ?? t.replace(/_/g, " ");
}
function labelCampo(c: string): string {
  return FIELD_LABEL[c] ?? c.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
}
function formatValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "string") {
    // Data ISO
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-");
      return `${d}/${m}/${y}`;
    }
    // UUID → encurta
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return v.slice(0, 8) + "…";
    return v;
  }
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

interface Diff { campo: string; antes: unknown; depois: unknown }
function computarDiff(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): Diff[] {
  const a = antes ?? {};
  const d = depois ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(d)]);
  const out: Diff[] = [];
  for (const k of keys) {
    if (CAMPOS_OCULTOS.has(k)) continue;
    const va = a[k];
    const vd = d[k];
    if (JSON.stringify(va) === JSON.stringify(vd)) continue;
    out.push({ campo: k, antes: va, depois: vd });
  }
  return out.sort((x, y) => labelCampo(x.campo).localeCompare(labelCampo(y.campo)));
}

function camposRelevantes(obj: Record<string, unknown> | null): Diff[] {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([k, v]) => !CAMPOS_OCULTOS.has(k) && v !== null && v !== "")
    .map(([k, v]) => ({ campo: k, antes: undefined, depois: v }))
    .sort((x, y) => labelCampo(x.campo).localeCompare(labelCampo(y.campo)));
}

function Page() {
  const { clinicaAtual } = useClinica();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabela, setTabela] = useState<string>("all");
  const [acao, setAcao] = useState<string>("all");
  const [usuario, setUsuario] = useState("");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhe, setDetalhe] = useState<AuditRow | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    let q = supabase
      .from("audit_log" as never)
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (tabela !== "all") q = q.eq("table_name", tabela);
    if (acao !== "all") q = q.eq("action", acao);
    if (usuario) q = q.ilike("user_email", `%${usuario}%`);
    if (dataIni) q = q.gte("created_at", new Date(`${dataIni}T00:00:00`).toISOString());
    if (dataFim) q = q.lte("created_at", new Date(`${dataFim}T23:59:59`).toISOString());
    const { data, error } = await q;
    setLoading(false);
    if (error) { mostrarErro(error); return; }
    setRows((data as unknown as AuditRow[]) ?? []);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  const tabelasUnicas = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))).sort(), [rows]);

  const exportar = () => {
    if (rows.length === 0) { toast.error("Sem dados para exportar"); return; }
    exportToExcel(
      rows.map((r) => ({
        data: new Date(r.created_at).toLocaleString("pt-BR"),
        usuario: r.user_email ?? "—",
        acao: ACTION_LABEL[r.action] ?? r.action,
        tabela: r.table_name,
        registro_id: r.record_id ?? "",
        dados_antes: r.dados_antes ? JSON.stringify(r.dados_antes) : "",
        dados_depois: r.dados_depois ? JSON.stringify(r.dados_depois) : "",
      })),
      `auditoria_${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "data", label: "Data/Hora" },
        { key: "usuario", label: "Usuário" },
        { key: "acao", label: "Ação" },
        { key: "tabela", label: "Tabela" },
        { key: "registro_id", label: "ID do registro" },
        { key: "dados_antes", label: "Dados antes" },
        { key: "dados_depois", label: "Dados depois" },
      ],
    );
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Auditoria de uso</h1>
          <p className="text-sm text-muted-foreground">Histórico de alterações no sistema — {clinicaAtual.clinica.nome}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
          <Button onClick={exportar}><Download className="h-4 w-4 mr-1" /> Baixar Excel</Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {tabelasUnicas.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ação</Label>
            <Select value={acao} onValueChange={setAcao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="INSERT">Criou</SelectItem>
                <SelectItem value="UPDATE">Alterou</SelectItem>
                <SelectItem value="DELETE">Excluiu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Usuário (e-mail)</Label>
            <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Buscar e-mail..." />
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <DateInputBR value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <DateInputBR value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
            <Button onClick={() => void load()}>Filtrar</Button>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="w-24">Ação</TableHead>
              <TableHead>Tabela</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro de auditoria encontrado.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-sm">{r.user_email ?? "—"}</TableCell>
                <TableCell><Badge className={ACTION_COLOR[r.action]}>{ACTION_LABEL[r.action] ?? r.action}</Badge></TableCell>
                <TableCell className="text-sm font-mono">{r.table_name}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{r.record_id ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setDetalhe(r)}>Ver</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Detalhes da alteração</DialogTitle></DialogHeader>
          {detalhe && (
            <div className="space-y-3 text-sm">
              <div><strong>Usuário:</strong> {detalhe.user_email ?? "—"}</div>
              <div><strong>Data:</strong> {new Date(detalhe.created_at).toLocaleString("pt-BR")}</div>
              <div><strong>Tabela:</strong> {detalhe.table_name} | <strong>Ação:</strong> {ACTION_LABEL[detalhe.action]}</div>
              {detalhe.dados_antes && (
                <div>
                  <strong>Antes:</strong>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto mt-1">{JSON.stringify(detalhe.dados_antes, null, 2)}</pre>
                </div>
              )}
              {detalhe.dados_depois && (
                <div>
                  <strong>Depois:</strong>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto mt-1">{JSON.stringify(detalhe.dados_depois, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageWithTabs() {
  return (
    <>
      <SectionTabs title={SEGURANCA_META.title} icon={SEGURANCA_META.icon} tabs={SEGURANCA_TABS} />
      <Page />
    </>
  );
}
