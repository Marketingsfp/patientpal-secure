import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HandCoins, Search, Wallet } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { listarSaldosEmAberto, type SaldoEmAberto } from "@/lib/agenda/saldo-atendimento";

export const Route = createFileRoute("/_authenticated/app/financeiro/pendencias")({
  component: Page,
  head: () => ({ meta: [{ title: "A Receber — Financeiro" }] }),
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

/**
 * Financeiro > A Receber.
 *
 * Lista os atendimentos que receberam um pagamento parcial (entrada/sinal) e
 * ainda têm saldo devedor, de QUALQUER data — é isso que a agenda sozinha não
 * resolve, porque ela mostra um dia de cada vez e o paciente costuma voltar
 * para quitar semanas depois.
 *
 * Receber daqui grava um lançamento novo, que entra na sessão de caixa do dia
 * de HOJE (regra de `fn_registrar_lancamento_e_caixa`). O pagamento antigo não
 * é tocado: continua no caixa do dia em que foi feito.
 */
function Page() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("financeiro");
  const [items, setItems] = useState<SaldoEmAberto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<SaldoEmAberto | null>(null);

  const load = async () => {
    if (!clinicaAtual) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await listarSaldosEmAberto(clinicaAtual.clinica_id));
    } catch (e) {
      mostrarErro(e);
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  // Busca aplicada em memória: a lista é curta (saldos em aberto de toda a
  // clínica) e assim o filtro responde a cada tecla, sem ida ao banco.
  const filtrados = useMemo(() => {
    const limpar = (s: string | null) =>
      (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const termo = limpar(busca).trim();
    if (!termo) return items;
    return items.filter(
      (i) => limpar(i.paciente_nome).includes(termo) || limpar(i.procedimento).includes(termo),
    );
  }, [items, busca]);

  const totalAberto = useMemo(
    () => Math.round(filtrados.reduce((s, i) => s + i.saldo, 0) * 100) / 100,
    [filtrados],
  );

  const abrirRecebimento = (linha: SaldoEmAberto) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setAlvo(linha);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">A Receber</h1>
          <p className="text-sm text-muted-foreground">
            Atendimentos com pagamento parcial e saldo devedor em aberto, de qualquer data. Receber
            aqui lança o valor no caixa de hoje e quita o atendimento.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente ou procedimento"
            className="pl-8"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-amber-100 p-2 text-amber-700">
              <HandCoins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Atendimentos com saldo
              </div>
              <div className="text-2xl font-semibold tabular-nums">{filtrados.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-amber-100 p-2 text-amber-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total a receber
              </div>
              <div className="text-2xl font-semibold tabular-nums text-amber-700">
                {brl(totalAberto)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {busca.trim()
            ? "Nenhuma pendência encontrada para essa busca."
            : "Nenhum saldo em aberto. Todos os atendimentos cobrados estão quitados."}
        </div>
      ) : (
        <>
          {/* Lista em cards (celular/tablet) */}
          <div className="space-y-2 lg:hidden">
            {filtrados.map((i) => (
              <Card key={i.agendamento_id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{i.paciente_nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {i.procedimento ?? "Atendimento"} · {dataBR(i.inicio)}
                        {i.medico_nome ? ` · ${i.medico_nome}` : ""}
                      </div>
                    </div>
                    <Badge className="shrink-0 border-amber-300 bg-amber-100 text-amber-800">
                      Falta {brl(i.saldo)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    Total {brl(i.valor_cobranca)} · Já pago {brl(i.valor_pago)} · Último pagamento{" "}
                    {dataBR(i.ultimo_pagamento)}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!podeEscrever}
                    onClick={() => abrirRecebimento(i)}
                  >
                    Receber saldo
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabela (desktop) */}
          <div className="hidden overflow-x-auto rounded-lg border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Atendimento</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Já pago</TableHead>
                  <TableHead className="text-right">Falta</TableHead>
                  <TableHead>Último pgto.</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((i) => (
                  <TableRow key={i.agendamento_id}>
                    <TableCell className="font-medium">{i.paciente_nome}</TableCell>
                    <TableCell className="text-sm">
                      {i.procedimento ?? "Atendimento"}
                      <span className="block text-xs text-muted-foreground">
                        {dataBR(i.inicio)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {i.medico_nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {brl(i.valor_cobranca)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{brl(i.valor_pago)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-amber-700">
                      {brl(i.saldo)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dataBR(i.ultimo_pagamento)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={!podeEscrever}
                        onClick={() => abrirRecebimento(i)}
                      >
                        Receber saldo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Recebimento do saldo. Sem `onSavedWithData` de propósito: assim o
          próprio diálogo imprime o recibo do lançamento, como nas demais
          telas do Financeiro. */}
      <LancamentoDialog
        open={alvo !== null}
        onOpenChange={(v) => {
          if (!v) setAlvo(null);
        }}
        tipo="receita"
        agendamentoId={alvo?.agendamento_id ?? null}
        initialDescricao={
          alvo ? `${alvo.paciente_nome} — ${alvo.procedimento ?? "Atendimento"} — SALDO` : ""
        }
        initialValor={alvo ? alvo.saldo.toFixed(2) : ""}
        resumoSaldo={
          alvo
            ? {
                titulo: "Saldo devedor deste atendimento",
                total: alvo.valor_cobranca,
                pago: alvo.valor_pago,
                restante: alvo.saldo,
              }
            : null
        }
        onSaved={() => {
          setAlvo(null);
          void load();
        }}
      />
    </div>
  );
}
