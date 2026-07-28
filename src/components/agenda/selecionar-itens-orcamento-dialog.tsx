import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export type SelectItemOrc = {
  id: string;
  descricao: string;
  valor_total: number | null;
  dentes: string[] | null;
  /** Entrada (sinal) definida no item, quando houver. */
  sinal_valor?: number | null;
  /** Quanto já foi pago deste item (entrada e/ou parcelas do saldo). */
  valor_pago?: number | null;
};

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SelecionarItensOrcamentoDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  numero: number;
  pacienteNome: string | null;
  totalItens: number;
  itensRestantes: SelectItemOrc[];
  onConfirm: (idsSelecionados: string[]) => void;
}) {
  const { open, onOpenChange, numero, pacienteNome, totalItens, itensRestantes, onConfirm } = props;
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelecionados(new Set());
  }, [open]);

  const restantes = itensRestantes.length;
  const jaAgendados = Math.max(0, totalItens - restantes);

  const total = useMemo(
    () => itensRestantes
      .filter((i) => selecionados.has(i.id))
      .reduce(
        (s, i) =>
          s + Math.max(0, Number(i.valor_total || 0) - Number(i.valor_pago || 0)),
        0,
      ),
    [itensRestantes, selecionados],
  );

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const marcarTodos = () => setSelecionados(new Set(itensRestantes.map((i) => i.id)));
  const limpar = () => setSelecionados(new Set());

  const confirmar = () => {
    if (selecionados.size === 0) return;
    onConfirm(Array.from(selecionados));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Escolher itens do orçamento #{String(numero).padStart(5, "0")}
          </DialogTitle>
          <DialogDescription>
            Marque quais itens deste orçamento entram neste agendamento. Os demais
            continuam disponíveis para agendar depois — o mesmo orçamento pode ser
            usado várias vezes até esgotar os itens ou expirar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Paciente: <span className="font-medium text-foreground">{pacienteNome ?? "—"}</span>
          </div>
          <div className="text-muted-foreground">
            {jaAgendados > 0
              ? `${jaAgendados} de ${totalItens} já agendados · restam ${restantes}`
              : `${restantes} itens disponíveis`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={marcarTodos}>
            Marcar todos
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={limpar}>
            Limpar
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y">
          {itensRestantes.map((it) => {
            const checked = selecionados.has(it.id);
            return (
              <label
                key={it.id}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                  checked ? "bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(it.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.descricao}</div>
                  {it.dentes && it.dentes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {it.dentes.map((d) => (
                        <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0">
                          Dente {d}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-sm font-semibold whitespace-nowrap">
                  {fmtBRL(Number(it.valor_total || 0))}
                  {Number(it.sinal_valor || 0) > 0 && (
                    <div className="mt-0.5 text-[10px] font-semibold text-primary">
                      Entrada {fmtBRL(Number(it.sinal_valor))}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-sm border-t pt-3">
          <div>
            <span className="text-muted-foreground">Selecionados:</span>{" "}
            <span className="font-medium">{selecionados.size}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total:</span>{" "}
            <span className="font-semibold">{fmtBRL(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={selecionados.size === 0}>
            Usar {selecionados.size > 0 ? `${selecionados.size} ` : ""}
            {selecionados.size === 1 ? "item" : "itens"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}