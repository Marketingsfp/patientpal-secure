import { supabase } from "@/integrations/supabase/client";
import { PERFIS_SISTEMA, type PerfilKey } from "@/lib/permissoes-presets";

/**
 * Perfil de acesso criado pela clínica (ex.: CARTÃO BENEFÍCIOS), além dos
 * perfis de sistema.
 *
 * O perfil da pessoa no banco (`clinica_memberships.role`) é uma lista fechada
 * lida por várias políticas RLS. Por isso o customizado sempre tem um PERFIL
 * BASE de sistema: as telas seguem a matriz do customizado, e onde o sistema
 * pergunta o nome do perfil a pessoa conta como o perfil base. Quem grava
 * role = perfil_base é o trigger `trg_membership_perfil_customizado`
 * (migration 20261014180000_perfis_acesso_customizados.sql).
 */
export type PerfilCustomizado = {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  perfilBase: PerfilKey;
};

/** Bases permitidas: qualquer perfil de sistema menos ADMIN (que ignora a matriz). */
export const BASES_PERMITIDAS = PERFIS_SISTEMA.filter((p) => p.value !== "admin");

/**
 * Valor usado nas listas suspensas de perfil, que misturam perfis de sistema
 * (valor = chave, ex. "recepcao") e customizados (valor = "custom:<id>").
 */
const PREFIXO = "custom:";
export const valorDoCustomizado = (id: string) => `${PREFIXO}${id}`;
export const idDoCustomizado = (valor: string): string | null =>
  valor.startsWith(PREFIXO) ? valor.slice(PREFIXO.length) : null;

/**
 * Converte o valor escolhido na lista suspensa no que vai para o servidor.
 * Customizado: `role` é o perfil base (o servidor e o banco refazem isso) e
 * `perfilAcessoId` é o id. Perfil de sistema: só o `role`.
 */
export function perfilParaGravar(
  valor: string,
  perfis: ReadonlyArray<PerfilCustomizado>,
): { role: PerfilKey; perfilAcessoId: string | null } {
  const id = idDoCustomizado(valor);
  if (!id) return { role: valor as PerfilKey, perfilAcessoId: null };
  const perfil = perfis.find((p) => p.id === id);
  if (!perfil) throw new Error("Perfil de acesso não encontrado. Recarregue a tela.");
  return { role: perfil.perfilBase, perfilAcessoId: perfil.id };
}

/** "Cartão Benefícios" → "cartao_beneficios" (mesma regra do CHECK no banco). */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, 40);
}

const CHAVES_SISTEMA = new Set<string>(PERFIS_SISTEMA.map((p) => p.value));

/** Mensagem de erro da chave, ou null se ela é válida. */
export function erroDaChave(chave: string): string | null {
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(chave))
    return "Use só letras minúsculas sem acento, números e _ (de 2 a 40 caracteres, começando por letra).";
  if (CHAVES_SISTEMA.has(chave)) return "Essa chave já é de um perfil do sistema.";
  return null;
}

/**
 * Perfis customizados da clínica.
 *
 * Usa `select("*")` de propósito: antes da migration ser aplicada a coluna
 * `perfil_base` não existe, e pedir por ela pelo nome derrubaria a consulta —
 * assim a lista só volta vazia e as telas seguem como antes.
 */
export async function carregarPerfisCustomizados(clinicaId: string): Promise<PerfilCustomizado[]> {
  const { data, error } = await supabase
    .from("perfis_acesso")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("sistema", false)
    .order("nome");
  if (error) throw error;
  return (data ?? [])
    .filter((p) => p.perfil_base)
    .map((p) => ({
      id: p.id,
      chave: p.chave,
      nome: p.nome,
      descricao: p.descricao,
      perfilBase: p.perfil_base as PerfilKey,
    }));
}
