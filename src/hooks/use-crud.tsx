import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TableName = keyof Database["public"]["Tables"];

interface UseCrudOptions {
  /** Nome amigável em PT-BR para mensagens de toast (ex.: "paciente"). */
  label?: string;
  /** Callback chamado após qualquer mutação bem sucedida. */
  onSuccess?: () => void;
}

/**
 * Hook padrão de CRUD com toasts em PT-BR.
 *
 * Auditoria: a tabela alvo deve ter o trigger `fn_audit_trigger` aplicado
 * (já existe no projeto via migration). Para tabelas sem trigger, use
 * `logAction()` manualmente em pontos críticos via `supabase.rpc("log_action", ...)`.
 */
export function useCrud<T extends TableName>(table: T, options: UseCrudOptions = {}) {
  const { label, onSuccess } = options;
  const what = label ?? String(table);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = () => (supabase as any).from(table as string);

  const insert = useCallback(
    async (
      values:
        Database["public"]["Tables"][T]["Insert"] | Database["public"]["Tables"][T]["Insert"][],
    ) => {
      setLoading(true);
      try {
        const { data, error } = await tbl().insert(values).select();
        if (error) throw error;
        toast.success(`${capitalize(what)} criado(a) com sucesso`);
        onSuccess?.();
        return data;
      } catch (err) {
        toast.error(`Erro ao criar ${what}: ${(err as Error).message}`);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [table, what, onSuccess],
  );

  const update = useCallback(
    async (id: string, values: Database["public"]["Tables"][T]["Update"]) => {
      setLoading(true);
      try {
        const { data, error } = await tbl().update(values).eq("id", id).select();
        if (error) throw error;
        toast.success(`${capitalize(what)} atualizado(a)`);
        onSuccess?.();
        return data;
      } catch (err) {
        toast.error(`Erro ao atualizar ${what}: ${(err as Error).message}`);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [table, what, onSuccess],
  );

  const remove = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const { error } = await tbl().delete().eq("id", id);
        if (error) throw error;
        toast.success(`${capitalize(what)} removido(a)`);
        onSuccess?.();
      } catch (err) {
        toast.error(`Erro ao remover ${what}: ${(err as Error).message}`);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [table, what, onSuccess],
  );

  return { insert, update, remove, loading };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Registra ação manualmente em audit_log (para fluxos sem trigger nativo). */
export async function logAction(params: {
  table_name: string;
  record_id: string;
  action: string;
  clinica_id?: string;
  dados_antes?: unknown;
  dados_depois?: unknown;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("log_action", {
    _table_name: params.table_name,
    _record_id: params.record_id,
    _action: params.action,
    _clinica_id: params.clinica_id ?? null,
    _dados_antes: params.dados_antes ?? null,
    _dados_depois: params.dados_depois ?? null,
  });
}
