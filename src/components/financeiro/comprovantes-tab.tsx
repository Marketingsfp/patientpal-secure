import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Printer, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  calcRepasseFull,
  normRepasse,
  type RepasseCtx,
  type RepasseMedico,
  type RepasseConvenio,
} from "@/lib/repasse-calc";

type Row = {
  id: string;
  data: string;
  procedimento: string | null;
  valor_medico: number;
  valor_laudo: number;
  repasse_pago_em: string | null;
  repasse_pago_at: string | null;
  repasse_forma_pagamento: string | null;
  repasse_conta_id: string | null;
  repasse_lancamento_id: string | null;
  medico_id: string | null;
  medico_nome: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
};

type Grupo = {
  key: string;
  medico_id: string | null;
  medico_nome: string;
  data_pagamento: string; // YYYY-MM-DD
  pago_at: string | null;
  forma_pagamento: string;
  conta_nome: string;
  total: number;
  qtd: number;
  itens: Row[];
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";

const derivarHora = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const isBackfill = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isBackfill) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "DINHEIRO",
  manual: "DINHEIRO",
  pix: "PIX",
  cartao_debito: "CARTÃO DÉBITO",
  cartao_credito: "CARTÃO CRÉDITO",
  transferencia: "TRANSFERÊNCIA",
  boleto: "BOLETO",
};

const labelForma = (v: string | null | undefined) => {
  if (!v) return "—";
  const k = v.toLowerCase();
  return FORMA_LABEL[k] ?? v.toUpperCase();
};

