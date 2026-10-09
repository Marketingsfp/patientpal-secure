import { FLAG_FONTE_CONSULTA, selecaoFonte, type FonteConsulta } from "./fonte-consulta";
import { lerFonteEditorial } from "./fonte-editorial.server";

/** Configuração apenas da consulta da Nina; não edita fontes, sincronização ou agenda. */
export function gerenciarFonteConsulta(contexto: { supabase: any; userId: string }, db: any) {
  async function autorizar(clinicaId: string, escrita = false) {
    const { data, error } = await contexto.supabase
      .from("clinica_memberships")
      .select("role")
      .eq("clinica_id", clinicaId)
      .eq("user_id", contexto.userId)
      .eq("ativo", true)
      .maybeSingle();
    if (error || !data) throw new Error("Sem acesso a esta clínica.");
    if (escrita && !["admin", "gestor"].includes(data.role))
      throw new Error("Somente administradores e gestores podem trocar a fonte da Maria.");
  }
  async function linha(clinicaId: string) {
    const { data, error } = await db
      .from("clinica_feature_flags")
      .select("id, ativo, config, updated_at, updated_by")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_FONTE_CONSULTA)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar a fonte de consulta.");
    return data;
  }
  return {
    async carregar(clinicaId: string) {
      await autorizar(clinicaId);
      return selecaoFonte(await linha(clinicaId));
    },
    async aplicar(clinicaId: string, fonte: FonteConsulta, revisaoEsperada: string | null) {
      await autorizar(clinicaId, true);
      if (!["clinica_os", "base_conhecimento"].includes(fonte)) throw new Error("Fonte inválida.");
      const anterior = await linha(clinicaId);
      const selecaoAnterior = selecaoFonte(anterior);
      const conflito =
        "A fonte foi alterada por outra pessoa. Atualize a tela antes de aplicar novamente.";
      if (selecaoAnterior.revisao !== revisaoEsperada) throw new Error(conflito);
      if (fonte === selecaoAnterior.fonte) return { ...selecaoAnterior, aviso: null };
      if (fonte === "base_conhecimento") {
        const base = await lerFonteEditorial(clinicaId, db);
        if (!base.servicos.length && !base.profissionais.length)
          throw new Error(
            "Publique pelo menos um exame ou profissional na base antes de selecioná-la.",
          );
      }
      await autorizar(clinicaId, true);
      const em = new Date().toISOString();
      const evento = { usuario: contexto.userId, em, antes: selecaoAnterior.fonte, depois: fonte };
      const configAnterior =
        anterior?.config && typeof anterior.config === "object" ? anterior.config : {};
      // Histórico e fonte mudam atomicamente. Não sobrescreve created_by/created_at.
      const valores = {
        ativo: true,
        config: {
          ...configAnterior,
          fonte,
          historico: [
            ...(Array.isArray(configAnterior.historico) ? configAnterior.historico : []),
            evento,
          ],
        },
        updated_by: contexto.userId,
        updated_at: em,
      };
      const q = anterior
        ? db
            .from("clinica_feature_flags")
            .update(valores)
            .eq("clinica_id", clinicaId)
            .eq("flag_key", FLAG_FONTE_CONSULTA)
            .eq("updated_at", revisaoEsperada)
        : db.from("clinica_feature_flags").insert({
            ...valores,
            clinica_id: clinicaId,
            flag_key: FLAG_FONTE_CONSULTA,
            descricao: "Fonte de consulta da Maria — real e homologação",
            created_by: contexto.userId,
          });
      const { data, error } = await q.select("ativo, config, updated_at").maybeSingle();
      if (error?.code === "23505" || (!error && !data)) throw new Error(conflito);
      if (error)
        throw new Error(
          "Não foi possível aplicar a fonte. Atualize para conferir a configuração atual.",
        );
      let aviso: string | null = null;
      try {
        const auditoria = await db.from("audit_log").insert({
          clinica_id: clinicaId,
          user_id: contexto.userId,
          table_name: "clinica_feature_flags",
          action: "NINA_FONTE_CONSULTA_ALTERADA",
          dados_antes: selecaoAnterior,
          dados_depois: { ...selecaoFonte(data), em },
        });
        if (auditoria.error) throw auditoria.error;
      } catch {
        aviso =
          "Fonte aplicada e alteração registrada na configuração; o registro adicional de auditoria não foi concluído.";
      }
      return { ...selecaoFonte(data), aviso };
    },
  };
}
