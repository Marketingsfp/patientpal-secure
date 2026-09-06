import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2 } from "lucide-react";

export type LinhaPagamento = {
  forma: string;
  valor: string;
  condicao: string;
  observacao: string;
};

export const linhaPagamentoVazia = (): LinhaPagamento => ({
  forma: "",
  valor: "",
  condicao: "",
  observacao: "",
});

/**
 * Blocos de forma de pagamento (forma, valor, quando/condição e observações).
 * Campo em branco continua em branco: não vira R$ 0,00.
 */
export function FormasPagamentoEditor({
  linhas,
  onChange,
  somenteLeitura,
}: {
  linhas: LinhaPagamento[];
  onChange: (l: LinhaPagamento[]) => void;
  somenteLeitura?: boolean;
}) {
  const atualizar = (i: number, patch: Partial<LinhaPagamento>) =>
    onChange(linhas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      {linhas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma forma de pagamento cadastrada.
        </p>
      )}
      {linhas.map((linha, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Forma</Label>
              <Input
                value={linha.forma}
                disabled={somenteLeitura}
                placeholder="Ex.: Dinheiro / PIX"
                onChange={(e) => atualizar(i, { forma: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Valor</Label>
              <CurrencyInput
                value={linha.valor}
                disabled={somenteLeitura}
                placeholder="Não informado"
                onChange={(v) => atualizar(i, { valor: v })}
              />
            </div>
            <div className="space-y-1">
              <Label>Quando / condição</Label>
              <Input
                value={linha.condicao}
                disabled={somenteLeitura}
                placeholder="Ex.: à vista, até 3x sem juros"
                onChange={(e) => atualizar(i, { condicao: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              value={linha.observacao}
              disabled={somenteLeitura}
              rows={2}
              onChange={(e) => atualizar(i, { observacao: e.target.value })}
            />
          </div>
          {!somenteLeitura && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(linhas.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remover
              </Button>
            </div>
          )}
        </div>
      ))}
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...linhas, linhaPagamentoVazia()])}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar forma de pagamento
        </Button>
      )}
    </div>
  );
}
