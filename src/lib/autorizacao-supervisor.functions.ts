import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabasePublicEnv } from "@/integrations/supabase/env";
import type { Database } from "@/integrations/supabase/types";
import {
  ESCOPOS_AUTORIZACAO,
  podeAutorizar,
  rolesDoEscopo,
  type EscopoAutorizacao,
} from "./autorizacao-supervisor";

/**
 * Autorização da supervisão feita NO SERVIDOR — desconto, cortesia e isenção
 * de cobrança usam este mesmo caminho.
 *
 * O desenho anterior pedia e-mail + senha e fazia o login do supervisor dentro
 * do navegador de quem estava no balcão, trocando a sessão e restaurando
 * depois. Isso trazia três problemas, todos resolvidos aqui:
 *
 *   1. digitar o e-mail inteiro a cada autorização segurava a fila;
 *   2. uma oscilação de rede no meio da troca de sessão podia deslogar a
 *      funcionária com o paciente na frente;
 *   3. para escolher o nome, a tela precisaria receber os e-mails da equipe —
 *      uma relação pronta de alvos para tentativa de senha.
 *
 * Agora a tela manda o id da pessoa escolhida e a senha; o e-mail é resolvido
 * aqui dentro e a conferência acontece num cliente Supabase descartável.
 *
 * SOBRE FORÇA BRUTA: quem tentar adivinhar a senha esbarra no limite de
 * tentativas de login do próprio Supabase Auth. Como estas conferências saem
 * do servidor da aplicação, e não do computador da recepção, dividem esse
 * limite entre si — seguro no volume real desta clínica (poucas autorizações
 * por dia). Se um dia isso virar rotina de minuto a minuto, o certo é criar um
 * contador de tentativas por usuário antes de afrouxar qualquer coisa aqui.
 */

const escopoSchema = z.enum(
  Object.keys(ESCOPOS_AUTORIZACAO) as [EscopoAutorizacao, ...EscopoAutorizacao[]],
);

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
 * Lista os nomes que podem autorizar a ação, para o seletor do modal.
 *
 * Devolve APENAS id, nome e papel — nunca o e-mail, que não é necessário para
 * escolher um nome numa lista.
 */
export const listarAutorizadores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), escopo: escopoSchema }).parse(input),
  )
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
      // Só quem tem a permissão individual de autorizar. Sem este filtro a
      // lista traria as 30 pessoas com perfil de administrador, que é
      // exatamente o controle que a diretoria quis apertar.
      .eq("pode_autorizar", true)
      // O cast só reconcilia o tipo: a tabela de escopos é escrita à mão com
      // os mesmos valores do enum `app_role` do banco.
      .in("role", [...rolesDoEscopo(data.escopo)] as Database["public"]["Enums"]["app_role"][]);
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
  | { ok: true; supervisorId: string; nome: string; role: string }
  | { ok: false; message: string };

/**
 * Confere a senha da pessoa escolhida e devolve o nome de quem autorizou.
 *
 * Não grava nada: quem grava continua sendo a tela, com a sessão da própria
 * funcionária, de modo que o registro mostre corretamente quem operou.
 */
export const autorizarComSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        escopo: escopoSchema,
        supervisorId: z.string().uuid(),
        senha: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ResultadoAutorizacao> => {
    await assertMembroAtivo(context.supabase, context.userId, data.clinicaId);

    const { data: mem } = await supabaseAdmin
      .from("clinica_memberships")
      .select("role, pode_autorizar")
      .eq("clinica_id", data.clinicaId)
      .eq("user_id", data.supervisorId)
      .eq("ativo", true)
      .maybeSingle();
    const vinculo = mem as { role?: string; pode_autorizar?: boolean } | null;
    const role = vinculo?.role ?? null;
    // A mesma regra da tela, conferida de novo aqui: a lista de nomes vem do
    // servidor, mas nada impede alguém de mandar outro id na chamada.
    if (!podeAutorizar(data.escopo, role, vinculo?.pode_autorizar)) {
      return {
        ok: false,
        message: "Esta pessoa não tem permissão para autorizar esta ação nesta clínica.",
      };
    }

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.supervisorId);
    const email = u?.user?.email ?? null;
    if (!email) {
      return { ok: false, message: "Cadastro sem e-mail de acesso." };
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
    const encerrarSessaoTemporaria = async () => {
      try {
        // `scope: "local"` é obrigatório: o padrão derruba TODAS as sessões da
        // pessoa, o que a deslogaria do próprio computador dela.
        await temp.auth.signOut({ scope: "local" });
      } catch (_) {
        /* nada a fazer: a sessão temporária expira sozinha */
      }
    };
    if (error || login?.user?.id !== data.supervisorId) {
      await encerrarSessaoTemporaria();
      return { ok: false, message: "Senha incorreta." };
    }
    await encerrarSessaoTemporaria();

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("nome")
      .eq("id", data.supervisorId)
      .maybeSingle();
    const nome = ((prof as { nome?: string } | null)?.nome ?? "").trim() || email;
    // `role` já passou por `podeAutorizar` acima, então não é nulo aqui.
    return { ok: true, supervisorId: data.supervisorId, nome, role: role ?? "" };
  });
