import { useId } from "react";
import { Label } from "@/components/ui/label";
import type { EstruturaCatalogo } from "@/lib/nina/catalogo-estrutura";

type PedidoMedico = EstruturaCatalogo["pedido_medico"];

export function rotuloPedidoMedico(valor: unknown): string {
  if (valor === "obrigatorio") return "Obrigatório";
  if (valor === "dispensado") return "Não necessário";
  return "Não informado";
}

/** Campo comum aos dois catálogos; ausência nunca significa dispensa. */
export function PedidoMedicoEditor({
  valor,
  onChange,
  somenteLeitura,
}: {
  valor: PedidoMedico;
  onChange: (valor: PedidoMedico) => void;
  somenteLeitura?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Precisa de pedido médico?</Label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        value={valor}
        disabled={somenteLeitura}
        aria-describedby={`${id}-ajuda`}
        onChange={(e) => onChange(e.target.value as PedidoMedico)}
      >
        <option value="nao_informado">Não informado</option>
        <option value="obrigatorio">Sim, pedido médico obrigatório</option>
        <option value="dispensado">Não, pedido médico não necessário</option>
      </select>
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        Preencha conforme a regra confirmada pela clínica para este cadastro. Sem confirmação,
        mantenha “Não informado”.
      </p>
    </div>
  );
}
