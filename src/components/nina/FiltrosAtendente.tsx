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
            className="h-auto min-h-12 min-w-0 flex-col gap-1 px-1 py-2 text-xs"
            onClick={() => onChange(opcao.valor)}
          >
            {opcao.rotulo}
            <span aria-hidden="true" className="text-base font-semibold leading-none tabular-nums">
              {quantidade.toLocaleString("pt-BR")}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
