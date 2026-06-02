import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { MiniPieChart } from "@/components/charts/MiniPieChart";
import { MiniLineChart } from "@/components/charts/MiniLineChart";
import { exportToExcel } from "@/lib/export-csv";
import { toast } from "sonner";
import { Download, Save, Trash2, BarChart3, PieChart, LineChart, Table as TableIcon } from "lucide-react";

// ============================================================
// Tipos
// ============================================================
type Row = Record<string, any>;
type FieldKind = "string" | "number" | "date";
interface Field { key: string; label: string; kind: FieldKind; }

interface CubeSpec {
  id: string;
  label: string;
  usaPeriodo: boolean;
  fields: Field[];
  load: (ctx: { clinicaId: string; ini: string; fim: string }) => Promise<Row[]>;
}

// ============================================================
// Cubos disponíveis
// ============================================================
const CUBOS: CubeSpec[] = [
  {
    id: "agendamentos",
    label: "Agendamentos",
    usaPeriodo: true,
    fields: [
      { key: "status", label: "Status", kind: "string" },
      { key: "medico", label: "Médico", kind: "string" },
      { key: "procedimento", label: "Serviço", kind: "string" },
      { key: "dia", label: "Dia", kind: "date" },
      { key: "mes", label: "Mês", kind: "string" },
      { key: "dia_semana", label: "Dia da semana", kind: "string" },
      { key: "hora", label: "Hora", kind: "string" },
      { key: "paciente", label: "Paciente", kind: "string" },
    ],
    load: async ({ clinicaId, ini, fim }) => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("inicio, status, procedimento, paciente_nome, medicos(nome), pacientes(nome)")
        .eq("clinica_id", clinicaId)
        .gte("inicio", ini)
        .lte("inicio", fim + "T23:59:59");
      if (error) throw error;
      return (data ?? []).map((r: any) => transformDate(r.inicio, {
        status: r.status ?? "—",
        medico: r.medicos?.nome ?? "Sem médico",
        procedimento: r.procedimento ?? "—",
        paciente: r.pacientes?.nome ?? r.paciente_nome ?? "—",
      }));
    },
  },
  {
    id: "financeiro",
    label: "Financeiro",
    usaPeriodo: true,
    fields: [
      { key: "tipo", label: "Tipo", kind: "string" },
      { key: "categoria", label: "Categoria", kind: "string" },
      { key: "conta", label: "Conta", kind: "string" },
      { key: "forma_pagamento", label: "Forma de pagamento", kind: "string" },
      { key: "status", label: "Status", kind: "string" },
      { key: "medico", label: "Médico", kind: "string" },
      { key: "paciente", label: "Paciente", kind: "string" },
      { key: "dia", label: "Dia", kind: "date" },
      { key: "mes", label: "Mês", kind: "string" },
      { key: "valor", label: "Valor (R$)", kind: "number" },
    ],
    load: async ({ clinicaId, ini, fim }) => {
      const { data, error } = await supabase
        .from("fin_lancamentos")
        .select("data, tipo, valor, status, forma_pagamento, fin_categorias(nome), fin_contas(nome), pacientes(nome), medicos(nome)")
        .eq("clinica_id", clinicaId)
        .gte("data", ini)
        .lte("data", fim);
      if (error) throw error;
      return (data ?? []).map((r: any) => transformDate(r.data, {
        tipo: r.tipo ?? "—",
        categoria: r.fin_categorias?.nome ?? "Sem categoria",
        conta: r.fin_contas?.nome ?? "—",
        forma_pagamento: r.forma_pagamento ?? "—",
        status: r.status ?? "—",
        medico: r.medicos?.nome ?? "—",
        paciente: r.pacientes?.nome ?? "—",
        valor: Number(r.valor) || 0,
      }));
    },
  },
  {
    id: "prontuarios",
    label: "Prontuários",
    usaPeriodo: true,
    fields: [
      { key: "medico", label: "Médico", kind: "string" },
      { key: "paciente", label: "Paciente", kind: "string" },
      { key: "dia", label: "Dia", kind: "date" },
      { key: "mes", label: "Mês", kind: "string" },
    ],
    load: async ({ clinicaId, ini, fim }) => {
      const { data, error } = await supabase
        .from("prontuarios")
        .select("data_atendimento, medicos(nome), pacientes(nome)")
        .eq("clinica_id", clinicaId)
        .gte("data_atendimento", ini)
        .lte("data_atendimento", fim + "T23:59:59");
      if (error) throw error;
      return (data ?? []).map((r: any) => transformDate(r.data_atendimento, {
        medico: r.medicos?.nome ?? "Sem médico",
        paciente: r.pacientes?.nome ?? "—",
      }));
    },
  },
  {
    id: "pacientes",
    label: "Pacientes",
    usaPeriodo: false,
    fields: [
      { key: "sexo", label: "Sexo", kind: "string" },
      { key: "mes_cadastro", label: "Mês de cadastro", kind: "string" },
      { key: "ano_cadastro", label: "Ano de cadastro", kind: "string" },
      { key: "ativo", label: "Ativo", kind: "string" },
    ],
    load: async ({ clinicaId }) => {
      const { data, error } = await supabase
        .from("pacientes")
        .select("sexo, ativo, created_at")
        .eq("clinica_id", clinicaId);
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const d = (r.created_at ?? "").slice(0, 10);
        return {
          sexo: r.sexo ?? "—",
          ativo: r.ativo ? "Ativo" : "Inativo",
          mes_cadastro: d.slice(0, 7),
          ano_cadastro: d.slice(0, 4),
        };
      });
    },
  },
  {
    id: "orcamentos",
    label: "Orçamentos",
    usaPeriodo: true,
    fields: [
      { key: "status", label: "Status", kind: "string" },
      { key: "paciente", label: "Paciente", kind: "string" },
      { key: "dia", label: "Dia", kind: "date" },
      { key: "mes", label: "Mês", kind: "string" },
      { key: "valor_final", label: "Valor final (R$)", kind: "number" },
      { key: "desconto", label: "Desconto (R$)", kind: "number" },
    ],
    load: async ({ clinicaId, ini, fim }) => {
      const { data, error } = await supabase
        .from("orcamentos")
        .select("created_at, status, valor_final, desconto, pacientes(nome)")
        .eq("clinica_id", clinicaId)
        .gte("created_at", ini)
        .lte("created_at", fim + "T23:59:59");
      if (error) throw error;
      return (data ?? []).map((r: any) => transformDate(r.created_at, {
        status: r.status ?? "—",
        paciente: r.pacientes?.nome ?? "—",
        valor_final: Number(r.valor_final) || 0,
        desconto: Number(r.desconto) || 0,
      }));
    },
  },
];

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function transformDate(isoStr: string | null, base: Record<string, any>) {
  if (!isoStr) return { ...base, dia: "", mes: "", dia_semana: "", hora: "" };
  const d = new Date(isoStr);
  return {
    ...base,
    dia: isoStr.slice(0, 10),
    mes: isoStr.slice(0, 7),
    dia_semana: DIAS_SEMANA[d.getDay()],
    hora: String(d.getHours()).padStart(2, "0") + ":00",
  };
}

