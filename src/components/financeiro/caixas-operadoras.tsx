/**
 * "Caixas das operadoras" no Movimento de Caixa: sangrias entregues, sobra em
 * espécie entregue no fechamento e o Calculado de cada sessão, somados por
 * atendente no período — sem abrir a modal "Sessão de caixa" uma a uma.
 *
 * A conta vive em `@/lib/caixa/resumo-operadoras`; aqui se carrega e desenha.
 * É uma leitura à parte: se falhar, o resto da tela segue igual.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, HandCoins, Scale, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl } from "@/lib/financeiro/format";
import { dataClinicaDe, formatDatePura } from "@/lib/date-utils";
import {
  resumoOperadoras,
  type LinhaOperadora,
  type MovOperadora,
  type PorForma,
  type ResumoOperadoras,
  type SessaoOperadora,
} from "@/lib/caixa/resumo-operadoras";

/** `curto` é o título da coluna na tabela dia a dia, para caber sem rolar de lado. */
const FORMAS: Array<{ chave: keyof PorForma; rotulo: string; curto: string }> = [
  { chave: "dinheiro", rotulo: "Dinheiro", curto: "Dinheiro" },
  { chave: "pix", rotulo: "PIX", curto: "PIX" },
  { chave: "credito", rotulo: "Cartão de crédito", curto: "Crédito" },
  { chave: "debito", rotulo: "Cartão de débito", curto: "Débito" },
  { chave: "outros", rotulo: "Outros", curto: "Outros" },
];

