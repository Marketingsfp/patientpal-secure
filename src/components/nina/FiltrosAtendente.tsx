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
    <div
      role="group"
      aria-label="Filtrar conversas"
      className="grid grid-cols-[1fr_1.5fr_1fr] gap-1 pt-1.5"
    >
      {OPCOES_FILTRO_ATENDENTE.map((opcao) => {
        const quantidade = contagens[opcao.valor];
        const descricao = `${opcao.rotulo}: ${quantidade} ${quantidade === 1 ? "conversa" : "conversas"}${opcao.valor === "nao_atribuidas" ? ", limite de 10" : ""}`;
        return (
          <Button
            key={opcao.valor}
            type="button"
            variant={valor === opcao.valor ? "default" : "outline"}
            aria-pressed={valor === opcao.valor}
            aria-label={descricao}
            title={descricao}
            className="relative h-9 min-w-0 px-1 text-[11px]"
            onClick={() => onChange(opcao.valor)}
          >
            {opcao.rotulo}
            <span
              aria-hidden="true"
              className="absolute -top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold leading-none text-background tabular-nums ring-2 ring-card"
            >
              {quantidade.toLocaleString("pt-BR")}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
