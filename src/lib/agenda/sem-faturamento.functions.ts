import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabasePublicEnv } from "@/integrations/supabase/env";
import { ROLES_AUTORIZAM_SEM_FATURAMENTO } from "./sem-faturamento-alcada";

/**
 * Autorização da supervisão para "sem faturamento", feita NO SERVIDOR.
 *
 * O primeiro desenho reaproveitava o diálogo de senha do desconto, que pede
 * e-mail + senha e faz um login temporário dentro do navegador da
 * recepcionista, trocando a sessão dela e restaurando depois. No balcão isso
 * mostrou dois problemas: digitar o e-mail inteiro do supervisor a cada
 * autorização segura a fila, e a troca de sessão é frágil justamente no
 * momento em que o paciente está esperando.
 *
 * Aqui a funcionária só escolhe o nome numa lista e digita a senha. A
 * conferência acontece no servidor, num cliente Supabase descartável — a
 * sessão de quem está operando a tela nunca é tocada, e o e-mail do supervisor
 * nunca chega ao navegador.
 *
 * SOBRE FORÇA BRUTA: quem tentar adivinhar a senha esbarra no limite de
 * tentativas de login do próprio Supabase Auth. Como estas conferências saem
 * do servidor da aplicação, e não do computador da recepção, elas dividem esse
 * limite entre si — o que é seguro no volume real desta clínica (poucas
 * isenções por dia). Se um dia isso virar rotina de minuto a minuto, o certo é
 * criar um contador de tentativas por usuário antes de afrouxar qualquer coisa
 * aqui.
 */

/** Confere se quem chamou pertence de fato à clínica informada. */
async function assertMembroAtivo(
  supabase: { from: (t: string) => any },
  userId: string,
  clinicaId: string,
) {
  const { data } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("user_id", userId)
    .eq("ativo", true)
    .maybeSingle();
  if (!data) throw new Error("Você não tem acesso a esta clínica.");
}

export type Autorizador = { id: string; nome: string; role: string };

/**
 * Lista os nomes que podem autorizar a isenção, para o seletor do modal.
 *
 * Devolve APENAS id, nome e papel. O e-mail fica no servidor de propósito:
 * ele não é necessário para escolher o nome e, publicado na tela, viraria uma
 * lista pronta de alvos para quem quisesse tentar senhas.
 */
export const listarAutorizadoresSemFaturamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Autorizador[]> => {
    await assertMembroAtivo(context.supabase, context.userId, data.clinicaId);

    // A leitura sai pelo cliente admin porque o RLS de `profiles` não
    // necessariamente deixa a recepção ler o nome dos colegas — e aqui ela
    // precisa ver a lista para escolher quem vai digitar a senha.
    const { data: mems } = await supabaseAdmin
      .from("clinica_memberships")
      .select("user_id, role")
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true)
      .in("role", [...ROLES_AUTORIZAM_SEM_FATURAMENTO]);
    const ids = (mems ?? []).map((m: { user_id: string }) => m.user_id);
    if (ids.length === 0) return [];

    const { data: profs } = await supabaseAdmin.from("profiles").select("id, nome").in("id", ids);
    const nomePorId = new Map(
      ((profs ?? []) as Array<{ id: string; nome: string | null }>).map((p) => [p.id, p.nome]),
    );

    return (
      (mems ?? [])
        .map((m: { user_id: string; role: string }) => ({
          id: m.user_id,
          nome: (nomePorId.get(m.user_id) ?? "").trim(),
          role: m.role,
        }))
        // Sem nome no cadastro não dá para escolher na lista com segurança:
        // duas linhas "(sem nome)" seriam indistinguíveis no balcão.
        .filter((a: Autorizador) => a.nome.length > 0)
        .sort((a: Autorizador, b: Autorizador) => a.nome.localeCompare(b.nome, "pt-BR"))
    );
  });

export type ResultadoAutorizacao =
  | { ok: true; supervisorId: string; nome: string }
  | { ok: false; message: string };

/**
 * Confere a senha do supervisor escolhido e devolve o nome de quem autorizou.
 *
 * Não grava nada: quem grava a marcação continua sendo a tela, com a sessão da
 * própria funcionária, de modo que o banco registra corretamente quem operou —
 * e o gatilho do banco confere, por conta própria, se o autorizador informado
 * tem mesmo alçada.
 */
export const autorizarSemFaturamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        supervisorId: z.string().uuid(),
        senha: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ResultadoAutorizacao> => {
    await assertMembroAtivo(context.supabase, context.userId, data.clinicaId);

    const { data: mem } = await supabaseAdmin
      .from("clinica_memberships")
      .select("role")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", data.supervisorId)
      .eq("ativo", true)
      .maybeSingle();
    const role = (mem as { role?: string } | null)?.role ?? null;
    if (!role || !(ROLES_AUTORIZAM_SEM_FATURAMENTO as readonly string[]).includes(role)) {
      return {
        ok: false,
        message: "Esta pessoa não tem permissão para autorizar isenções nesta clínica.",
      };
    }

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.supervisorId);
    const email = u?.user?.email ?? null;
    if (!email) {
      return { ok: false, message: "Cadastro do supervisor sem e-mail de acesso." };
    }

    // Cliente descartável, com a chave pública: valida a senha sem encostar na
    // sessão de ninguém. `persistSession: false` garante que a sessão criada
    // pela conferência morre junto com esta requisição.
    const { url, publishableKey } = requireSupabasePublicEnv();
    const temp = createClient(url, publishableKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: login, error } = await temp.auth.signInWithPassword({
      email,
      password: data.senha,
    });
    if (error || login?.user?.id !== data.supervisorId) {
      try {
        // `scope: "local"` é obrigatório: o padrão derruba TODAS as sessões do
        // supervisor, o que o deslogaria do próprio computador dele.
        await temp.auth.signOut({ scope: "local" });
      } catch (_) {
        /* nada a fazer: a sessão temporária expira sozinha */
      }
      return { ok: false, message: "Senha incorreta." };
    }
    try {
      await temp.auth.signOut({ scope: "local" });
    } catch (_) {
      /* idem */
    }

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("nome")
      .eq("id", data.supervisorId)
      .maybeSingle();
    const nome = ((prof as { nome?: string } | null)?.nome ?? "").trim() || email;
    return { ok: true, supervisorId: data.supervisorId, nome };
  });
