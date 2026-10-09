import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { carregarAcessosOsZap } from "@/lib/permissoes-oszap.server";
import { acessosFrancisco } from "./permissoes";
import type { AbaFrancisco } from "./config";
import { celularParaEnvio } from "@/lib/agenda/confirmacao-whatsapp";
import { configPadraoFrancisco, franciscoConfigSchema, type FranciscoConfig } from "./config";

export type CursorFrancisco = { em: string; id: string };
export type CandidatoFrancisco = {
  orcamento_id: string;
  numero: number;
  telefone: string;
  created_at: string;
  etapa: "d1" | "d4";
  motivo: string;
};
export type ConfigRegistro = {
  clinica_id: string;
  rascunho: FranciscoConfig;
  publicado: FranciscoConfig | null;
  revisao: number;
  inicio_campanha: string | null;
  cursor_job: CursorFrancisco | null;
};
export const envioRealLiberado = () => process.env.FRANCISCO_ENVIO_REAL === "true";
// Novas tabelas ainda não constam no types.ts gerado do banco; isoladas no servidor.
type Db = SupabaseClient<any>;
export function conferirErro(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? ""))
    throw new Error("Francisco aguarda a migração do banco. Os envios permanecem desativados.");
  throw new Error(error.message ?? "Não foi possível concluir a operação do Francisco.");
}
export async function carregarRegistro(db: Db, clinicaId: string): Promise<ConfigRegistro | null> {
  const { data, error } = await db
    .from("francisco_config")
    .select("*")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  conferirErro(error);
  if (!data) return null;
  return {
    ...data,
    rascunho: franciscoConfigSchema.parse(data.rascunho),
    publicado: data.publicado ? franciscoConfigSchema.parse(data.publicado) : null,
  };
}
export async function candidatos(
  db: Db,
  clinicaId: string,
  registro: ConfigRegistro | null,
  cursor?: CursorFrancisco,
  rascunho?: FranciscoConfig,
) {
  const config = rascunho ?? registro?.publicado ?? registro?.rascunho ?? configPadraoFrancisco();
  const { data, error } = await db.rpc("francisco_listar_candidatos", {
    p_clinica: clinicaId,
    p_config: config,
    p_inicio: registro?.inicio_campanha ?? null,
    p_cursor_em: cursor?.em ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  conferirErro(error);
  const todos = (data ?? []) as CandidatoFrancisco[];
  const itens = todos.slice(0, 20);
  const ultimo = itens.at(-1);
  return {
    itens,
    proximo:
      todos.length > 20 && ultimo ? { em: ultimo.created_at, id: ultimo.orcamento_id } : null,
  };
}
export async function autorizarFrancisco(
  ctx: { supabase: SupabaseClient<Database>; userId: string },
  clinicaId: string,
  editar = false,
  publicar = false,
  aba?: AbaFrancisco,
) {
  const acessos = acessosFrancisco(await carregarAcessosOsZap(ctx.supabase, ctx.userId, clinicaId));
  const niveis = aba ? [acessos[aba]] : Object.values(acessos);
  if (!niveis.some((nivel) => (editar ? nivel === "write" : nivel !== "none")))
    throw new Error("Sem permissão para esta tela do Francisco nesta clínica.");
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("clinica_id", clinicaId)
    .eq("user_id", ctx.userId);
  conferirErro(error);
  const admin = data?.some((v) => v.role === "admin") ?? false;
  if (publicar && !admin)
    throw new Error("Somente um administrador pode publicar a configuração do Francisco.");
  return {
    acessos,
    podeEditar: niveis.includes("write"),
    podePublicar: admin,
    envioRealLiberado: envioRealLiberado(),
  };
}
export async function salvarRegistro(
  db: Db,
  clinicaId: string,
  ator: string,
  revisao: number,
  valor: unknown,
  publicar: boolean,
) {
  const config = franciscoConfigSchema.parse(valor);
  if (publicar && config.ativo && config.modo === "real") {
    if (!envioRealLiberado())
      throw new Error("Envio real bloqueado no servidor. Homologue antes de ativar.");
    const destino = await db
      .from("atend_departamentos")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .ilike("nome", config.departamento)
      .maybeSingle();
    conferirErro(destino.error);
    if (!destino.data)
      throw new Error("Selecione um departamento ativo da clínica para receber as respostas.");
    const { validarTemplates } = await import("./transport.server");
    await validarTemplates(clinicaId, config);
  }
  const { data, error } = await db.rpc("francisco_salvar_config", {
    p_clinica: clinicaId,
    p_ator: ator,
    p_revisao: revisao,
    p_config: config,
    p_publicar: publicar,
  });
  conferirErro(error);
  return data as ConfigRegistro;
}
export async function registrarContato(
  db: Db,
  clinicaId: string,
  ator: string,
  telefone: string,
  estado: "autorizado" | "recusado",
  evidencia: string,
) {
  const celular = celularParaEnvio(telefone);
  if (!celular) throw new Error("Informe um telefone celular válido com DDD.");
  const { error } = await db.rpc("francisco_autorizar_contato", {
    p_clinica: clinicaId,
    p_ator: ator,
    p_telefone: celular,
    p_estado: estado,
    p_evidencia: evidencia,
  });
  conferirErro(error);
  return { ok: true };
}
export async function paginaRegistros(
  db: Db,
  clinicaId: string,
  tipo: "envios" | "historico" | "contatos",
  cursor?: CursorFrancisco,
) {
  const tabela =
    tipo === "envios"
      ? "francisco_envios"
      : tipo === "historico"
        ? "francisco_eventos"
        : "francisco_contatos";
  if (tipo === "contatos") {
    // Consulta explícita por telefone é feita no formulário; não expõe o cadastro completo.
    throw new Error("Consulte a autorização pelo telefone.");
  }
  let q = db
    .from(tabela)
    .select("*")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(21);
  if (cursor)
    q = q.or(`created_at.lt.${cursor.em},and(created_at.eq.${cursor.em},id.lt.${cursor.id})`);
  const { data, error } = await q;
  conferirErro(error);
  const itens = (data ?? []).slice(0, 20);
  const ultimo = itens.at(-1);
  return {
    itens,
    proximo:
      (data?.length ?? 0) > 20 && ultimo
        ? { em: ultimo.created_at as string, id: ultimo.id as string }
        : null,
  };
}
