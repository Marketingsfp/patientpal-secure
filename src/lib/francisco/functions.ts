import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { franciscoConfigSchema, MODELO_FRANCISCO } from "./config";

const clinica = z.object({ clinicaId: z.string().uuid() });
const cursor = z
  .object({ em: z.string().datetime({ offset: true }), id: z.string().uuid() })
  .optional();
async function dependencias() {
  const [srv, { supabaseAdmin }] = await Promise.all([
    import("./service.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  return { srv, db: supabaseAdmin as import("@supabase/supabase-js").SupabaseClient<any> };
}
export const carregarFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => clinica.parse(v))
  .handler(async ({ data, context }) => {
    const { srv, db } = await dependencias();
    const acesso = await srv.autorizarFrancisco(context, data.clinicaId);
    const registro = await srv.carregarRegistro(db, data.clinicaId);
    return { registro, ...acesso };
  });
export const salvarFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    clinica
      .extend({
        config: franciscoConfigSchema,
        revisao: z.number().int().min(0),
        publicar: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { srv, db } = await dependencias();
    await srv.autorizarFrancisco(context, data.clinicaId, true, data.publicar);
    return srv.salvarRegistro(
      db,
      data.clinicaId,
      context.userId,
      data.revisao,
      data.config,
      data.publicar,
    );
  });
export const listarFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    clinica.extend({ tipo: z.enum(["candidatos", "envios", "historico"]), cursor }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { srv, db } = await dependencias();
    await srv.autorizarFrancisco(context, data.clinicaId);
    if (data.tipo === "candidatos")
      return srv.candidatos(
        db,
        data.clinicaId,
        await srv.carregarRegistro(db, data.clinicaId),
        data.cursor,
      );
    return srv.paginaRegistros(db, data.clinicaId, data.tipo, data.cursor);
  });
export const contatoFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    clinica
      .extend({
        telefone: z.string().min(10).max(30),
        estado: z.enum(["autorizado", "recusado"]),
        evidencia: z.string().trim().min(10).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { srv, db } = await dependencias();
    await srv.autorizarFrancisco(context, data.clinicaId, true);
    return srv.registrarContato(
      db,
      data.clinicaId,
      context.userId,
      data.telefone,
      data.estado,
      data.evidencia,
    );
  });
export const consultarContatoFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => clinica.extend({ telefone: z.string().min(10).max(30) }).parse(v))
  .handler(async ({ data, context }) => {
    const { srv, db } = await dependencias();
    await srv.autorizarFrancisco(context, data.clinicaId);
    const { celularParaEnvio } = await import("@/lib/agenda/confirmacao-whatsapp");
    const telefone = celularParaEnvio(data.telefone);
    if (!telefone) throw new Error("Telefone inválido.");
    const resp = await db
      .from("francisco_contatos")
      .select("telefone,estado,evidencia,updated_at")
      .eq("clinica_id", data.clinicaId)
      .eq("telefone", telefone)
      .maybeSingle();
    srv.conferirErro(resp.error);
    return resp.data as {
      telefone: string;
      estado: string;
      evidencia: string;
      updated_at: string;
    } | null;
  });
export const homologarFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    clinica
      .extend({
        config: franciscoConfigSchema,
        texto: z.string().trim().min(3).max(1000),
        tipo: z.enum(["modelo", "voz", "templates"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { srv, db } = await dependencias();
    await srv.autorizarFrancisco(context, data.clinicaId, true);
    if (data.tipo === "templates") {
      const { validarTemplates } = await import("./transport.server");
      await validarTemplates(data.clinicaId, data.config);
      return {
        texto: "Templates conferidos na Meta. Nenhuma mensagem foi enviada.",
        base64: null,
        mime: null,
      };
    }
    let texto = "",
      base64: string | null = null,
      mime: string | null = null;
    if (data.tipo === "voz") {
      const { sintetizarFala } = await import("@/lib/nina-audio.server");
      const audio = await sintetizarFala(data.texto, undefined, data.config.voz, "mp3");
      if (!audio) throw new Error("Não foi possível gerar a prévia da voz do Francisco.");
      base64 = Buffer.from(audio.bytes).toString("base64");
      mime = audio.mime;
      texto = "Prévia de voz gerada. Nenhum áudio foi enviado ao WhatsApp.";
    } else {
      const { classificarRespostaFrancisco } = await import("./intencao.server");
      const { textoTemplateFrancisco } = await import("./config");
      const decisao = await classificarRespostaFrancisco(
        data.texto,
        data.config,
        textoTemplateFrancisco(data.config, "d1", "Clínica de teste"),
      );
      texto = JSON.stringify(decisao, null, 2);
    }
    const log = await db.from("francisco_eventos").insert({
      clinica_id: data.clinicaId,
      ator: context.userId,
      tipo: `homologacao_${data.tipo}`,
      dados: {
        modelo: MODELO_FRANCISCO,
        temperatura: data.config.temperatura,
        configuracao: data.config,
        cenario: data.texto,
        resultado: texto,
      },
    });
    srv.conferirErro(log.error);
    return { texto, base64, mime };
  });
