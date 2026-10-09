import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { configPadraoFrancisco, franciscoConfigSchema } from "./config";
import { conferirEdicaoFrancisco } from "./permissoes";

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
    const acesso = await srv.autorizarFrancisco(context, data.clinicaId, true, data.publicar);
    const anterior = await srv.carregarRegistro(db, data.clinicaId);
    conferirEdicaoFrancisco(
      acesso.acessos,
      anterior?.rascunho ?? configPadraoFrancisco(),
      data.config,
    );
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
    await srv.autorizarFrancisco(
      context,
      data.clinicaId,
      false,
      false,
      data.tipo === "historico" ? "historico" : "acompanhamento",
    );
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
    await srv.autorizarFrancisco(context, data.clinicaId, true, false, "acompanhamento");
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
    await srv.autorizarFrancisco(context, data.clinicaId, false, false, "acompanhamento");
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
    await srv.autorizarFrancisco(
      context,
      data.clinicaId,
      true,
      false,
      data.tipo === "voz" ? "voz" : data.tipo === "templates" ? "mensagens" : "homologacao",
    );
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
      // Usa somente o transporte do modelo. Não consulta prompt, memória ou configuração da Nina.
      const { chamarModeloGemini } = await import("@/lib/nina/adapters/gemini-adapter.server");
      const resultado = await chamarModeloGemini({
        modelo: data.config.modelo,
        temperature: data.config.temperatura,
        messages: [
          { role: "system", content: data.config.systemPrompt },
          {
            role: "user",
            content: `HOMOLOGAÇÃO SEM ENVIO. Não acione ferramentas. Cenário fictício: ${data.texto}`,
          },
        ],
        maxTokens: 600,
        timeoutMs: 30000,
      });
      if (!resultado.ok)
        throw new Error(
          resultado.erro?.replaceAll("Nina", "Francisco") ?? "Falha no modelo do Francisco.",
        );
      texto = resultado.conteudo;
    }
    const log = await db.from("francisco_eventos").insert({
      clinica_id: data.clinicaId,
      ator: context.userId,
      tipo: `homologacao_${data.tipo}`,
      dados: {
        modelo: data.config.modelo,
        temperatura: data.config.temperatura,
        configuracao: data.config,
        cenario: data.texto,
        resultado: texto,
      },
    });
    srv.conferirErro(log.error);
    return { texto, base64, mime };
  });
