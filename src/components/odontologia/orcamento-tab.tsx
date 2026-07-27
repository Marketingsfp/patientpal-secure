import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { mostrarErro } from "@/lib/traduzir-erro";
import { printOrcamento } from "@/lib/print-orcamento";
import { formatNumeroOrcamento } from "@/lib/orcamento-numero";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type OrcV2 } from "@/components/orcamentos-v2/orcamento-card";
import { OrcamentoDrawer } from "@/components/orcamentos-v2/orcamento-drawer";
import { NovoOrcamentoOdontoDialog } from "./novo-orcamento-odonto-dialog";

interface Props {
  /** Filtro opcional: quando informado, mostra só os orçamentos deste paciente. */
  pacienteId?: string | null;
  pacienteNome?: string | null;
  pacienteTelefone?: string | null;
  especialidadeOdontoId: string | null;
  /** Controle externo do diálogo "Novo orçamento" (botão fica acima da pesquisa). */
  novoOpen: boolean;
  onNovoOpenChange: (v: boolean) => void;
}

type Linha = OrcV2 & {
  itens_qtd: number;
  total_dinheiro: number;
  total_cartao: number;
  itens_pagos: number;
};

const BRL = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/**
 * Aba Orçamento dentro de /app/odontologia:
 * - tabela com todos os orçamentos odontológicos da clínica (filtro por paciente opcional)
 * - reutiliza o drawer de detalhe e a impressão (2ª via) do módulo v2
 */
