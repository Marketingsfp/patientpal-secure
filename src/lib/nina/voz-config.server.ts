import { capacidadesDoPapel } from "./arquitetura/permissoes";
import {
  FLAG_VOZ_NINA,
  selecaoVoz,
  vozConfigSchema,
  previaVozSchema,
  type VozConfig,
} from "./voz-config";
import type { ChamadaIA } from "./auditoria-ia";

async function lerLinha(db: any, clinicaId: string) {
  const { data, error } = await db
    .from("clinica_feature_flags")
    .select("ativo, config, updated_at")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_VOZ_NINA)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar a voz da Nina.");
  return data;
}

/** Uma leitura por resposta; falha mantém o atendimento em texto. */
export async function lerVozNina(clinicaId: string, db?: any) {
  const banco = db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  return selecaoVoz(await lerLinha(banco, clinicaId));
}

export function gerenciarVozNina(
  contexto: { supabase: any; userId: string; ip?: string | null },
  db: any,
) {
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
      throw new Error("Sem permissão para configurar ou testar a voz da Nina.");
    return podeEditar;
  }
  return {
    async carregar(clinicaId: string) {
      const podeEditar = await autorizar(clinicaId);
      return { ...selecaoVoz(await lerLinha(db, clinicaId)), podeEditar };
    },
    async salvar(
      clinicaId: string,
      configuracao: VozConfig,
      audioAtivo: boolean,
      revisaoEsperada: string | null,
    ) {
      await autorizar(clinicaId, true);
      const validada = vozConfigSchema.parse(configuracao);
      if (typeof audioAtivo !== "boolean") throw new Error("Configuração de áudio inválida.");
      const anterior = await lerLinha(db, clinicaId);
      const antes = selecaoVoz(anterior);
      const conflito = "A voz foi alterada por outra pessoa. Recarregue antes de salvar.";
      if (antes.revisao !== revisaoEsperada) throw new Error(conflito);
      const em = new Date().toISOString();
      const config = anterior?.config && typeof anterior.config === "object" ? anterior.config : {};
      const historico = Array.isArray(config.historico_voz) ? config.historico_voz : [];
      const valores = {
        ativo: !audioAtivo,
        config: {
          ...config,
          voz_nina: validada,
          historico_voz: [
            ...historico,
            {
              usuario: contexto.userId,
              ip: contexto.ip ?? null,
              em,
              antes: { configuracao: antes.configuracao, audioAtivo: antes.audioAtivo },
              depois: { configuracao: validada, audioAtivo },
            },
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
            .eq("flag_key", FLAG_VOZ_NINA)
            .eq("updated_at", revisaoEsperada)
        : db.from("clinica_feature_flags").insert({
            ...valores,
            clinica_id: clinicaId,
            flag_key: FLAG_VOZ_NINA,
            descricao: "Voz da Nina no WhatsApp e homologação; ativo desliga áudio",
            created_by: contexto.userId,
          });
      const { data, error } = await q.select("ativo, config, updated_at").maybeSingle();
      if (error?.code === "23505" || (!error && !data)) throw new Error(conflito);
      if (error)
        throw new Error(
          "Não foi possível salvar a voz. Recarregue para conferir a configuração atual.",
        );
      let aviso: string | null = null;
      try {
        const auditoria = await db.from("audit_log").insert({
          clinica_id: clinicaId,
          user_id: contexto.userId,
          table_name: "clinica_feature_flags",
          action: "NINA_VOZ_ALTERADA",
          dados_antes: antes,
          dados_depois: { ...selecaoVoz(data), ip: contexto.ip ?? null },
        });
        if (auditoria.error) throw auditoria.error;
      } catch {
        aviso = "Voz salva com histórico; o registro adicional de auditoria não foi concluído.";
      }
      return { ...selecaoVoz(data), podeEditar: true, aviso };
    },
    async previa(clinicaId: string, configuracao: VozConfig, texto: string) {
      await autorizar(clinicaId, true);
      const validada = vozConfigSchema.parse(configuracao);
      const entrada = previaVozSchema.parse(texto);
      const { sintetizarFala, prepararParaFala } = await import("../nina-audio.server");
      const chamadas: ChamadaIA[] = [];
      const fala = prepararParaFala(entrada);
      if (!fala) throw new Error("Digite um texto para ouvir a prévia.");
      // Não publica preferências, não cria conversa e não envia WhatsApp.
      const audio = await sintetizarFala(
        fala,
        (c) => {
          chamadas.push(c);
        },
        validada,
        "mp3",
      );
      let aviso: string | null = null;
      try {
        const { error } = await db.from("audit_log").insert({
          clinica_id: clinicaId,
          user_id: contexto.userId,
          table_name: "clinica_feature_flags",
          action: "NINA_VOZ_PREVIA",
          dados_depois: {
            configuracao: validada,
            chamadas,
            sucesso: !!audio,
            ip: contexto.ip ?? null,
          },
        });
        if (error) throw error;
      } catch {
        aviso = "Prévia gerada, mas não foi possível registrar a auditoria.";
      }
      if (!audio)
        throw new Error(
          "O serviço não gerou áudio com essa configuração. Tente outra voz ou tente novamente. Nada foi salvo.",
        );
      return {
        base64: Buffer.from(audio.bytes).toString("base64"),
        mime: audio.mime,
        aviso,
      };
    },
  };
}
