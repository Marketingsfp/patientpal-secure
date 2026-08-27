import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  buscarVinculosAtivosDoPaciente,
  type VinculoAtivoDoPaciente,
} from "@/lib/contrato-dependentes";

/**
 * Faixa de aviso mostrada assim que a recepção escolhe, como dependente, um
 * paciente que já está em outro cartão ativo.
 *
 * As telas que incluem dependente num contrato JÁ EXISTENTE usam a pergunta de
 * confirmação (`perguntarVinculoDuplicado`), porque ali dá para interromper a
 * gravação. Na venda do cartão não dá: os dependentes são inseridos depois que
 * o contrato já foi criado, e travar no meio deixaria um contrato pela metade.
 * Aqui o aviso aparece antes, na hora da escolha, enquanto ainda é fácil
 * trocar o paciente ou tirar a linha.
 */
export function AvisoVinculoDuplicado({
  pacienteId,
  pacienteNome,
  clinicaId,
}: {
  pacienteId: string | null | undefined;
  pacienteNome: string | null | undefined;
  clinicaId: string | null | undefined;
}) {
  const [vinculos, setVinculos] = useState<VinculoAtivoDoPaciente[]>([]);

  useEffect(() => {
    if (!pacienteId || !clinicaId) {
      setVinculos([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      try {
        const achados = await buscarVinculosAtivosDoPaciente({ pacienteId, clinicaId });
        if (!cancelado) setVinculos(achados);
      } catch {
        // Aviso é informativo: falha de rede não pode travar a venda.
        if (!cancelado) setVinculos([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pacienteId, clinicaId]);

  if (vinculos.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="flex items-start gap-1 font-medium">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{pacienteNome || "Este paciente"} já está em outro cartão ativo:</span>
      </p>
      <ul className="mt-1 space-y-0.5 pl-5">
        {vinculos.map((v) => (
          <li key={v.contratoId}>
            {v.numero != null ? `Cartão ${v.numero}` : "Cartão"}
            {v.convenioNome ? ` — ${v.convenioNome}` : ""}
            {v.vinculo === "titular"
              ? " (é o titular)"
              : ` (dependente de ${v.titularNome.toUpperCase()})`}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        Se ele está mudando de cartão, remova o vínculo antigo depois — ficar ativo nos dois faz o
        sistema escolher um deles para decidir preço e mensalidade vencida.
      </p>
    </div>
  );
}