// ============================================================
// Agregação
// ============================================================
type AggKind = "count" | "sum" | "avg" | "min" | "max";

function aggregate(rows: Row[], values: number[], kind: AggKind): number {
  if (kind === "count") return rows.length;
  if (values.length === 0) return 0;
  if (kind === "sum") return values.reduce((a, b) => a + b, 0);
  if (kind === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  if (kind === "min") return Math.min(...values);
  if (kind === "max") return Math.max(...values);
  return 0;
}

function pivot(
  rows: Row[],
  rowKey: string,
  colKey: string | null,
  measureField: string | null,
  measureAgg: AggKind,
): { rowLabels: string[]; colLabels: string[]; matrix: number[][]; totalByRow: number[]; totalByCol: number[] } {
  const rowSet = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[rowKey] ?? "—");
    if (!rowSet.has(k)) rowSet.set(k, []);
    rowSet.get(k)!.push(r);
  }
  const colSet = new Set<string>();
  if (colKey) for (const r of rows) colSet.add(String(r[colKey] ?? "—"));
  const colLabels = colKey ? Array.from(colSet).sort() : ["Total"];
  const rowLabels = Array.from(rowSet.keys());
  const matrix: number[][] = rowLabels.map(() => colLabels.map(() => 0));
  rowLabels.forEach((rl, ri) => {
    const rs = rowSet.get(rl)!;
    colLabels.forEach((cl, ci) => {
      const subset = colKey ? rs.filter((r) => String(r[colKey] ?? "—") === cl) : rs;
      const vals = measureField ? subset.map((r) => Number(r[measureField]) || 0) : [];
      matrix[ri][ci] = aggregate(subset, vals, measureAgg);
    });
  });
  const totalByRow = matrix.map((r) => r.reduce((a, b) => a + b, 0));
  const totalByCol = colLabels.map((_, ci) => matrix.reduce((s, r) => s + r[ci], 0));
  // ordena por total desc
  const order = totalByRow.map((_, i) => i).sort((a, b) => totalByRow[b] - totalByRow[a]);
  return {
    rowLabels: order.map((i) => rowLabels[i]),
    colLabels,
    matrix: order.map((i) => matrix[i]),
    totalByRow: order.map((i) => totalByRow[i]),
    totalByCol,
  };
}