export function OrcamentoTab({
  pacienteId, pacienteNome, pacienteTelefone, especialidadeOdontoId,
  novoOpen, onNovoOpenChange,
}: Props) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [list, setList] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOrc, setDrawerOrc] = useState<OrcV2 | null>(null);

  const load = useCallback(async () => {
    if (!clinicaAtual || !especialidadeOdontoId) return;
    setLoading(true);
    let q = supabase
      .from("orcamentos")
      .select("id, numero, serie, paciente_id, paciente_nome, paciente_telefone, medico_nome, forma_pagamento, valor_total, valores_pagamento, desconto, status, created_at, categoria, validade_dias")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("especialidade_id", especialidadeOdontoId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (pacienteId) q = q.eq("paciente_id", pacienteId);
    const { data, error } = await q;
    if (error) { mostrarErro(error); setLoading(false); return; }

    const orcs = ((data ?? []) as unknown as Array<OrcV2 & { valores_pagamento: Record<string, number> | null; desconto: number | null }>).map((o) => ({
      ...o,
      agendamentos_total: 0, agendamentos_realizados: 0,
      itens_total: 0, itens_consumidos: 0,
      itens_qtd: 0, total_dinheiro: 0, total_cartao: 0, itens_pagos: 0,
    })) as (Linha & { valores_pagamento: Record<string, number> | null; desconto: number | null })[];

    if (orcs.length > 0) {
      const ids = orcs.map((o) => o.id);
      const [{ data: ags }, { data: itens }, { data: links }] = await Promise.all([
        supabase.from("agendamentos").select("orcamento_id, status").in("orcamento_id", ids).neq("status", "cancelado"),
        supabase
          .from("orcamento_itens")
          .select("id, orcamento_id, quantidade, valor_unitario, valor_total, valores_formas, status_financeiro")
          .in("orcamento_id", ids),
        supabase
          .from("agendamento_orcamento_itens")
          .select("orcamento_id, orcamento_item_id, agendamento_id")
          .in("orcamento_id", ids),
      ]);

      type ItemRow = {
        id: string; orcamento_id: string; quantidade: number | null;
        valor_unitario: number | null; valor_total: number | null;
        valores_formas: Record<string, number> | null; status_financeiro: string | null;
      };
      const itensRows = (itens ?? []) as ItemRow[];
      const linkRows = (links ?? []) as { orcamento_id: string; orcamento_item_id: string; agendamento_id: string }[];

      // Itens pagos: quitados no financeiro do orçamento OU com agendamento
      // vinculado que já tenha recebimento confirmado (mesma regra da agenda).
      const agIds = Array.from(new Set(linkRows.map((l) => l.agendamento_id))).filter(Boolean);
      let agPagos = new Set<string>();
      if (agIds.length) {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("agendamento_id")
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .in("agendamento_id", agIds);
        agPagos = new Set(
          ((lancs ?? []) as { agendamento_id: string | null }[])
            .map((r) => r.agendamento_id)
            .filter((x): x is string => !!x),
        );
      }
      const itemPagoPorAgenda = new Set(
        linkRows.filter((l) => agPagos.has(l.agendamento_id)).map((l) => l.orcamento_item_id),
      );

      const tot = new Map<string, number>(); const real = new Map<string, number>();
      for (const a of (ags ?? []) as { orcamento_id: string; status: string }[]) {
        tot.set(a.orcamento_id, (tot.get(a.orcamento_id) ?? 0) + 1);
        if (a.status === "realizado") real.set(a.orcamento_id, (real.get(a.orcamento_id) ?? 0) + 1);
      }

      const agg = new Map<string, { qtd: number; dinheiro: number; cartao: number; pagos: number; unidades: number }>();
      for (const it of itensRows) {
        const cur = agg.get(it.orcamento_id) ?? { qtd: 0, dinheiro: 0, cartao: 0, pagos: 0, unidades: 0 };
        const q = Number(it.quantidade ?? 1) || 1;
        const bruto = Number(it.valor_total ?? q * Number(it.valor_unitario ?? 0));
        const vf = it.valores_formas ?? null;
        const dinUnit = vf ? Number(vf["Dinheiro"] ?? 0) : 0;
        const cardUnit = vf
          ? Number(vf["Cartão de Crédito"] ?? vf["Cartão de Débito"] ?? vf["PIX"] ?? vf["Pix"] ?? 0)
          : 0;
        cur.qtd += 1;
        cur.unidades += q;
        cur.dinheiro += dinUnit > 0 ? dinUnit * q : bruto;
        cur.cartao += cardUnit > 0 ? cardUnit * q : bruto;
        if (it.status_financeiro === "pago" || itemPagoPorAgenda.has(it.id)) cur.pagos += 1;
        agg.set(it.orcamento_id, cur);
      }

      const consumidos = new Map<string, Set<string>>();
      for (const l of linkRows) {
        if (!consumidos.has(l.orcamento_id)) consumidos.set(l.orcamento_id, new Set());
        consumidos.get(l.orcamento_id)!.add(l.orcamento_item_id);
      }

      for (const o of orcs) {
        const a = agg.get(o.id);
        o.agendamentos_total = tot.get(o.id) ?? 0;
        o.agendamentos_realizados = real.get(o.id) ?? 0;
        o.itens_total = a?.unidades ?? 0;
        o.itens_consumidos = consumidos.get(o.id)?.size ?? 0;
        o.itens_qtd = a?.qtd ?? 0;
        o.itens_pagos = a?.pagos ?? 0;
        // Desconto do orçamento é global: aplica proporcionalmente às colunas.
        const descontoOrc = Number(o.desconto ?? 0);
        const vp = o.valores_pagamento ?? null;
        const dinTotal = vp && Number(vp["Dinheiro"] ?? 0) > 0
          ? Number(vp["Dinheiro"])
          : Math.max(0, (a?.dinheiro ?? Number(o.valor_total ?? 0)) - descontoOrc);
        const cardTotal = vp
          ? Number(vp["Cartão de Crédito"] ?? vp["Cartão de Débito"] ?? vp["PIX"] ?? vp["Pix"] ?? 0) || Math.max(0, (a?.cartao ?? Number(o.valor_total ?? 0)) - descontoOrc)
          : Math.max(0, (a?.cartao ?? Number(o.valor_total ?? 0)) - descontoOrc);
        o.total_dinheiro = dinTotal;
        o.total_cartao = cardTotal;
      }
    }
    setList(orcs);
    setLoading(false);
  }, [clinicaAtual, especialidadeOdontoId, pacienteId]);

  useEffect(() => { void load(); }, [load]);

  const imprimir = async (id: string) => {
    if (!clinicaAtual) return;
    try { await printOrcamento(id, clinicaAtual.clinica_id); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
          {pacienteId
            ? "Nenhum orçamento odontológico para este paciente ainda."
            : "Nenhum orçamento odontológico cadastrado ainda."}
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Nº</TableHead>
                <TableHead className="whitespace-nowrap">Data / hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Dentista</TableHead>
                <TableHead className="text-center whitespace-nowrap">Itens</TableHead>
                <TableHead className="text-right whitespace-nowrap">Total dinheiro</TableHead>
                <TableHead className="text-right whitespace-nowrap">Total cartão/Pix</TableHead>
                <TableHead className="text-center whitespace-nowrap">Pagos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((o) => {
                const parcial = o.itens_pagos > 0 && o.itens_pagos < o.itens_qtd;
                const tudoPago = o.itens_qtd > 0 && o.itens_pagos === o.itens_qtd;
                return (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => setDrawerOrc(o)}
                  >
                    <TableCell className="whitespace-nowrap text-sm font-medium tabular-nums">
                      {formatNumeroOrcamento(o.serie, o.numero)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{dataHora(o.created_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{o.paciente_nome ?? "—"}</TableCell>
                    <TableCell className="text-sm">{o.medico_nome ?? "—"}</TableCell>
                    <TableCell className="text-center text-sm">{o.itens_qtd}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{BRL(o.total_dinheiro)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{BRL(o.total_cartao)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={tudoPago ? "secondary" : parcial ? "default" : "outline"} className="font-normal">
                        {o.itens_pagos}/{o.itens_qtd}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Imprimir 2ª via"
                        onClick={(e) => { e.stopPropagation(); void imprimir(o.id); }}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <OrcamentoDrawer
        orc={drawerOrc}
        onClose={() => setDrawerOrc(null)}
        onPrint={(id) => void imprimir(id)}
        onConverter={() => {}}
        ocultarConversao
      />

      {novoOpen && clinicaAtual && especialidadeOdontoId && (
        <NovoOrcamentoOdontoDialog
          open={novoOpen}
          onClose={() => onNovoOpenChange(false)}
          clinicaId={clinicaAtual.clinica_id}
          pacienteId={pacienteId ?? null}
          pacienteNome={pacienteNome ?? null}
          pacienteTelefone={pacienteTelefone ?? null}
          especialidadeOdontoId={especialidadeOdontoId}
          userId={user?.id ?? null}
          onCreated={() => { onNovoOpenChange(false); void load(); }}
        />
      )}
    </div>
  );
}
