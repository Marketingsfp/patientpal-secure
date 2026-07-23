import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, ArrowRightLeft, History as HistoryIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pagadorLabel, type OrcV2 } from "./orcamento-card";

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Item = {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valores_formas: Record<string, number> | null;
};

function splitFormas(i: Item): { din: number; cart: number } | null {
  const vf = i.valores_formas;
  if (!vf) return null;
  const din = Number(vf["Dinheiro"] ?? 0);
  const cart = Math.max(
    Number(vf["PIX"] ?? 0),
    Number(vf["Cartão de Crédito"] ?? 0),
    Number(vf["Cartão de Débito"] ?? 0),
    Number(vf["Cartão"] ?? 0),
  );
  if (!din && !cart) return null;
  if (din === cart) return null;
  return { din, cart };
}

interface Props {
  orc: OrcV2 | null;
  onClose: () => void;
  onPrint: (id: string) => void;
  onConverter: (id: string) => void;
  onHistorico?: (id: string) => void;
  podeHistorico?: boolean;
}

export function OrcamentoDrawer({ orc, onClose, onPrint, onConverter, onHistorico, podeHistorico }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orc) return;
    let cancel = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("orcamento_itens")
        .select("id, descricao, quantidade, valor_unitario, valores_formas")
        .eq("orcamento_id", orc.id)
        .order("created_at", { ascending: true });
      if (cancel) return;
      setItens((data ?? []) as Item[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [orc]);

  return (
    <Sheet open={!!orc} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {orc && (
          <>
            <SheetHeader>
              <SheetTitle>#ORC-{orc.numero} · {orc.paciente_nome}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{pagadorLabel(orc.forma_pagamento)}</Badge>
                {orc.categoria === "laboratorio" && <Badge variant="secondary">Laboratório</Badge>}
                <Badge variant="secondary">{orc.status}</Badge>
              </div>
              {(() => {
                const splits = itens.map(splitFormas);
                const temSplit = splits.some(Boolean);
                const totalDin = itens.reduce((s, i, idx) => {
                  const sp = splits[idx];
                  return s + Number(i.quantidade) * (sp ? sp.din : Number(i.valor_unitario));
                }, 0);
                const totalCart = itens.reduce((s, i, idx) => {
                  const sp = splits[idx];
                  return s + Number(i.quantidade) * (sp ? sp.cart : Number(i.valor_unitario));
                }, 0);
                return (
                  <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Médico</div>
                  <div>{orc.medico_nome ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Telefone</div>
                  <div>{orc.paciente_telefone ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Criado em</div>
                  <div>{new Date(orc.created_at).toLocaleString("pt-BR")}</div>
                </div>
                {temSplit ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Total Dinheiro</div>
                      <div className="font-semibold">{BRL(totalDin)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Total Cartão/PIX</div>
                      <div className="font-semibold">{BRL(totalCart)}</div>
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="text-xs text-muted-foreground">Valor total</div>
                    <div className="font-semibold">{BRL(Number(orc.valor_total))}</div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Itens</div>
                {loading ? (
                  <div className="text-muted-foreground text-xs">Carregando…</div>
                ) : itens.length === 0 ? (
                  <div className="text-muted-foreground text-xs">Sem itens.</div>
                ) : (
                  <ul className="divide-y border rounded">
                    {itens.map((i, idx) => {
                      const sp = splits[idx];
                      const q = Number(i.quantidade);
                      return (
                        <li key={i.id} className="px-3 py-2">
                          <div className="flex justify-between gap-2">
                            <span className="truncate">{q}× {i.descricao}</span>
                            {!sp && (
                              <span className="tabular-nums">{BRL(q * Number(i.valor_unitario))}</span>
                            )}
                          </div>
                          {sp && (
                            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                              <div className="flex justify-between rounded bg-muted/40 px-2 py-1">
                                <span className="text-muted-foreground">Dinheiro</span>
                                <span className="tabular-nums font-medium">{BRL(q * sp.din)}</span>
                              </div>
                              <div className="flex justify-between rounded bg-muted/40 px-2 py-1">
                                <span className="text-muted-foreground">Cartão/PIX</span>
                                <span className="tabular-nums font-medium">{BRL(q * sp.cart)}</span>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
                  </>
                );
              })()}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" onClick={() => onConverter(orc.id)}>
                  <ArrowRightLeft className="h-4 w-4" /> Converter
                </Button>
                <Button size="sm" variant="outline" onClick={() => onPrint(orc.id)}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                {podeHistorico && onHistorico && (
                  <Button size="sm" variant="ghost" onClick={() => onHistorico(orc.id)}>
                    <HistoryIcon className="h-4 w-4" /> Histórico
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}