const PALETTE = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#a855f7"];
const fmtNum = (n: number) => Number.isInteger(n) ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ============================================================
// Componente principal
// ============================================================
type VizKind = "tabela" | "barras" | "pizza" | "linha";

interface CubeConfig {
  cubeId: string;
  rowKey: string;
  colKey: string | null;
  measureField: string | null;
  measureAgg: AggKind;
  viz: VizKind;
  topN: number;
}

interface SavedView { name: string; config: CubeConfig; }

export function CuboBI({ clinicaId, ini, fim }: { clinicaId?: string; ini: string; fim: string }) {
  const STORAGE_KEY = `relatorios.cubo.views.${clinicaId ?? "default"}`;

  const [cfg, setCfg] = useState<CubeConfig>({
    cubeId: "agendamentos",
    rowKey: "medico",
    colKey: "status",
    measureField: null,
    measureAgg: "count",
    viz: "barras",
    topN: 10,
  });
  const cube = useMemo(() => CUBOS.find((c) => c.id === cfg.cubeId)!, [cfg.cubeId]);
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<SavedView[]>([]);

  // load saved views
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setSaved(raw ? JSON.parse(raw) : []);
    } catch { setSaved([]); }
  }, [STORAGE_KEY]);

  // fetch data
  useEffect(() => {
    if (!clinicaId) return;
    let cancel = false;
    setLoading(true);
    cube.load({ clinicaId, ini, fim })
      .then((rows) => { if (!cancel) setRawRows(rows); })
      .catch((e) => toast.error(e?.message ?? "Erro ao carregar cubo"))
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [clinicaId, ini, fim, cube]);

  // when cube changes, validate fields
  useEffect(() => {
    setCfg((c) => {
      const keys = cube.fields.map((f) => f.key);
      const numKeys = cube.fields.filter((f) => f.kind === "number").map((f) => f.key);
      const rowKey = keys.includes(c.rowKey) ? c.rowKey : (keys[0] ?? "");
      const colKey = c.colKey && keys.includes(c.colKey) ? c.colKey : null;
      const measureField = c.measureField && numKeys.includes(c.measureField) ? c.measureField : null;
      const measureAgg: AggKind = measureField ? (c.measureAgg === "count" ? "sum" : c.measureAgg) : "count";
      return { ...c, rowKey, colKey, measureField, measureAgg };
    });
  }, [cube]);

  const piv = useMemo(() => {
    return pivot(rawRows, cfg.rowKey, cfg.colKey, cfg.measureField, cfg.measureAgg);
  }, [rawRows, cfg.rowKey, cfg.colKey, cfg.measureField, cfg.measureAgg]);

  const topRows = useMemo(() => {
    const n = Math.max(1, cfg.topN);
    return {
      rowLabels: piv.rowLabels.slice(0, n),
      matrix: piv.matrix.slice(0, n),
      totalByRow: piv.totalByRow.slice(0, n),
    };
  }, [piv, cfg.topN]);

  const isMonetary = cfg.measureField === "valor" || cfg.measureField === "valor_final" || cfg.measureField === "desconto";
  const fmt = isMonetary ? fmtBRL : fmtNum;
  const measureLabel = cfg.measureField
    ? `${labelFor(cfg.measureAgg)} de ${cube.fields.find((f) => f.key === cfg.measureField)?.label ?? cfg.measureField}`
    : "Contagem";

  function setField<K extends keyof CubeConfig>(k: K, v: CubeConfig[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  function salvarView() {
    const name = window.prompt("Nome para esta visualização:");
    if (!name) return;
    const next = [...saved.filter((s) => s.name !== name), { name, config: cfg }];
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    toast.success("Visualização salva");
  }
  function carregarView(name: string) {
    const v = saved.find((s) => s.name === name);
    if (v) setCfg(v.config);
  }
  function excluirView(name: string) {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  function exportar() {
    if (piv.rowLabels.length === 0) { toast.info("Sem dados para exportar"); return; }
    const rows = piv.rowLabels.map((rl, ri) => {
      const obj: Record<string, any> = { [cube.fields.find((f) => f.key === cfg.rowKey)?.label ?? cfg.rowKey]: rl };
      piv.colLabels.forEach((cl, ci) => { obj[cl] = piv.matrix[ri][ci]; });
      obj.Total = piv.totalByRow[ri];
      return obj;
    });
    exportToExcel(rows, `cubo-${cube.id}-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <div className="space-y-4">
      {/* Configuração */}
      <Card>
        <CardHeader><CardTitle className="text-base">Monte sua visualização</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Fonte de dados</Label>
              <Select value={cfg.cubeId} onValueChange={(v) => setField("cubeId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CUBOS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Linhas (agrupar por)</Label>
              <Select value={cfg.rowKey} onValueChange={(v) => setField("rowKey", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cube.fields.filter((f) => f.kind !== "number").map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Colunas (séries)</Label>
              <Select value={cfg.colKey ?? "__none__"} onValueChange={(v) => setField("colKey", v === "__none__" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {cube.fields.filter((f) => f.kind !== "number" && f.key !== cfg.rowKey).map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Métrica</Label>
              <div className="flex gap-2">
                <Select value={cfg.measureAgg} onValueChange={(v) => setField("measureAgg", v as AggKind)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Contar</SelectItem>
                    <SelectItem value="sum">Somar</SelectItem>
                    <SelectItem value="avg">Média</SelectItem>
                    <SelectItem value="min">Mínimo</SelectItem>
                    <SelectItem value="max">Máximo</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={cfg.measureField ?? "__none__"}
                  onValueChange={(v) => setField("measureField", v === "__none__" ? null : v)}
                  disabled={cfg.measureAgg === "count"}
                >
                  <SelectTrigger><SelectValue placeholder="campo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— (registros)</SelectItem>
                    {cube.fields.filter((f) => f.kind === "number").map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Visualização</Label>
              <div className="flex gap-1">
                {[
                  { id: "tabela", icon: TableIcon, label: "Tabela" },
                  { id: "barras", icon: BarChart3, label: "Barras" },
                  { id: "linha", icon: LineChart, label: "Linha" },
                  { id: "pizza", icon: PieChart, label: "Pizza" },
                ].map((v) => {
                  const Icon = v.icon;
                  return (
                    <Button
                      key={v.id}
                      type="button"
                      size="sm"
                      variant={cfg.viz === v.id ? "default" : "outline"}
                      className="flex-1 gap-1"
                      onClick={() => setField("viz", v.id as VizKind)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{v.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="topn">Mostrar top</Label>
              <Input id="topn" type="number" min={1} max={100} value={cfg.topN}
                onChange={(e) => setField("topN", Number(e.target.value) || 10)} />
            </div>
            <div className="lg:col-span-2 flex items-end gap-2">
              <Button size="sm" variant="outline" onClick={salvarView} className="gap-1">
                <Save className="h-4 w-4" /> Salvar visualização
              </Button>
              <Button size="sm" variant="outline" onClick={exportar} className="gap-1">
                <Download className="h-4 w-4" /> Exportar Excel
              </Button>
            </div>
          </div>

          {saved.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground self-center">Salvos:</span>
              {saved.map((s) => (
                <div key={s.name} className="flex items-center gap-1 border rounded-md pl-2 text-xs">
                  <button onClick={() => carregarView(s.name)} className="py-1 hover:underline">{s.name}</button>
                  <button onClick={() => excluirView(s.name)} className="p-1 hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {measureLabel} por {cube.fields.find((f) => f.key === cfg.rowKey)?.label}
            {cfg.colKey && cfg.viz !== "pizza" ? ` × ${cube.fields.find((f) => f.key === cfg.colKey)?.label}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!clinicaId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma clínica.</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : piv.rowLabels.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
          ) : cfg.viz === "tabela" ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{cube.fields.find((f) => f.key === cfg.rowKey)?.label}</TableHead>
                    {piv.colLabels.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRows.rowLabels.map((rl, ri) => (
                    <TableRow key={rl}>
                      <TableCell className="font-medium">{rl}</TableCell>
                      {topRows.matrix[ri].map((v, ci) => (
                        <TableCell key={ci} className="text-right">{fmt(v)}</TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">{fmt(topRows.totalByRow[ri])}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold">Total</TableCell>
                    {piv.totalByCol.map((v, ci) => (
                      <TableCell key={ci} className="text-right font-semibold">{fmt(v)}</TableCell>
                    ))}
                    <TableCell className="text-right font-semibold">
                      {fmt(piv.totalByCol.reduce((a, b) => a + b, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : cfg.viz === "barras" ? (
            <MiniBarChart
              labels={topRows.rowLabels}
              series={piv.colLabels.map((cl, ci) => ({
                name: cl,
                color: PALETTE[ci % PALETTE.length],
                values: topRows.matrix.map((row) => row[ci] ?? 0),
              }))}
              formatY={fmt}
            />
          ) : cfg.viz === "linha" ? (
            <MiniLineChart
              labels={topRows.rowLabels}
              series={piv.colLabels.map((cl, ci) => ({
                name: cl,
                color: PALETTE[ci % PALETTE.length],
                values: topRows.matrix.map((row) => row[ci] ?? 0),
              }))}
              formatY={fmt}
            />
          ) : (
            <MiniPieChart
              data={topRows.rowLabels.map((rl, ri) => ({ name: rl, value: topRows.totalByRow[ri] }))}
              formatValue={fmt}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function labelFor(a: AggKind) {
  return a === "count" ? "Contagem" : a === "sum" ? "Soma" : a === "avg" ? "Média" : a === "min" ? "Mínimo" : "Máximo";
}