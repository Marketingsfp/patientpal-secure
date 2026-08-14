import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache global de nomes de pacientes (id -> nome).
const cache = new Map<string, string>();
// Fila de ids ainda não resolvidos e listeners por id.
const pending = new Map<string, Array<(nome: string) => void>>();
let flushHandle: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushHandle) return;
  flushHandle = setTimeout(async () => {
    flushHandle = null;
    const ids = Array.from(pending.keys());
    if (ids.length === 0) return;
    const listeners = new Map(pending);
    pending.clear();
    const { data } = await supabase.from("pacientes").select("id, nome").in("id", ids);
    for (const row of (data ?? []) as Array<{ id: string; nome: string }>) {
      cache.set(row.id, row.nome);
      const ls = listeners.get(row.id);
      if (ls) for (const fn of ls) fn(row.nome);
      listeners.delete(row.id);
    }
    // Ids não encontrados
    for (const [id, ls] of listeners) {
      cache.set(id, "—");
      for (const fn of ls) fn("—");
    }
  }, 40);
}

export function usePacienteNome(id: string | null | undefined): string {
  const [nome, setNome] = useState<string>(() => (id ? (cache.get(id) ?? "") : "—"));
  useEffect(() => {
    if (!id) {
      setNome("—");
      return;
    }
    const cached = cache.get(id);
    if (cached !== undefined) {
      setNome(cached);
      return;
    }
    setNome("…");
    const list = pending.get(id) ?? [];
    list.push(setNome);
    pending.set(id, list);
    scheduleFlush();
  }, [id]);
  return nome;
}

/** Cache write-through — use após selecionar um paciente no autocomplete. */
export function cachePacienteNome(id: string, nome: string) {
  cache.set(id, nome);
}

export function PacienteNomeCell({ id }: { id: string | null | undefined }) {
  const nome = usePacienteNome(id);
  return <>{nome || "—"}</>;
}
