import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { franciscoConfigSchema } from "./config";
import { acaoTesteFranciscoSchema } from "./homologacao";

const clinica = z.object({ clinicaId: z.string().uuid() });
const sessao = clinica.extend({ sessaoId: z.string().uuid() });
async function dependencias(
  context: Parameters<typeof import("./service.server").autorizarFrancisco>[0],
  clinicaId: string,
  editar = false,
) {
  const [srv, chat, { supabaseAdmin }] = await Promise.all([
    import("./service.server"),
    import("./homologacao.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  await srv.autorizarFrancisco(context, clinicaId, editar);
  return { srv, chat, db: supabaseAdmin as import("@supabase/supabase-js").SupabaseClient<any> };
}
export const listarConversasTesteFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    clinica
      .extend({
        cursor: z
          .object({ em: z.string().datetime({ offset: true }), id: z.string().uuid() })
          .optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { chat, db } = await dependencias(context, data.clinicaId);
    return chat.listarTestesFrancisco(db, data.clinicaId, context.userId, data.cursor);
  });
export const carregarConversaTesteFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => sessao.parse(v))
  .handler(async ({ data, context }) => {
    const { chat, db } = await dependencias(context, data.clinicaId);
    return chat.carregarTesteFrancisco(db, data.clinicaId, context.userId, data.sessaoId);
  });
export const iniciarConversaTesteFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    clinica
      .extend({ id: z.string().uuid(), config: franciscoConfigSchema, etapa: z.enum(["d1", "d4"]) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { srv, chat, db } = await dependencias(context, data.clinicaId, true);
    const nome = await db.from("clinicas").select("nome").eq("id", data.clinicaId).single();
    srv.conferirErro(nome.error);
    if (!nome.data?.nome) throw new Error("Clínica sem nome para o template de teste.");
    return chat.iniciarConversaTesteFrancisco(db, data.clinicaId, context.userId, data.id, {
      config: data.config,
      clinicaNome: nome.data.nome,
      etapa: data.etapa,
    });
  });
export const responderConversaTesteFrancisco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    sessao.extend({ id: z.string().uuid(), acao: acaoTesteFranciscoSchema }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { chat, db } = await dependencias(context, data.clinicaId, true);
    const { bloquearLinksRecebidos } = await import("@/lib/atendimento/links-entrada");
    const acao =
      data.acao.tipo === "paciente"
        ? { ...data.acao, texto: bloquearLinksRecebidos(data.acao.texto) }
        : data.acao;
    return chat.agirConversaTesteFrancisco(
      db,
      data.clinicaId,
      context.userId,
      data.id,
      data.sessaoId,
      acao,
    );
  });
