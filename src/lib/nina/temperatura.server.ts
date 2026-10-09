import { capacidadesDoPapel } from "./arquitetura/permissoes";
import {
  FLAG_TEMPERATURA_NINA,
  TEMPERATURA_PADRAO,
  selecaoTemperatura,
  temperaturaSchema,
  type ConfigTemperatura,
} from "./temperatura";

async function lerLinha(db: any, clinicaId: string) {
  const { data, error } = await db
    .from("clinica_feature_flags")
    .select("ativo, config, updated_at")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_TEMPERATURA_NINA)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler a temperatura da Nina.");
  return data;
}

/** Mesma resolução em homologação e WhatsApp, sem cache entre chamadas. */
export async function lerTemperaturaNina(
  clinicaId: string | null,
  db?: any,
): Promise<ConfigTemperatura> {
  if (!clinicaId) return selecaoTemperatura(null);
  try {
    const banco = db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    return selecaoTemperatura(await lerLinha(banco, clinicaId));
  } catch {
    console.warn("[nina-temperatura] Falha de leitura; usando padrão recomendado.");
    return { temperatura: TEMPERATURA_PADRAO, revisao: null, origem: "padrao_falha_leitura" };
  }
}

export function gerenciarTemperaturaNina(contexto: { supabase: any; userId: string }, db: any) {
  async function autorizar(clinicaId: string, escrita = false) {
    const { data: membro, error: erroMembro } = await contexto.supabase
      .from("clinica_memberships")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("user_id", contexto.userId)
      .eq("ativo", true)
      .maybeSingle();
    if (erroMembro || !membro) throw new Error("Sem acesso a esta clínica.");
    const { data: papeis, error } = await contexto.supabase
      .from("user_roles")
      .select("role")
      .eq("clinica_id", clinicaId)
      .eq("user_id", contexto.userId);
    if (error) throw new Error("Não foi possível conferir suas permissões.");
    const capacidades = (papeis ?? []).flatMap((p: { role: string }) => capacidadesDoPapel(p.role));
    const podeEditar = capacidades.includes("nina.instrucoes.publicar");
    if (!capacidades.includes("arquitetura.visualizar") || (escrita && !podeEditar))
      throw new Error("Sem permissão para esta configuração da Nina.");
    return podeEditar;
  }
  return {
    async carregar(clinicaId: string) {
      const podeEditar = await autorizar(clinicaId);
      return { ...selecaoTemperatura(await lerLinha(db, clinicaId)), podeEditar };
    },
    async salvar(clinicaId: string, temperatura: number, revisaoEsperada: string | null) {
      await autorizar(clinicaId, true);
      temperaturaSchema.parse(temperatura);
      const anterior = await lerLinha(db, clinicaId);
      const antes = selecaoTemperatura(anterior);
      const conflito = "A temperatura foi alterada por outra pessoa. Recarregue antes de salvar.";
      if (antes.revisao !== revisaoEsperada) throw new Error(conflito);
      const em = new Date().toISOString();
      const config = anterior?.config && typeof anterior.config === "object" ? anterior.config : {};
      const historico = Array.isArray(config.historico) ? config.historico : [];
      // Configuração e histórico são gravados juntos; preserva criação e demais campos.
      const valores = {
        ativo: true,
        config: {
          ...config,
          temperatura,
          historico: [
            ...historico,
            { usuario: contexto.userId, em, antes: antes.temperatura, depois: temperatura },
          ],
        },
        updated_at: em,
        updated_by: contexto.userId,
      };
      const q = anterior
        ? db
            .from("clinica_feature_flags")
            .update(valores)
            .eq("clinica_id", clinicaId)
            .eq("flag_key", FLAG_TEMPERATURA_NINA)
            .eq("updated_at", revisaoEsperada)
        : db.from("clinica_feature_flags").insert({
            ...valores,
            clinica_id: clinicaId,
            flag_key: FLAG_TEMPERATURA_NINA,
            descricao: "Temperatura Nina WhatsApp e homologação",
            created_by: contexto.userId,
          });
      const { data, error } = await q.select("ativo, config, updated_at").maybeSingle();
      if (error?.code === "23505" || (!error && !data)) throw new Error(conflito);
      if (error)
        throw new Error(
          "Não foi possível salvar a temperatura. Recarregue para conferir o valor atual.",
        );
      let aviso: string | null = null;
      try {
        const auditoria = await db.from("audit_log").insert({
          clinica_id: clinicaId,
          user_id: contexto.userId,
          table_name: "clinica_feature_flags",
          action: "NINA_TEMPERATURA_ALTERADA",
          dados_antes: antes,
          dados_depois: selecaoTemperatura(data),
        });
        if (auditoria.error) throw auditoria.error;
      } catch {
        aviso =
          "Temperatura salva com histórico; o registro adicional de auditoria não foi concluído.";
      }
      return { ...selecaoTemperatura(data), podeEditar: true, aviso };
    },
  };
}
