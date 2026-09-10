/**
 * Leitura da conversa de origem de um feedback (somente leitura / auditoria).
 *
 * FASE 2 — "Ver conversa" na Revisão de aprendizados abre um modal sobre a
 * própria página. A conversa é localizada SEMPRE pelo conversa_id do reporte,
 * nunca pelo lead. Conversas de homologação (is_teste) também são lidas aqui,
 * porque o erro pode ter sido reportado dentro do ambiente de teste.
 *
 * Nada aqui escreve: não marca leitura, não altera contadores, não muda
 * status, responsável nem memória.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const lerConversaFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("whatsapp_mensagens")
      .select("id, direction, body, tipo, enviada_por, recebida_em, transcricao")
      .eq("clinica_id", data.clinicaId)
      .eq("conversa_id", data.conversaId)
      .order("recebida_em", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return linhas ?? [];
  });

export interface MensagemAuditoria {
  id: string;
  direction: string | null;
  body: string | null;
  tipo: string | null;
  enviada_por: string | null;
  recebida_em: string;
  media_url: string | null;
  media_mime: string | null;
}

/**
 * Conversa completa em modo auditoria: cabeçalho + mensagens + eventos de
 * sistema. Exige que a pessoa seja membro da clínica e que a conversa
 * pertença a essa clínica (bloqueia referência cruzada entre unidades).
 */
export const lerConversaAuditoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        mensagemId: z.string().uuid().nullable().optional(),
        limite: z.number().int().min(20).max(500).default(300),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: membro, error: eMembro } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (eMembro) throw new Error(eMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    const { data: conversa, error: eConv } = await context.supabase
      .from("atend_conversas")
      .select("*, pacientes:contato_paciente_id(nome)")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (eConv) throw new Error(eConv.message);
    if (!conversa) throw new Error("Conversa não encontrada nesta clínica.");

    const [msgs, evs] = await Promise.all([
      context.supabase
        .from("whatsapp_mensagens")
        .select(
          "id, direction, body, tipo, enviada_por, recebida_em, media_url, media_mime",
        )
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", data.conversaId)
        .order("recebida_em", { ascending: true })
        .limit(data.limite),
      context.supabase
        .from("atend_conversa_eventos")
        .select("id, evento, user_id, motivo, detalhes, created_at")
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", data.conversaId)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
    if (msgs.error) throw new Error(msgs.error.message);
    if (evs.error) throw new Error(evs.error.message);

    const lista = (msgs.data ?? []) as MensagemAuditoria[];
    const eventos = evs.data ?? [];

    // Nomes de quem agiu nos eventos (banner da timeline).
    const responsavelId =
      ((conversa as unknown as Record<string, unknown>)["atribuida_user_id"] as
        | string
        | null) ?? null;
    const ids = Array.from(
      new Set(
        [
          responsavelId,
          ...eventos.flatMap((r) => {
            const det = (r.detalhes ?? null) as
              | { para_user_id?: string | null; de_user_id?: string | null }
              | null;
            return [r.user_id, det?.para_user_id ?? null, det?.de_user_id ?? null];
          }),
        ].filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      (profs ?? []).forEach((p: { id: string; nome: string | null }) => {
        if (p.nome) nomes.set(p.id, p.nome);
      });
    }

    const c = conversa as unknown as Record<string, unknown> & {
      pacientes?: { nome?: string | null } | null;
    };

    return {
      conversa: {
        id: String(c.id),
        titulo:
          (c.pacientes?.nome as string | undefined) ??
          (c["contato_nome"] as string | null) ??
          (c["numero_conversa"] as string | null) ??
          "Conversa",
        numero: (c["numero_conversa"] as string | null) ?? null,
        status: (c["status"] as string | null) ?? null,
        is_teste: Boolean(c["is_teste"]),
        // Protocolo OFICIAL do atendimento. O antigo número ATD-* deixou de
        // ser protocolo: não é gerado nem exibido em lugar nenhum.
        protocolo: (c["protocolo_atendimento"] as string | null) ?? null,
        // Nome usado para rotular as mensagens enviadas por atendente humana.
        atendente_nome: responsavelId ? (nomes.get(responsavelId) ?? null) : null,
      },
      mensagens: lista,
      // A mensagem reportada pode ter sido apagada ou ficar fora do limite:
      // nesse caso avisamos em vez de destacar outra parecida.
      mensagemEncontrada: data.mensagemId
        ? lista.some((m) => m.id === data.mensagemId)
        : null,
      eventos: eventos.map((r) => {
        const det = (r.detalhes ?? null) as
          | { para_user_id?: string | null; de_user_id?: string | null }
          | null;
        return {
          ...r,
          user_nome: r.user_id ? (nomes.get(r.user_id) ?? null) : null,
          para_nome: det?.para_user_id ? (nomes.get(det.para_user_id) ?? null) : null,
          de_nome: det?.de_user_id ? (nomes.get(det.de_user_id) ?? null) : null,
        };
      }),
    };
  });
