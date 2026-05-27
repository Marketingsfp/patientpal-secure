import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  loadWhatsAppConfig,
  metaFetchPhoneInfo,
  metaSendText,
  metaListTemplates,
  metaCreateTemplate,
  metaDeleteTemplate,
  type WaTemplateComponent,
} from "./whatsapp.server";

async function assertManager(userId: string, clinicaId: string) {
  const { data, error } = await supabaseAdmin.rpc("can_manage_clinica", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores/gestores podem alterar a configuração do WhatsApp");
}

/** Retorna a config sem expor o access_token nem o app_secret (apenas flags). */
export const obterWhatsappConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    let cfg = await loadWhatsAppConfig(data.clinicaId);
    if (!cfg) {
      const { error: upsertError } = await supabaseAdmin
        .from("whatsapp_configs")
        .upsert({ clinica_id: data.clinicaId }, { onConflict: "clinica_id", ignoreDuplicates: true });
      if (upsertError) throw new Error(upsertError.message);
      cfg = await loadWhatsAppConfig(data.clinicaId);
      if (!cfg) throw new Error("Falha ao carregar configuração do WhatsApp");
    }
    return {
      clinica_id: cfg!.clinica_id,
      phone_number_id: cfg!.phone_number_id ?? "",
      waba_id: cfg!.waba_id ?? "",
      display_phone_number: cfg!.display_phone_number ?? "",
      display_name: cfg!.display_name ?? "",
      welcome_message: cfg!.welcome_message ?? "",
      horario_inicio: (cfg!.horario_inicio ?? "08:00").slice(0, 5),
      horario_fim: (cfg!.horario_fim ?? "18:00").slice(0, 5),
      verify_token: cfg!.verify_token,
      ativo: cfg!.ativo,
      has_access_token: Boolean(cfg!.access_token),
      has_app_secret: Boolean(cfg!.app_secret),
      ultimo_teste_em: (cfg as any).ultimo_teste_em ?? null,
      ultimo_teste_ok: (cfg as any).ultimo_teste_ok ?? null,
      ultimo_teste_erro: (cfg as any).ultimo_teste_erro ?? null,
    };
  });

const SalvarSchema = z.object({
  clinicaId: z.string().uuid(),
  phone_number_id: z.string().trim().max(64).optional(),
  waba_id: z.string().trim().max(64).optional(),
  display_name: z.string().trim().max(120).optional(),
  welcome_message: z.string().trim().max(1000).optional(),
  horario_inicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  horario_fim: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  access_token: z.string().trim().max(2000).optional(), // vazio = manter atual
  app_secret: z.string().trim().max(200).optional(),
  ativo: z.boolean().optional(),
});

export const salvarWhatsappConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SalvarSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);

    const patch: Record<string, unknown> = {};
    if (data.phone_number_id !== undefined) patch.phone_number_id = data.phone_number_id || null;
    if (data.waba_id !== undefined) patch.waba_id = data.waba_id || null;
    if (data.display_name !== undefined) patch.display_name = data.display_name || null;
    if (data.welcome_message !== undefined) patch.welcome_message = data.welcome_message || null;
    if (data.horario_inicio) patch.horario_inicio = data.horario_inicio;
    if (data.horario_fim) patch.horario_fim = data.horario_fim;
    if (data.ativo !== undefined) patch.ativo = data.ativo;
    if (data.access_token) patch.access_token = data.access_token; // só sobrescreve se vier valor
    if (data.app_secret) patch.app_secret = data.app_secret;

    const { error } = await supabaseAdmin
      .from("whatsapp_configs")
      .upsert({ clinica_id: data.clinicaId, ...patch }, { onConflict: "clinica_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testarConexaoWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const cfg = await loadWhatsAppConfig(data.clinicaId);
    if (!cfg?.phone_number_id || !cfg?.access_token) {
      throw new Error("Preencha Phone Number ID e Access Token antes de testar.");
    }
    try {
      const info = await metaFetchPhoneInfo(cfg.phone_number_id, cfg.access_token);
      await supabaseAdmin
        .from("whatsapp_configs")
        .update({
          display_phone_number: info.display_phone_number ?? null,
          ultimo_teste_em: new Date().toISOString(),
          ultimo_teste_ok: true,
          ultimo_teste_erro: null,
          ativo: true,
        })
        .eq("clinica_id", data.clinicaId);
      return { ok: true, display_phone_number: info.display_phone_number ?? "", verified_name: info.verified_name ?? "" };
    } catch (e: any) {
      await supabaseAdmin
        .from("whatsapp_configs")
        .update({
          ultimo_teste_em: new Date().toISOString(),
          ultimo_teste_ok: false,
          ultimo_teste_erro: String(e?.message ?? e).slice(0, 500),
        })
        .eq("clinica_id", data.clinicaId);
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

export const enviarMensagemWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        to: z.string().trim().min(8).max(20).regex(/^\+?\d+$/),
        text: z.string().trim().min(1).max(3500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.clinicaId);
    const cfg = await loadWhatsAppConfig(data.clinicaId);
    if (!cfg?.phone_number_id || !cfg?.access_token) {
      throw new Error("WhatsApp não está configurado para esta clínica.");
    }
    const { wa_message_id } = await metaSendText(
      cfg.phone_number_id,
      cfg.access_token,
      data.to,
      data.text,
    );
    await supabaseAdmin.from("whatsapp_mensagens").insert({
      clinica_id: data.clinicaId,
      wa_message_id,
      direction: "out",
      from_number: cfg.display_phone_number,
      to_number: data.to,
      body: data.text,
      tipo: "text",
      status: "sent",
      enviada_por: "humano",
    });
    return { ok: true, wa_message_id };
  });