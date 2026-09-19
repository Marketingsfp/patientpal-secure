/**
 * Controle de variedade das simulações: evita repetir pacientes, serviços e
 * perguntas de abertura entre as conversas/ligações da mesma atendente.
 *
 * Antes isso vivia no `localStorage` do aparelho — trocar de computador ou
 * limpar o navegador fazia a IA repetir tudo. Agora fica em
 * `coach_variedade`, por clínica e por usuário.
 */
import { supabase } from "@/integrations/supabase/client";

const LIMITE_LEITURA = 60;
const LIMITE_GRAVACAO = 12;

export type EscopoVariedade = {
  clinicaId: string | null;
  userId: string | null;
  atendente: string;
};

/** Itens (nomes, serviços, aberturas) que a IA não deve repetir. */
export async function itensEvitar(escopo: EscopoVariedade): Promise<string[]> {
  if (!escopo.clinicaId || !escopo.userId) return [];
  const { data } = await supabase
    .from("coach_variedade")
    .select("valor")
    .eq("clinica_id", escopo.clinicaId)
    .eq("user_id", escopo.userId)
    .order("created_at", { ascending: false })
    .limit(LIMITE_LEITURA);
  return (data ?? []).map((r) => r.valor).filter((v): v is string => Boolean(v));
}

/** Registra o que foi usado numa simulação recém-criada. */
export async function registrarUsados(
  escopo: EscopoVariedade,
  itens: (string | undefined | null)[],
  tipo: "nome" | "tema" | "abertura" = "tema",
): Promise<void> {
  if (!escopo.clinicaId || !escopo.userId) return;
  const valores = itens
    .map((i) => (i ?? "").trim())
    .filter((i) => i.length > 1)
    .slice(0, LIMITE_GRAVACAO);
  if (!valores.length) return;
  await supabase.from("coach_variedade").insert(
    valores.map((valor) => ({
      clinica_id: escopo.clinicaId as string,
      user_id: escopo.userId as string,
      atendente: escopo.atendente,
      tipo,
      valor: valor.slice(0, 240),
    })),
  );
}

/** Embaralha uma cópia da lista (Fisher-Yates). */
export function embaralhar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
