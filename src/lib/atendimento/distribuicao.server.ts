import type { EstadoManualPresenca } from "./presenca-manual";
import type { Database } from "@/integrations/supabase/types";
import {
  resultadoDistribuicaoFilaSchema,
  resultadoPresencaDistribuicaoSchema,
} from "./distribuicao-contrato";

type ClienteRpc = {
  rpc: <
    Nome extends
      | "atend_definir_presenca_manual"
      | "atend_distribuir_fila_status"
      | "atend_diagnostico_distribuicao",
  >(
    nome: Nome,
    argumentos: Database["public"]["Functions"][Nome]["Args"],
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** O SQL confirma presença, versão e uma única rodada de distribuição na mesma transação. */
export async function salvarPresencaComDistribuicao(
  db: ClienteRpc,
  args: { clinicaId: string; estado: EstadoManualPresenca; versao?: number; reasonId?: string },
) {
  const { data, error } = await db.rpc("atend_definir_presenca_manual", {
    _clinica_id: args.clinicaId,
    _estado: args.estado,
    // Omitir equivale ao DEFAULT NULL do SQL: sem versão, não há checagem otimista.
    ...(args.versao === undefined ? {} : { _versao: args.versao }),
    ...(args.reasonId ? { _reason_id: args.reasonId } : {}),
  });
  if (error) throw new Error(error.message);
  const resultado = resultadoPresencaDistribuicaoSchema.safeParse(data);
  if (!resultado.success) {
    throw new Error(
      "Não foi possível confirmar a presença. Atualize o controle e tente novamente.",
    );
  }
  return resultado.data;
}

export async function executarDistribuicaoFila(db: ClienteRpc, clinicaId: string) {
  const { data, error } = await db.rpc("atend_distribuir_fila_status", {
    _clinica_id: clinicaId,
    _max: 200,
  });
  if (error) throw new Error(error.message);
  return lerResultadoDistribuicao(data);
}

export async function consultarEstadoDistribuicao(db: ClienteRpc, clinicaId: string) {
  const { data, error } = await db.rpc("atend_diagnostico_distribuicao", {
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  return lerResultadoDistribuicao(data);
}

export function lerResultadoDistribuicao(data: unknown) {
  const resultado = resultadoDistribuicaoFilaSchema.safeParse(data);
  if (!resultado.success) {
    throw new Error("Não foi possível confirmar o resultado da distribuição. Atualize a fila.");
  }
  return resultado.data;
}
