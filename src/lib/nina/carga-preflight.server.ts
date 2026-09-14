/** Reset inicial autorizado pelo disparo confirmado da carga; retomada só verifica. */
import {
  prepararLeads,
  type ResumoPreflight,
  type ResultadoPreflightLead,
} from "./carga-preflight";
import { carregarLead, resetarLeadTeste, type LeadRow } from "./teste-console.server";

export const MENSAGEM_RESET_MANUAL =
  'Sessão em andamento: use "Resolver / Reiniciar teste" neste lead antes de iniciar.';

export async function prepararLeadsCarga(entrada: {
  admin: any;
  clinicaId: string;
  leads: LeadRow[];
  userId: string | null;
  paralelismo?: number;
  /** Presente somente no snapshot criado pelo disparo explicitamente confirmado. */
  reiniciarNoInicio?: boolean;
  podeContinuar?: () => Promise<boolean>;
  aposPronto?: (resultado: ResultadoPreflightLead) => Promise<void>;
}): Promise<ResumoPreflight> {
  // Sequencial para uma parada impedir o próximo reset e persistir cada baseline.
  return await prepararLeads<LeadRow>({
    leads: entrada.leads,
    paralelismo: 1,
    resetar: async (lead) => {
      if (entrada.podeContinuar && !(await entrada.podeContinuar()))
        throw new Error("Preparação interrompida antes de reiniciar este lead.");
      const antes = await carregarLead(entrada.admin, entrada.clinicaId, lead.id);
      let resultado = {
        jaResolvida: true,
        cicloEncerrado: null as string | null,
        sessao: antes.sessao_seq,
      };
      if (entrada.reiniciarNoInicio) {
        // Uma retomada não deve apagar uma nova sessão iniciada por outro operador.
        const jaReiniciado =
          !antes.conversa_id &&
          !antes.ciclo_id &&
          Number(antes.sessao_seq) === Number(lead.sessao_seq) + 1;
        const mesmaSessao =
          Number(antes.sessao_seq) === Number(lead.sessao_seq) &&
          (antes.conversa_id ?? null) === (lead.conversa_id ?? null);
        if (!mesmaSessao && !jaReiniciado)
          throw new Error(
            "A sessão mudou depois do início confirmado. Inicie um novo teste para autorizar esse reinício.",
          );
        if (!jaReiniciado)
          resultado = await resetarLeadTeste(entrada.admin, {
            clinicaId: entrada.clinicaId,
            leadId: lead.id,
            conversaId: lead.conversa_id,
            userId: entrada.userId,
            manual: true,
            origem: "inicio_teste_carga_confirmado",
            removerAgendamentos: false,
          });
        // Confirme a memória da conversa arquivada, sem apagar o histórico.
        if (lead.conversa_id) {
          const { data: conversa, error } = await entrada.admin
            .from("atend_conversas")
            .select("id, status, ai_enabled, nina_fluxo_estado")
            .eq("clinica_id", entrada.clinicaId)
            .eq("id", lead.conversa_id)
            .maybeSingle();
          if (error)
            throw new Error(`Não foi possível confirmar a limpeza da memória: ${error.message}`);
          if (
            !conversa ||
            conversa.status !== "finished" ||
            conversa.ai_enabled !== false ||
            conversa.nina_fluxo_estado != null
          )
            throw new Error(
              "Reset não confirmado: a memória da conversa anterior ainda está ativa.",
            );
        }
      }
      const atual = await carregarLead(entrada.admin, entrada.clinicaId, lead.id);
      if (atual.conversa_id || atual.ciclo_id)
        throw new Error(
          entrada.reiniciarNoInicio
            ? "Reset não confirmado: o lead continua com conversa/ciclo abertos."
            : MENSAGEM_RESET_MANUAL,
        );
      if (!Number.isInteger(atual.sessao_seq) || atual.sessao_seq !== resultado.sessao)
        throw new Error(
          "Reset não confirmado: a sessão persistida diverge do resultado do reinício.",
        );
      await entrada.aposPronto?.({
        leadId: lead.id,
        indice: lead.indice,
        situacao: "READY",
        jaLimpo: resultado.jaResolvida,
        cicloEncerrado: resultado.cicloEncerrado,
        sessao: atual.sessao_seq,
      });
      return resultado;
    },
  });
}
