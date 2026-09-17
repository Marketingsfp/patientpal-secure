import { Button } from "@/components/ui/button";
import { OPCOES_FILTRO_ATENDENTE, type FiltroAtendente } from "@/lib/atendimento/filtros-atendente";

export function FiltrosAtendente({ valor, onChange }: {
  valor: FiltroAtendente;
  onChange: (valor: FiltroAtendente) => void;
}) {
  return (
    <div role="group" aria-label="Filtrar conversas" className="grid grid-cols-[1fr_1.5fr_1fr] gap-1">
      {OPCOES_FILTRO_ATENDENTE.map((opcao) => (
        <Button
          key={opcao.valor}
          type="button"
          variant={valor === opcao.valor ? "default" : "outline"}
          aria-pressed={valor === opcao.valor}
          className="h-9 min-w-0 px-1 text-[11px]"
          onClick={() => onChange(opcao.valor)}
        >
          {opcao.rotulo}
        </Button>
      ))}
    </div>
  );
}