/** Um dia a mais de cada lado: `aberto_em` é UTC e o dia certo sai de `dataClinicaDe`. */
function diaDeslocado(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function carregar(
  clinicaId: string,
  de: string,
  ate: string,
  usuario: string,
): Promise<ResumoOperadoras> {
  let q = supabase
    .from("caixa_sessoes")
    .select(
      "id, user_id, user_nome, status, aberto_em, valor_abertura, valor_fechamento_calculado, diferenca",
    )
    .eq("clinica_id", clinicaId)
    .gte("aberto_em", `${diaDeslocado(de, -1)}T00:00:00`)
    .lte("aberto_em", `${diaDeslocado(ate, 1)}T23:59:59`)
    .limit(5000);
  if (usuario !== "todos" && usuario !== "sem") q = q.eq("user_id", usuario);
  const { data: ss, error } = await q;
  if (error) throw error;
  const sessoes = ((ss ?? []) as Array<SessaoOperadora & { aberto_em: string }>)
    .map((s) => ({ ...s, dia: dataClinicaDe(s.aberto_em) ?? "" }))
    .filter((s) => !!s.dia && s.dia >= de && s.dia <= ate);

  const movs: MovOperadora[] = [];
  const LOTE_IDS = 50;
  const PAGINA = 1000;
  for (let i = 0; i < sessoes.length; i += LOTE_IDS) {
    const ids = sessoes.slice(i, i + LOTE_IDS).map((s) => s.id);
    for (let off = 0; ; off += PAGINA) {
      const { data, error: errMv } = await supabase
        .from("caixa_movimentos")
        .select("id, sessao_id, tipo, valor, forma_pagamento")
        .in("sessao_id", ids)
        .in("tipo", ["recebimento", "estorno", "sangria", "suprimento", "despesa"])
        .order("id")
        .range(off, off + PAGINA - 1);
      if (errMv) throw errMv;
      const rows = (data ?? []) as MovOperadora[];
      movs.push(...rows);
      if (rows.length < PAGINA) break;
    }
  }
  return resumoOperadoras(sessoes, movs);
}

function corDiferenca(v: number | null) {
  if (v == null || Math.abs(v) < 0.005) return "";
  return v < 0 ? "text-rose-600" : "text-amber-600";
}

/** Janela ao clicar na operadora: recebido por forma e o caixa dia a dia. */
function DetalheOperadora({
  linha,
  onClose,
}: {
  linha: LinhaOperadora | null;
  onClose: () => void;
}) {
  const totalFormas = linha ? FORMAS.reduce((acc, f) => acc + linha.porForma[f.chave], 0) : 0;
  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex flex-col w-[calc(100vw-2rem)] max-w-400 h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {linha && (
          <>
            <DialogHeader>
              <DialogTitle>{linha.nome}</DialogTitle>
              <DialogDescription>
                Caixa no período · {linha.sessoes} sess{linha.sessoes === 1 ? "ão" : "ões"}. Valores
                recebidos já descontados os estornos.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {FORMAS.map((f) => (
                <div key={f.chave} className="rounded-lg border bg-card p-2.5 min-w-0">
                  <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                    {f.rotulo}
                  </p>
                  <p className="font-semibold tabular-nums">{brl(linha.porForma[f.chave])}</p>
                </div>
              ))}
              <div className="rounded-lg border bg-muted/50 p-2.5 min-w-0">
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Total recebido
                </p>
                <p className="font-bold tabular-nums">{brl(totalFormas)}</p>
              </div>
            </div>

            <Table containerClassName="rounded-lg border">
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  {FORMAS.map((f) => (
                    <TableHead key={f.chave} className="text-right whitespace-nowrap">
                      {f.curto}
                    </TableHead>
                  ))}
                  <TableHead className="text-right whitespace-nowrap">Sangrias entregues</TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    Sobra no fechamento
                  </TableHead>
                  <TableHead className="text-right">Calculado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linha.detalhe.map((d) => (
                  <TableRow key={d.sessaoId}>
                    <TableCell className="whitespace-nowrap">
                      {formatDatePura(d.dia)}
                      {!d.fechada && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-emerald-300 text-emerald-700"
                        >
                          Aberto
                        </Badge>
                      )}
                    </TableCell>
                    {FORMAS.map((f) => (
                      <TableCell key={f.chave} className="text-right tabular-nums">
                        {brl(d.porForma[f.chave])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{brl(d.sangrias)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(d.gaveta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(d.calculado)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${corDiferenca(d.diferenca)}`}>
                      {d.diferenca == null ? "—" : brl(d.diferenca)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  {FORMAS.map((f) => (
                    <TableCell key={f.chave} className="text-right tabular-nums">
                      {brl(linha.porForma[f.chave])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{brl(linha.sangrias)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(linha.gaveta)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(linha.calculado)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${corDiferenca(linha.diferenca)}`}>
                    {linha.diferenca == null ? "—" : brl(linha.diferenca)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CaixasOperadoras({
  clinicaId,
  de,
  ate,
  usuario,
}: {
  clinicaId: string | undefined;
  de: string;
  ate: string;
  /** Filtro "Usuário" da tela: "todos", "sem" ou um user_id. */
  usuario: string;
}) {
  const [resumo, setResumo] = useState<ResumoOperadoras | null>(null);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(true);
  const [detalhe, setDetalhe] = useState<LinhaOperadora | null>(null);

  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    setResumo(null);
    setErro(false);
    carregar(clinicaId, de, ate, usuario)
      .then((r) => !cancelado && setResumo(r))
      .catch(() => !cancelado && setErro(true));
    return () => {
      cancelado = true;
    };
  }, [clinicaId, de, ate, usuario]);

  if (erro) return null;
  const t = resumo?.total;

  const cards = [
    {
      icon: HandCoins,
      label: "Sangrias das operadoras",
      valor: t ? brl(t.sangrias) : "…",
      nota: "Dinheiro retirado das gavetas no período",
      cls: "text-amber-700 dark:text-amber-400",
    },
    {
      icon: Wallet,
      // Soma, sessão a sessão, o que sobrou em espécie ao fechar — não é saldo
      // acumulado nem dinheiro parado com a operadora: cada dia começa do zero.
      label: "Sobra entregue no fechamento",
      valor: t ? brl(t.gaveta) : "…",
      nota: "Dinheiro que ficou em cada gaveta ao fechar o caixa e foi entregue — cada dia começa do zero",
      cls: "text-emerald-700 dark:text-emerald-400",
    },
    {
      icon: Scale,
      label: "Calculado das sessões",
      valor: t ? brl(t.calculado) : "…",
      nota: "Igual à modal: todas as formas (inclui PIX e cartão) − sangrias − estornos",
      cls: "text-slate-700 dark:text-slate-200",
    },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Caixas das operadoras</h2>
            <p className="text-xs text-muted-foreground">
              Sessões de caixa abertas no período
              {t ? ` · ${t.sessoes} sess${t.sessoes === 1 ? "ão" : "ões"}` : ""}
              {t?.emAberto ? " · há caixa ainda aberto (valores em tempo real)" : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAberto((v) => !v)}
            disabled={!resumo || resumo.linhas.length === 0}
          >
            {aberto ? (
              <ChevronUp className="h-4 w-4 mr-1" />
            ) : (
              <ChevronDown className="h-4 w-4 mr-1" />
            )}
            Por operadora
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border bg-card p-3 space-y-1 min-w-0">
              <p className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-muted-foreground">
                <c.icon className="h-3.5 w-3.5 shrink-0" /> {c.label}
              </p>
              <p className={`text-lg font-bold tabular-nums ${c.cls}`}>{c.valor}</p>
              <p className="text-[12px] text-muted-foreground">{c.nota}</p>
            </div>
          ))}
        </div>

        {resumo && resumo.linhas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma sessão de caixa aberta no período.
          </p>
        )}

        {aberto && resumo && resumo.linhas.length > 0 && (
          <Table containerClassName="rounded-lg border">
            <TableHeader>
              <TableRow>
                <TableHead>Operador</TableHead>
                <TableHead className="text-right">Recebido em dinheiro</TableHead>
                <TableHead className="text-right">Sangrias entregues</TableHead>
                <TableHead
                  className="text-right"
                  title="Soma do que ficou em cada gaveta ao fechar o caixa e foi entregue no fechamento. Cada dia começa do zero."
                >
                  Sobra entregue no fechamento
                </TableHead>
                <TableHead className="text-right">Calculado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumo.linhas.map((l) => (
                <TableRow
                  key={l.userId}
                  className="cursor-pointer"
                  title="Clique para ver o caixa dia a dia, por forma de pagamento"
                  onClick={() => setDetalhe(l)}
                >
                  <TableCell className="whitespace-nowrap">
                    <span className="underline decoration-dotted underline-offset-4">{l.nome}</span>
                    {l.sessoes > 1 && (
                      <span className="text-xs text-muted-foreground"> · {l.sessoes} sessões</span>
                    )}
                    {l.emAberto && (
                      <Badge variant="outline" className="ml-2 border-emerald-300 text-emerald-700">
                        Aberto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {brl(l.recebidoDinheiro)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(l.sangrias)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {brl(l.gaveta)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(l.calculado)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${corDiferenca(l.diferenca)}`}>
                    {l.diferenca == null ? "—" : brl(l.diferenca)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {brl(t!.recebidoDinheiro)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{brl(t!.sangrias)}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(t!.gaveta)}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(t!.calculado)}</TableCell>
                <TableCell className={`text-right tabular-nums ${corDiferenca(t!.diferenca)}`}>
                  {t!.diferenca == null ? "—" : brl(t!.diferenca)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
        <DetalheOperadora linha={detalhe} onClose={() => setDetalhe(null)} />
      </CardContent>
    </Card>
  );
}
