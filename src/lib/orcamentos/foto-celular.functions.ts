/**
 * Foto do pedido médico tirada com o celular (sem login no celular).
 *
 * O computador da recepção abre uma sessão em `orcamento_foto_sessoes` e mostra um QR code
 * com o código dela. O celular abre /p/pedido/<código>, tira a foto e chama estas funções. O
 * servidor confere o código, a validade (10 min) e o limite de tentativas, lê o pedido e grava
 * só o resultado da leitura na sessão — a foto não é guardada. O computador busca o resultado
 * e apaga a sessão.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DATA_URL_PEDIDO, lerPedidoMedicoNaIA } from "./ler-pedido-medico.server";
import { MAX_TENTATIVAS_FOTO, TOKEN_FOTO } from "./foto-celular";

// A tabela é nova e ainda não está nos tipos gerados.
const sessoes = () => (supabaseAdmin as unknown as SupabaseClient).from("orcamento_foto_sessoes");

type Sessao = { id: string; estado: string; tentativas: number; expira_em: string };

async function sessaoValida(token: string): Promise<Sessao | null> {
  const { data } = await sessoes()
    .select("id, estado, tentativas, expira_em")
    .eq("token", token)
    .maybeSingle();
  const s = data as Sessao | null;
  return s && new Date(s.expira_em).getTime() > Date.now() ? s : null;
}

export type SituacaoFotoCelular = "aguardando" | "enviado" | "expirado";

/** O celular confere o QR antes de abrir a câmera. */
export const consultarFotoCelular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().regex(TOKEN_FOTO) }).parse(i))
  .handler(async ({ data }): Promise<SituacaoFotoCelular> => {
    const s = await sessaoValida(data.token);
    if (!s || s.tentativas >= MAX_TENTATIVAS_FOTO) return "expirado";
    return s.estado === "pronto" ? "enviado" : "aguardando";
  });

export type RespostaFotoCelular =
  | { ok: true }
  | {
      ok: false;
      motivo:
        | "expirado"
        | "ja_enviado"
        | "ocupado"
        | "receita_remedio"
        | "outro"
        | "ilegivel"
        | "falha_tecnica";
    };

/** O celular manda a foto; o pedido lido fica esperando o computador. */
export const enviarFotoCelular = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token: z.string().regex(TOKEN_FOTO),
        arquivo: z.string().min(50).max(12_000_000).regex(DATA_URL_PEDIDO),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<RespostaFotoCelular> => {
    // Limpeza oportunista: sessões vencidas que o computador não chegou a apagar.
    await sessoes()
      .delete()
      .lt("expira_em", new Date(Date.now() - 60 * 60_000).toISOString());

    const s = await sessaoValida(data.token);
    if (!s || s.tentativas >= MAX_TENTATIVAS_FOTO) return { ok: false, motivo: "expirado" };
    if (s.estado === "pronto") return { ok: false, motivo: "ja_enviado" };
    // Uma leitura por vez: só quem conta a tentativa seguinte segue para a IA.
    const { data: reservada } = await sessoes()
      .update({ estado: "lendo", tentativas: s.tentativas + 1 })
      .eq("id", s.id)
      .eq("tentativas", s.tentativas)
      .neq("estado", "pronto")
      .select("id")
      .maybeSingle();
    if (!reservada) return { ok: false, motivo: "ocupado" };

    const r = await lerPedidoMedicoNaIA(data.arquivo);
    const lido = r.leitura.tipo === "pedido_medico" || r.leitura.tipo === "marcacao_incerta";
    await sessoes()
      .update(lido ? { estado: "pronto", resultado: r } : { estado: "aguardando" })
      .eq("id", s.id);
    return lido ? { ok: true } : { ok: false, motivo: r.leitura.tipo as "ilegivel" };
  });
