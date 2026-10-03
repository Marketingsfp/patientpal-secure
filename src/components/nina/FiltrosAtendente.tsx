import { Button } from "@/components/ui/button";
import { OPCOES_FILTRO_ATENDENTE, type FiltroAtendente } from "@/lib/atendimento/filtros-atendente";

export function FiltrosAtendente({
  valor,
  contagens,
  onChange,
}: {
  valor: FiltroAtendente;
  contagens: Record<FiltroAtendente, number>;
  onChange: (valor: FiltroAtendente) => void;
}) {
  return (
    <div role="group" aria-label="Filtrar conversas" className="grid grid-cols-3 gap-1 pt-1.5">
      {OPCOES_FILTRO_ATENDENTE.map((opcao) => {
        const quantidade = contagens[opcao.valor];
        const descricao = `${opcao.rotulo}: ${quantidade} ${quantidade === 1 ? "conversa" : "conversas"}`;
        return (
          <Button
            key={opcao.valor}
            type="button"
            variant={valor === opcao.valor ? "default" : "outline"}
            aria-pressed={valor === opcao.valor}
            aria-label={descricao}
            title={descricao}
            className="h-8 min-w-0 gap-1.5 px-1 text-xs"
            onClick={() => onChange(opcao.valor)}
          >
            {opcao.rotulo}
            <span aria-hidden="true" className="text-xs font-semibold leading-none tabular-nums">
              {quantidade.toLocaleString("pt-BR")}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
