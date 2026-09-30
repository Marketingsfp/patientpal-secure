import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Link de visualização (vida curta) da imagem ou do áudio de uma mensagem.
 *
 * O arquivo fica num bucket privado: quem pode ver é quem pode abrir a conversa (mesma regra do
 * chat), nada mais. Só leitura: não altera mensagem, conversa nem responsável.
 */
export const urlMidiaMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), mensagemId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: membro, error: erroMembro } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (erroMembro) throw new Error(erroMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    // Leitura pelo cliente do usuário: a política de acesso do banco também vale aqui.
    const { data: msg, error } = await context.supabase
      .from("whatsapp_mensagens")
      .select("id, conversa_id, media_url, media_mime")
      .eq("id", data.mensagemId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg?.conversa_id) return { url: null, mime: null };

    const { assertAcessoConversa } = await import("./acesso-conversa.server");
    await assertAcessoConversa(context.supabase, context.userId, data.clinicaId, msg.conversa_id);

    const { ehCaminhoGuardado, caminhoEhDaClinica, BUCKET_MIDIA_WHATSAPP, VALIDADE_LINK_MIDIA_S } =
      await import("@/lib/whatsapp-midia-armazenamento");
    const caminho = String(msg.media_url ?? "");
    if (!ehCaminhoGuardado(caminho) || !caminhoEhDaClinica(caminho, data.clinicaId)) {
      return { url: null, mime: null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assinada, error: erroUrl } = await supabaseAdmin.storage
      .from(BUCKET_MIDIA_WHATSAPP)
      .createSignedUrl(caminho, VALIDADE_LINK_MIDIA_S);
    if (erroUrl || !assinada?.signedUrl) return { url: null, mime: null };
    return { url: assinada.signedUrl, mime: msg.media_mime ?? null };
  });
