import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { telefoneDoBloqueio } from "./contatos-bloqueados";

/**
 * O webhook pergunta, a cada mensagem recebida, se o número está bloqueado.
 * Falha de leitura não bloqueia ninguém (o atendimento segue normal) e vai
 * para o log sem o número.
 */
export async function contatoBloqueado(clinicaId: string, telefone: string): Promise<boolean> {
  const digitos = telefoneDoBloqueio(telefone);
  if (!digitos) return false;
  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("atend_contatos_bloqueados")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("telefone", digitos)
      .maybeSingle();
    if (error) {
      console.error("[contatos-bloqueados] leitura falhou", error.message);
      return false;
    }
    return Boolean(data);
  } catch (e) {
    console.error("[contatos-bloqueados] leitura falhou", (e as Error)?.message ?? "erro");
    return false;
  }
}
