import { Button } from "@/components/ui/button";

type EmptyInfo = {
  motivo: "sem_slots" | "filtros_escondem" | "so_futuro";
  proximaData: string | null;
} | null;

function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type Props = {
  apenasData: boolean;
  dataRef: string;
  info: EmptyInfo;
  onIrProxima: (data: string) => void;
  onDesmarcarApenas: () => void;
  onLimparFiltros: () => void;
};

/**
 * Estado vazio da Agenda com diagnóstico:
 * distingue "sem horários cadastrados no dia", "filtros escondendo" e
 * "só há agenda em datas futuras", oferecendo ação correspondente.
 */
export function AgendaEmptyState({
  apenasData,
  dataRef,
  info,
  onIrProxima,
  onDesmarcarApenas,
  onLimparFiltros,
}: Props) {
  // Sem contexto de "apenas a data": mensagem genérica (compatível com padrão anterior)
  if (!apenasData || !info) {
    return (
      <div className="text-sm text-muted-foreground">
        Nenhum agendamento encontrado.
      </div>
    );
  }

  const dataFmt = formatBR(dataRef);

  if (info.motivo === "filtros_escondem") {
    return (
      <div className="space-y-2 text-sm">
        <div className="text-foreground">
          Existem horários em <strong>{dataFmt}</strong>, mas os filtros atuais
          estão escondendo os resultados.
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onLimparFiltros}>
            Limpar filtros
          </Button>
        </div>
      </div>
    );
  }

  if (info.motivo === "so_futuro" && info.proximaData) {
    return (
      <div className="space-y-2 text-sm">
        <div className="text-foreground">
          Não há horários cadastrados para <strong>{dataFmt}</strong> com esses
          filtros.
        </div>
        <div className="text-muted-foreground">
          Próximo dia com agenda: <strong>{formatBR(info.proximaData)}</strong>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" onClick={() => onIrProxima(info.proximaData!)}>
            Ir para {formatBR(info.proximaData)}
          </Button>
          <Button size="sm" variant="outline" onClick={onDesmarcarApenas}>
            Ver a partir desta data
          </Button>
        </div>
      </div>
    );
  }

  // sem_slots
  return (
    <div className="space-y-2 text-sm">
      <div className="text-foreground">
        Não há horários cadastrados para <strong>{dataFmt}</strong>.
      </div>
      <div className="text-muted-foreground">
        Verifique se a grade do profissional foi gerada para esta data.
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button size="sm" variant="outline" onClick={onDesmarcarApenas}>
          Ver a partir desta data
        </Button>
      </div>
    </div>
  );
}