export function ComprovantesTab() {
  const { clinicaAtual } = useClinica();
  const clinicaNome = clinicaAtual?.clinica?.nome ?? "—";
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const hoje = new Date();
  const trintaDias = new Date();
  trintaDias.setDate(hoje.getDate() - 30);
  const [de, setDe] = useState(trintaDias.toISOString().slice(0, 10));
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10));
  const [busca, setBusca] = useState("");
  const [medicoFiltro, setMedicoFiltro] = useState<string>("todos");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [repasseCtx, setRepasseCtx] = useState<RepasseCtx>({
    medicos: [],
    convenios: [],
    procTipos: new Map(),
  });

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!clinicaId) return;
      const { data } = await supabase
        .from("fin_contas")
        .select("id, nome")
        .eq("clinica_id", clinicaId);
      if (!cancel) setContas(data ?? []);
    })();
    // Carrega contexto para recalcular o repasse médico quando o lançamento
    // não tem `valor_medico_override` gravado (histórico antigo). Mesmo
    // conjunto de dados usado pela aba Atendimentos do Financeiro.
    (async () => {
      if (!clinicaId) return;
      const [{ data: meds }, rep] = await Promise.all([
        supabase
          .from("medicos")
          .select(
            "id, aceita_cartao_beneficios, cb_tipo_repasse, cb_valor_repasse, cb_percentual_repasse",
          )
          .eq("clinica_id", clinicaId)
          .eq("ativo", true),
        supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaId }),
      ]);
      const repMap = new Map<
        string,
        { tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null }
      >();
      for (const r of ((rep.data as unknown[] | null) ?? []) as Array<{
        id: string;
        tipo_repasse: string | null;
        percentual_repasse_padrao: number | null;
        valor_repasse_padrao: number | null;
      }>) {
        repMap.set(r.id, r);
      }
      const medicosCtx: RepasseMedico[] = ((meds ?? []) as Array<Record<string, unknown>>).map((x) => {
        const r = repMap.get(x.id as string);
        return {
          id: x.id as string,
          tipo_repasse: r?.tipo_repasse ?? "percentual",
          percentual_repasse_padrao: Number(r?.percentual_repasse_padrao ?? 0),
          valor_repasse_padrao: r?.valor_repasse_padrao ?? null,
          aceita_cartao_beneficios: !!x.aceita_cartao_beneficios,
          cb_tipo_repasse: (x.cb_tipo_repasse as string) ?? null,
          cb_valor_repasse: (x.cb_valor_repasse as number) ?? null,
          cb_percentual_repasse: (x.cb_percentual_repasse as number) ?? null,
        };
      });
      // Convênios por médico — paginado (PostgREST teto 1000).
      const ids = medicosCtx.map((m) => m.id);
      const conveniosCtx: RepasseConvenio[] = [];
      if (ids.length) {
        const CHUNK = 1000;
        const MAX = 50000;
        let offset = 0;
        for (;;) {
          const { data: cv, error } = await supabase
            .from("medico_convenios")
            .select("medico_id, nome, tipo_repasse, percentual, valor")
            .in("medico_id", ids)
            .eq("ativo", true)
            .range(offset, offset + CHUNK - 1);
          if (error) break;
          const rowsCv = (cv ?? []) as RepasseConvenio[];
          conveniosCtx.push(...rowsCv);
          if (rowsCv.length < CHUNK) break;
          offset += CHUNK;
          if (offset >= MAX) break;
        }
      }
      // Mapa de tipos de procedimento (para fallback por categoria __CAT__).
      const procTipos = new Map<string, string>();
      {
        const CHUNK = 1000;
        const MAX = 50000;
        let offset = 0;
        for (;;) {
          const { data, error } = await supabase
            .from("procedimentos")
            .select("nome, tipo")
            .eq("clinica_id", clinicaId)
            .eq("ativo", true)
            .range(offset, offset + CHUNK - 1);
          if (error) break;
          const rowsPr = (data ?? []) as Array<{ nome: string | null; tipo: string | null }>;
          for (const pr of rowsPr) {
            if (!pr.nome || !pr.tipo) continue;
            const key = normRepasse(pr.nome);
            if (!procTipos.has(key)) procTipos.set(key, pr.tipo);
          }
          if (rowsPr.length < CHUNK) break;
          offset += CHUNK;
          if (offset >= MAX) break;
        }
      }
      if (!cancel) {
        setRepasseCtx({ medicos: medicosCtx, convenios: conveniosCtx, procTipos });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaId]);

  const load = async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const [atRes, lcRes] = await Promise.all([
        supabase
          .from("fin_atendimentos")
          .select(
            "id, data, procedimento, valor_total, valor_medico, valor_laudo, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, repasse_lancamento_id, medico_id, paciente_id, medicos:medico_id(nome), pacientes:paciente_id(nome)",
          )
          .eq("clinica_id", clinicaId)
          .eq("repasse_pago", true)
          .gte("repasse_pago_em", de)
          .lte("repasse_pago_em", ate)
          .order("repasse_pago_em", { ascending: false })
          .limit(5000),
        supabase
          .from("fin_lancamentos")
          .select(
            "id, data, descricao, valor, valor_medico_override, valor_laudo, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, repasse_lancamento_id, medico_id, paciente_id, agendamento_id, medicos:medico_id(nome), pacientes:paciente_id(nome), agendamento:agendamentos(procedimento, paciente_nome, paciente_id, medico_id, inicio)",
          )
          .eq("clinica_id", clinicaId)
          .eq("repasse_pago", true)
          .gte("repasse_pago_em", de)
          .lte("repasse_pago_em", ate)
          .order("repasse_pago_em", { ascending: false })
          .limit(5000),
      ]);
      if (atRes.error) throw atRes.error;
      if (lcRes.error) throw lcRes.error;
      // Extrai o nome do paciente/procedimento da descrição do lançamento
      // quando não houver relacionamento direto — as descrições seguem o
      // padrão "NOME PACIENTE — PROCEDIMENTO — extras".
      const parseDescricao = (desc: string | null) => {
        if (!desc) return { paciente: null as string | null, procedimento: null as string | null };
        const partes = desc.split(" — ");
        return {
          paciente: partes[0]?.trim() || null,
          procedimento: partes[1]?.trim() || null,
        };
      };
      const mappedAt: Row[] = (atRes.data ?? []).map((r: Record<string, unknown>) => {
        // Atendimentos antigos podem ter `valor_medico` gravado com o valor
        // cheio do serviço. A aba Atendimentos recalcula esses casos pela
        // regra do médico/convênio; a 2ª via precisa fazer o mesmo.
        const valorTotal = Number(r.valor_total) || Number(r.valor_medico) || 0;
        const repasseCalc = calcRepasseFull(
          repasseCtx,
          (r.medico_id as string) ?? null,
          valorTotal,
          (r.procedimento as string) ?? null,
          null,
        ).repasse;
        return {
          id: r.id as string,
          data: r.data as string,
          procedimento: (r.procedimento as string) ?? null,
          valor_medico: repasseCalc > 0 ? repasseCalc : Number(r.valor_medico) || 0,
          valor_laudo: Number(r.valor_laudo) || 0,
          repasse_pago_em: (r.repasse_pago_em as string) ?? null,
          repasse_pago_at: (r.repasse_pago_at as string) ?? null,
          repasse_forma_pagamento: (r.repasse_forma_pagamento as string) ?? null,
          repasse_conta_id: (r.repasse_conta_id as string) ?? null,
          repasse_lancamento_id: (r.repasse_lancamento_id as string) ?? null,
          medico_id: (r.medico_id as string) ?? null,
          medico_nome:
            (r.medicos as { nome?: string } | null)?.nome ?? null,
          paciente_id: (r.paciente_id as string) ?? null,
          paciente_nome:
            (r.pacientes as { nome?: string } | null)?.nome ?? null,
        };
      });
      const mappedLc: Row[] = (lcRes.data ?? []).map((r: Record<string, unknown>) => {
        const info = parseDescricao((r.descricao as string) ?? null);
        const agendamento = r.agendamento as {
          procedimento?: string | null;
          paciente_nome?: string | null;
          paciente_id?: string | null;
          medico_id?: string | null;
          inicio?: string | null;
        } | null;
        const procedimento = agendamento?.procedimento ?? info.procedimento;
        const medicoId = ((r.medico_id as string | null) ?? agendamento?.medico_id) ?? null;
        const pacienteId = ((r.paciente_id as string | null) ?? agendamento?.paciente_id) ?? null;
        const dataAtendimento = agendamento?.inicio ? agendamento.inicio.slice(0, 10) : ((r.data as string) ?? "");
        // Se o lançamento tem override manual, usa direto. Caso contrário
        // recalcula o repasse pela regra do médico/convênio — mesma lógica
        // exibida na aba "Atendimentos". Antes caía no valor cheio (`valor`),
        // fazendo a segunda via imprimir o valor do serviço em vez do
        // repasse.
        const valorPago = Number(r.valor) || 0;
        const override = r.valor_medico_override;
        const valorMed =
          override != null && override !== ""
            ? Number(override)
            : calcRepasseFull(
                repasseCtx,
                medicoId,
                valorPago,
                procedimento,
                (r.descricao as string) ?? null,
              ).repasse;
        return {
          id: r.id as string,
          data: dataAtendimento,
          procedimento,
          valor_medico: valorMed,
          valor_laudo: Number(r.valor_laudo) || 0,
          repasse_pago_em: (r.repasse_pago_em as string) ?? null,
          repasse_pago_at: (r.repasse_pago_at as string) ?? null,
          repasse_forma_pagamento: (r.repasse_forma_pagamento as string) ?? null,
          repasse_conta_id: (r.repasse_conta_id as string) ?? null,
          repasse_lancamento_id: (r.repasse_lancamento_id as string) ?? null,
          medico_id: medicoId,
          medico_nome: (r.medicos as { nome?: string } | null)?.nome ?? null,
          paciente_id: pacienteId,
          paciente_nome:
            (r.pacientes as { nome?: string } | null)?.nome ?? agendamento?.paciente_nome ?? info.paciente,
        };
      });
      setRows([...mappedAt, ...mappedLc]);
    } catch (err) {
      toast.error("Erro ao carregar comprovantes: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId, de, ate, repasseCtx]);

  const medicosDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.medico_id) m.set(r.medico_id, r.medico_nome ?? "—");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const contaNomeById = (id: string | null) =>
    (id && contas.find((c) => c.id === id)?.nome) || "—";

  const grupos: Grupo[] = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (medicoFiltro !== "todos" && r.medico_id !== medicoFiltro) return false;
      if (busca) {
        const q = busca.toLowerCase();
        return (r.medico_nome ?? "").toLowerCase().includes(q);
      }
      return true;
    });
    const map = new Map<string, Grupo>();
    for (const r of filtered) {
      const dataPag =
        r.repasse_pago_em ?? (r.repasse_pago_at ? r.repasse_pago_at.slice(0, 10) : r.data);
      const key = `${r.medico_id ?? "sem"}|${dataPag}|${r.repasse_lancamento_id ?? "nolot"}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          medico_id: r.medico_id,
          medico_nome: r.medico_nome ?? "—",
          data_pagamento: dataPag,
          pago_at: r.repasse_pago_at,
          forma_pagamento: labelForma(r.repasse_forma_pagamento),
          conta_nome: contaNomeById(r.repasse_conta_id),
          total: 0,
          qtd: 0,
          itens: [],
        };
        map.set(key, g);
      }
      g.itens.push(r);
      g.qtd += 1;
      g.total += (Number(r.valor_medico) || 0) + (Number(r.valor_laudo) || 0);
    }
    return [...map.values()].sort((a, b) => {
      if (a.data_pagamento !== b.data_pagamento) return a.data_pagamento < b.data_pagamento ? 1 : -1;
      return a.medico_nome.localeCompare(b.medico_nome);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, medicoFiltro, busca, contas]);

  // Modal / impressão
  const [open, setOpen] = useState(false);
  const [grupoAtual, setGrupoAtual] = useState<Grupo | null>(null);
  const grupoVisualizado = useMemo(
    () => (grupoAtual ? grupos.find((g) => g.key === grupoAtual.key) ?? grupoAtual : null),
    [grupoAtual, grupos],
  );
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  const abrir = (g: Grupo) => {
    setGrupoAtual(g);
    setOpen(true);
  };

  const imprimir = (somenteResumo = false, gForce?: Grupo) => {
    const g = gForce ?? grupoVisualizado;
    if (!g) return;
    // Se está sendo impresso direto da lista sem abrir modal, renderizamos
    // temporariamente o conteúdo em memória.
    const buildHtml = () => renderComprovanteHtml(g, clinicaNome);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "210mm",
      height: "297mm",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(iframe);
    const pw = iframe.contentWindow;
    const pd = pw?.document;
    if (!pw || !pd) {
      iframe.remove();
      toast.error("Não foi possível preparar a impressão.");
      return;
    }
    const cleanup = () => {
      setTimeout(() => iframe.remove(), 500);
      pw.removeEventListener("afterprint", cleanup);
    };
    pd.open();
    pd.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Comprovante de repasse médico</title>
<style>
@page { size: A4 portrait; margin: 9mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.28; }
* { box-sizing: border-box; }
.print-shell { width: 100%; max-width: 192mm; margin: 0 auto; }
.header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #d4d4d4; padding-bottom: 2.4mm; margin-bottom: 2.4mm; }
.header .right { text-align: right; }
.reimp { border: 2px solid #be123c; background: #ffe4e6; color: #881337; border-radius: 4px; padding: 2.4mm; text-align: center; margin-bottom: 2.4mm; }
.reimp .t { font-size: 13pt; font-weight: 800; text-transform: uppercase; }
.reimp .s { font-size: 9pt; margin-top: 1mm; }
.resumo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 8mm; row-gap: 1.4mm; border: 1px solid #d4d4d4; border-radius: 4px; padding: 2.4mm; margin-bottom: 2.5mm; }
.mut { color: #555; font-size: 8pt; }
.tot { font-size: 10pt; font-weight: 700; }
table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.2pt; }
th, td { padding: 1.4mm 1.2mm; border-bottom: 1px solid #d7d7d7; vertical-align: top; overflow-wrap: anywhere; }
th { text-align: left; font-weight: 700; background: #f4f4f5; }
th:nth-child(1), td:nth-child(1) { width: 18mm; white-space: nowrap; }
th:nth-child(2), td:nth-child(2) { width: 42mm; }
th:nth-child(3), td:nth-child(3) { width: auto; }
th:nth-child(4), td:nth-child(4) { width: 24mm; text-align: right; white-space: nowrap; }
.sig { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12mm; margin-top: 10mm; padding-top: 3mm; font-size: 8pt; text-align: center; }
.sig .line { border-top: 1px solid #d4d4d4; padding-top: 1mm; }
body.resumo-only .rows-full { display: none !important; }
</style></head>
<body class="${somenteResumo ? "resumo-only" : ""}">
<main class="print-shell">${buildHtml()}</main>
</body></html>`);
    pd.close();
    pw.addEventListener("afterprint", cleanup);
    setTimeout(() => {
      pw.focus();
      pw.print();
      setTimeout(cleanup, 60000);
    }, 100);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ReceiptText className="h-5 w-5" /> Comprovantes de repasse
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico de repasses médicos pagos. Clique em visualizar para ver os pacientes
            e reimprimir a segunda via.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>De</Label>
            <DateInputBR value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <DateInputBR value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div>
            <Label>Médico</Label>
            <select
              className="w-full border rounded-md h-10 px-2 bg-background"
              value={medicoFiltro}
              onChange={(e) => setMedicoFiltro(e.target.value)}
            >
              <option value="todos">Todos</option>
              {medicosDisponiveis.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Buscar médico</Label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando comprovantes...
            </div>
          ) : grupos.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum comprovante de repasse encontrado no período.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data do pagamento</TableHead>
                  <TableHead>Médico</TableHead>
                  <TableHead className="text-center">Pacientes</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.key}>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(g.data_pagamento)}
                      {derivarHora(g.pago_at) ? (
                        <span className="text-xs text-muted-foreground ml-1">
                          {derivarHora(g.pago_at)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{g.medico_nome}</TableCell>
                    <TableCell className="text-center">{g.qtd}</TableCell>
                    <TableCell className="text-right font-medium">{brl(g.total)}</TableCell>
                    <TableCell>{g.forma_pagamento}</TableCell>
                    <TableCell>{g.conta_nome}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => abrir(g)}>
                        <Eye className="h-4 w-4 mr-1" /> Visualizar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1"
                        onClick={() => imprimir(false, g)}
                        title="Imprimir 2ª via"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Comprovante de pagamento de repasse — 2ª via</DialogTitle>
          </DialogHeader>
          {grupoVisualizado && (
            <div
              ref={printAreaRef}
              className="bg-white text-black text-sm max-h-[70vh] overflow-y-auto p-4 rounded-md border"
              dangerouslySetInnerHTML={{ __html: renderComprovanteHtml(grupoVisualizado, clinicaNome) }}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button variant="secondary" onClick={() => imprimir(true)}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir resumo
            </Button>
            <Button onClick={() => imprimir(false)}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function renderComprovanteHtml(g: Grupo, clinicaNome: string): string {
  const emitidoEm = new Date().toLocaleString("pt-BR");
  const dataPagBR = fmtDate(g.data_pagamento);
  const hora = derivarHora(g.pago_at);
  const rowsHtml = g.itens
    .map((it) => {
      const valor = (Number(it.valor_medico) || 0) + (Number(it.valor_laudo) || 0);
      return `<tr>
        <td>${escapeHtml(fmtDate(it.data))}</td>
        <td>${escapeHtml(it.paciente_nome ?? "—")}</td>
        <td>${escapeHtml(it.procedimento ?? "—")}</td>
        <td>${escapeHtml(brl(valor))}</td>
      </tr>`;
    })
    .join("");
  return `
    <style>
      .repasse-preview { color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.35; }
      .repasse-preview * { box-sizing: border-box; }
      .repasse-preview .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #d4d4d4; padding-bottom: 8px; margin-bottom: 8px; }
      .repasse-preview .header .right { text-align: right; }
      .repasse-preview .reimp { border: 2px solid #be123c; background: #ffe4e6; color: #881337; border-radius: 4px; padding: 8px; text-align: center; margin-bottom: 8px; }
      .repasse-preview .reimp .t { font-size: 13pt; font-weight: 800; text-transform: uppercase; }
      .repasse-preview .reimp .s { font-size: 9pt; margin-top: 2px; }
      .repasse-preview .resumo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; row-gap: 4px; border: 1px solid #d4d4d4; border-radius: 4px; padding: 8px; margin-bottom: 10px; }
      .repasse-preview .mut { color: #555; font-size: 9pt; }
      .repasse-preview .tot { font-size: 11pt; font-weight: 700; }
      .repasse-preview table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }
      .repasse-preview th, .repasse-preview td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; overflow-wrap: anywhere; }
      .repasse-preview th { text-align: left; font-weight: 700; background: #f4f4f5; }
      .repasse-preview th:nth-child(1), .repasse-preview td:nth-child(1) { width: 90px; white-space: nowrap; }
      .repasse-preview th:nth-child(2), .repasse-preview td:nth-child(2) { width: 32%; }
      .repasse-preview th:nth-child(3), .repasse-preview td:nth-child(3) { width: auto; }
      .repasse-preview th:nth-child(4), .repasse-preview td:nth-child(4) { width: 110px; text-align: right; white-space: nowrap; }
      .repasse-preview .sig { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px; margin-top: 32px; padding-top: 12px; font-size: 9pt; text-align: center; }
      .repasse-preview .sig .line { border-top: 1px solid #d4d4d4; padding-top: 4px; }
    </style>
    <div class="repasse-preview">
    <div class="reimp">
      <div class="t">Segunda via — Reimpressão de comprovante</div>
      <div class="s">Pagamento realizado em <b>${dataPagBR}${hora ? ` às ${hora}` : " (horário não registrado)"}</b></div>
      <div class="s mut">Reimpressão emitida em ${escapeHtml(emitidoEm)}</div>
    </div>
    <div class="header">
      <div>
        <div class="mut" style="text-transform:uppercase;">Clínica</div>
        <div style="font-size:12pt;font-weight:600;">${escapeHtml(clinicaNome)}</div>
      </div>
      <div class="right">
        <div style="font-size:10pt;font-weight:600;">Comprovante de repasse médico</div>
        <div class="mut">Emitido em ${escapeHtml(emitidoEm)}</div>
      </div>
    </div>
    <div class="resumo">
      <div><span class="mut">Médico: </span><b>${escapeHtml(g.medico_nome)}</b></div>
      <div><span class="mut">Data e hora do pagamento: </span><b>${dataPagBR}${hora ? ` às ${hora}` : " (horário não registrado)"}</b></div>
      <div><span class="mut">Forma: </span><b>${escapeHtml(g.forma_pagamento)}</b></div>
      <div><span class="mut">Conta: </span><b>${escapeHtml(g.conta_nome)}</b></div>
      <div><span class="mut">Atendimentos: </span><b>${g.qtd}</b></div>
      <div style="text-align:right;"><span class="mut">Total pago ao médico: </span><b class="tot">${escapeHtml(brl(g.total))}</b></div>
    </div>
    <div class="rows-full">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Paciente</th>
            <th>Serviço</th>
            <th>Valor (R$)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="font-weight:700;">Total</td>
            <td style="text-align:right;font-weight:700;">${escapeHtml(brl(g.total))}</td>
          </tr>
        </tfoot>
      </table>
      <div class="sig">
        <div><div class="line">Assinatura do médico</div></div>
        <div><div class="line">Assinatura da clínica</div></div>
      </div>
    </div>
    </div>
  `;
}