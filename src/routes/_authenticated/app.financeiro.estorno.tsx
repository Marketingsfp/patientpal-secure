import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Undo2, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { logAction } from "@/hooks/use-crud";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/financeiro/estorno")({
  component: Page,
  head: () => ({ meta: [{ title: "Estorno — Financeiro" }] }),
});

interface Solic {
  id: string;
  paciente_nome: string | null;
  descricao: string | null;
  valor: number | null;
  motivo: string;
  status: "pendente" | "aprovado" | "rejeitado" | string;
  solicitado_em: string;
  solicitado_por: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  resposta: string | null;
  lancamento_id: string | null;
  agendamento_id: string | null;
  tipo: "erro_caixa" | "devolucao" | null;
  data_pagamento_original: string | null;
  data_estorno: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "border-amber-400 text-amber-900 bg-amber-100",
    aprovado: "border-emerald-400 text-emerald-900 bg-emerald-100",
    rejeitado: "border-rose-400 text-rose-900 bg-rose-100",
  };
  const label: Record<string, string> = {
    pendente: "Pendente",
    aprovado: "Aprovado",
    rejeitado: "Recusado",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", map[status] ?? "")}>
      {label[status] ?? status}
    </Badge>
  );
}

function Page() {
  const { clinicaAtual } = useClinica();
  const podeEstornar = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const [items, setItems] = useState<Solic[]>([]);
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [fStatus, setFStatus] = useState<string>("pendente");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fBusca, setFBusca] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  const load = async () => {
    if (!clinicaAtual) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("estorno_solicitacoes")
      .select(
        "id, paciente_nome, descricao, valor, motivo, status, solicitado_em, solicitado_por, resolvido_por, resolvido_em, resposta, lancamento_id, agendamento_id, tipo, data_pagamento_original, data_estorno",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("solicitado_em", { ascending: false })
      .limit(500);
    if (error) mostrarErro(error);
    const rows = (data ?? []) as Solic[];
    setItems(rows);
    const ids = Array.from(
      new Set(
        rows.flatMap((r) => [r.solicitado_por, r.resolvido_por]).filter((x): x is string => !!x),
      ),
    );
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; nome: string }) => {
        map[p.id] = p.nome;
      });
      setNomesUsuarios(map);
    } else {
      setNomesUsuarios({});
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel(`fin-estorno-page-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "estorno_solicitacoes",
          filter: `clinica_id=eq.${clinicaAtual.clinica_id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  const filtered = useMemo(() => {
    const q = norm(fBusca.trim());
    const de = fDe ? new Date(fDe + "T00:00:00") : null;
    const ate = fAte ? new Date(fAte + "T23:59:59") : null;
    // Dedup: mesma solicitação (mesmo lancamento_id) pode ter sido enviada
    // duas vezes pelo caixa. Mantém apenas a mais recente por lancamento_id.
    // Linhas sem lancamento_id (avulsas) não são deduplicadas.
    const seen = new Set<string>();
    const deduped: Solic[] = [];
    for (const s of items) {
      if (s.lancamento_id) {
        if (seen.has(s.lancamento_id)) continue;
        seen.add(s.lancamento_id);
      }
      deduped.push(s);
    }
    return deduped.filter((s) => {
      if (fStatus !== "todos" && s.status !== fStatus) return false;
      if (fTipo !== "todos" && (s.tipo ?? "") !== fTipo) return false;
      if (q) {
        const alvo = norm(`${s.paciente_nome ?? ""} ${s.descricao ?? ""} ${s.motivo ?? ""}`);
        if (!alvo.includes(q)) return false;
      }
      const d = new Date(s.solicitado_em);
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return true;
    });
  }, [items, fStatus, fTipo, fBusca, fDe, fAte]);

  const contagens = useMemo(() => {
    const c = { pendente: 0, aprovado: 0, rejeitado: 0 };
    const seen = new Set<string>();
    const deduped: Solic[] = [];
    for (const s of items) {
      if (s.lancamento_id) {
        if (seen.has(s.lancamento_id)) continue;
        seen.add(s.lancamento_id);
      }
      deduped.push(s);
    }
    for (const s of deduped) {
      if (s.status === "pendente") c.pendente++;
      else if (s.status === "aprovado") c.aprovado++;
      else if (s.status === "rejeitado") c.rejeitado++;
    }
    return c;
  }, [items]);

  const executarEstorno = async (
    s: Solic,
  ): Promise<{ executado: boolean; resposta: string } | null> => {
    if (!s.lancamento_id) {
      return { executado: false, resposta: "Aprovado manualmente (sem lançamento vinculado)" };
    }
    // Busca lançamento
    const { data: lanc, error: eLanc } = await supabase
      .from("fin_lancamentos")
      .select("id, agendamento_id, valor, descricao")
      .eq("id", s.lancamento_id)
      .maybeSingle();
    if (eLanc) {
      mostrarErro(eLanc);
      return null;
    }
    if (!lanc) {
      return { executado: false, resposta: "Aprovado manualmente (lançamento não encontrado)" };
    }
    // Pré-checagens equivalentes ao estornar() da aba Atendimentos.
    // "origem = agenda" corresponde a lançamentos com agendamento_id preenchido.
    const { data: atd } = await supabase
      .from("fin_atendimentos")
      .select("id, repasse_pago")
      .eq("lancamento_id", s.lancamento_id)
      .maybeSingle();
    if (atd?.repasse_pago) {
      toast.error("Repasse já pago — estorne o pagamento do repasse primeiro.");
      return null;
    }
    const agId = lanc.agendamento_id;
    if (!agId) {
      toast.error("Apenas atendimentos vindos da agenda podem ser estornados.");
      return null;
    }
    const { data: agAntes } = await supabase
      .from("agendamentos")
      .select("id, status, fluxo_etapa")
      .eq("id", agId)
      .maybeSingle();
    // Marca o lançamento como CANCELADO (estornado). Não usamos DELETE
    // porque a policy `fin_lanc_delete` só permite admin/gestor — para
    // usuários financeiro o DELETE não retorna erro, mas afeta 0 linhas,
    // deixando o pagamento "vivo" e o agendamento travado como pago na
    // agenda. Como o restante do sistema já filtra apenas
    // status='confirmado', mudar para 'cancelado' libera a ficha.
    const { error: eUpdLanc } = await supabase
      .from("fin_lancamentos")
      .update({ status: "cancelado" })
      .eq("id", lanc.id);
    if (eUpdLanc) {
      mostrarErro(eUpdLanc, "falha ao estornar lançamento");
      return null;
    }
    const { error: eUpd } = await supabase
      .from("agendamentos")
      .update({
        status: "agendado",
        fluxo_etapa: "aguardando_recepcao",
        fluxo_atualizado_em: new Date().toISOString(),
      })
      .eq("id", agId);
    if (eUpd) {
      mostrarErro(eUpd);
      return null;
    }
    try {
      await logAction({
        table_name: "agendamentos",
        record_id: agId,
        action: "ESTORNO",
        clinica_id: clinicaAtual?.clinica_id,
        dados_antes: agAntes ?? { id: agId },
        dados_depois: {
          id: agId,
          status: "agendado",
          fin_lancamentos_id_removido: lanc.id,
          valor_estornado: lanc.valor ?? null,
        },
      });
    } catch {
      /* auditoria best-effort */
    }
    return { executado: true, resposta: "Estorno executado" };
  };

  const aprovar = async (s: Solic) => {
    if (!podeEstornar) {
      toast.error("Sem permissão");
      return;
    }
    if (!confirm("Aprovar e estornar esta solicitação?")) return;
    setBusy(s.id);
    try {
      const r = await executarEstorno(s);
      if (!r) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("estorno_solicitacoes")
        .update({
          status: "aprovado",
          resolvido_por: user?.id ?? null,
          resolvido_em: new Date().toISOString(),
          resposta: r.resposta,
        })
        .eq("id", s.id);
      if (error) mostrarErro(error);
      else {
        toast.success(
          r.executado
            ? "Atendimento estornado e solicitação aprovada."
            : "Solicitação aprovada (processar baixa manualmente).",
        );
        void load();
      }
    } finally {
      setBusy(null);
    }
  };

  const recusar = async (s: Solic) => {
    if (!podeEstornar) {
      toast.error("Sem permissão");
      return;
    }
    const resp = window.prompt("Motivo da recusa (opcional):") ?? "";
    setBusy(s.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("estorno_solicitacoes")
        .update({
          status: "rejeitado",
          resolvido_por: user?.id ?? null,
          resolvido_em: new Date().toISOString(),
          resposta: resp || null,
        })
        .eq("id", s.id);
      if (error) mostrarErro(error);
      else {
        toast.success("Solicitação recusada");
        void load();
      }
    } finally {
      setBusy(null);
    }
  };

  const onExport = () => {
    if (!filtered.length) {
      toast.info("Sem dados para exportar.");
      return;
    }
    exportToExcel(
      filtered.map((s) => ({
        solicitado_em: new Date(s.solicitado_em).toLocaleString("pt-BR"),
        paciente: s.paciente_nome ?? "",
        descricao: s.descricao ?? "",
        valor: s.valor != null ? Number(s.valor).toFixed(2) : "",
        tipo: s.tipo === "devolucao" ? "Devolução" : s.tipo === "erro_caixa" ? "Erro de caixa" : "",
        motivo: s.motivo ?? "",
        status: s.status,
        resposta: s.resposta ?? "",
        resolvido_em: s.resolvido_em ? new Date(s.resolvido_em).toLocaleString("pt-BR") : "",
      })),
      `estornos-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "solicitado_em", label: "Solicitado em" },
        { key: "paciente", label: "Paciente" },
        { key: "descricao", label: "Descrição" },
        { key: "valor", label: "Valor (R$)" },
        { key: "tipo", label: "Tipo" },
        { key: "motivo", label: "Motivo" },
        { key: "status", label: "Status" },
        { key: "resposta", label: "Resposta" },
        { key: "resolvido_em", label: "Resolvido em" },
      ],
    );
  };

  if (!podeEstornar) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Acesso restrito. Apenas administradores, gestores e financeiro podem gerenciar estornos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Undo2 className="h-5 w-5 text-rose-700" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Estorno</h1>
            <p className="text-xs text-muted-foreground">
              Solicitações enviadas pelo caixa/recepção — aprove para estornar o atendimento ou recuse
              com uma justificativa.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">
            Pendentes: {contagens.pendente}
          </Badge>
          <Badge variant="outline" className="border-emerald-400 bg-emerald-100 text-emerald-900">
            Aprovadas: {contagens.aprovado}
          </Badge>
          <Badge variant="outline" className="border-rose-400 bg-rose-100 text-rose-900">
            Recusadas: {contagens.rejeitado}
          </Badge>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Paciente, descrição ou motivo"
                value={fBusca}
                onChange={(e) => setFBusca(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="aprovado">Aprovadas</SelectItem>
                <SelectItem value="rejeitado">Recusadas</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="erro_caixa">Erro de caixa</SelectItem>
                <SelectItem value="devolucao">Devolução</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" className="h-9" value={fDe} onChange={(e) => setFDe(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input
              type="date"
              className="h-9"
              value={fAte}
              onChange={(e) => setFAte(e.target.value)}
            />
          </div>
          {(fBusca || fStatus !== "pendente" || fTipo !== "todos" || fDe || fAte) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFBusca("");
                setFStatus("pendente");
                setFTipo("todos");
                setFDe("");
                setFAte("");
              }}
            >
              <Filter className="h-4 w-4 mr-1" /> Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Solicitado</TableHead>
                <TableHead className="w-[160px]">Solicitante</TableHead>
                <TableHead>Paciente / Descrição</TableHead>
                <TableHead className="w-[110px]">Valor</TableHead>
                <TableHead className="w-[110px]">Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[240px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    Nenhuma solicitação encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {new Date(s.solicitado_em).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.solicitado_por ? (nomesUsuarios[s.solicitado_por] ?? "—") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{s.paciente_nome ?? "—"}</div>
                      {s.descricao && (
                        <div className="text-xs text-muted-foreground">{s.descricao}</div>
                      )}
                      {s.tipo === "devolucao" &&
                        (s.data_pagamento_original || s.data_estorno) && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {s.data_pagamento_original && (
                              <>
                                Pago em{" "}
                                {new Date(s.data_pagamento_original).toLocaleDateString("pt-BR")}
                              </>
                            )}
                            {s.data_pagamento_original && s.data_estorno && " • "}
                            {s.data_estorno && (
                              <>
                                Devolver em{" "}
                                {new Date(s.data_estorno).toLocaleDateString("pt-BR")}
                              </>
                            )}
                          </div>
                        )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.valor != null ? fmt(Number(s.valor)) : "—"}
                    </TableCell>
                    <TableCell>
                      {s.tipo ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] h-5 px-1.5",
                            s.tipo === "devolucao"
                              ? "border-amber-400 text-amber-900 bg-amber-100"
                              : "border-rose-400 text-rose-900 bg-rose-100",
                          )}
                        >
                          {s.tipo === "devolucao" ? "Devolução" : "Erro de caixa"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs italic max-w-[260px]">
                      <div className="line-clamp-3">"{s.motivo}"</div>
                      {s.resposta && (
                        <div className="not-italic text-[10px] text-muted-foreground mt-1">
                          Resposta: {s.resposta}
                        </div>
                      )}
                      {s.resolvido_em && (
                        <div className="not-italic text-[10px] text-muted-foreground">
                          Resolvido em {new Date(s.resolvido_em).toLocaleString("pt-BR")}
                          {s.resolvido_por && (
                            <> por {nomesUsuarios[s.resolvido_por] ?? "—"}</>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {s.status === "pendente" ? (
                        <div className="flex gap-1.5 justify-end">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={busy === s.id}
                            onClick={() => aprovar(s)}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={busy === s.id}
                            onClick={() => recusar(s)}
                          >
                            Recusar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
