import {
  fraseAberturaPrevista,
  semanaDaUnidadeNoPrompt,
  situacaoFuncionamento,
} from "./proxima-abertura";

/**
 * Frase de abertura para o aviso de transferência quando a clínica está fora
 * do horário; `null` dentro do horário, sem horário confiável ou em falha de
 * leitura (o aviso segue sem a frase, nunca com horário inventado).
 *
 * Horário semanal: prompt publicado (Arquitetura). Feriados/horários
 * especiais: exceções do calendário publicado na Base de Conhecimentos.
 */
export async function aberturaPrevistaParaAviso(
  clinicaId: string,
  agora: Date = new Date(),
): Promise<string | null> {
  try {
    const [{ promptInstrucoes }, { carregarCalendariosPublicadosCache }, { supabaseAdmin }] =
      await Promise.all([
        import("./instrucoes-runtime.server"),
        import("./classificador-periodo.functions"),
        import("@/integrations/supabase/client.server"),
      ]);
    const [snapshot, clinica, calendarios] = await Promise.all([
      // Sem versão publicada não há horário: a reserva vazia cai em "desconhecida".
      promptInstrucoes("whatsapp", {}, ""),
      supabaseAdmin.from("clinicas").select("nome").eq("id", clinicaId).maybeSingle(),
      carregarCalendariosPublicadosCache(supabaseAdmin, clinicaId),
    ]);
    if (snapshot.origem === "codigo" || !clinica.data?.nome) return null;
    const semana = semanaDaUnidadeNoPrompt(snapshot.template, String(clinica.data.nome));
    const s = situacaoFuncionamento({ clinicaId, semana, agora, calendarios });
    return s.situacao === "fora_do_horario" ? fraseAberturaPrevista(s.abertura) : null;
  } catch (e) {
    console.warn(
      "[handoff-msg] horário de abertura indisponível",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
