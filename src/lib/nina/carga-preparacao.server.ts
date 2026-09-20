/** Um lote de preparação, compartilhado pela UI legada e pelo job persistente. */
import {
  carregarCargaControlada as carregarCarga,
  comLeaseCarga,
  retornoCarga,
} from "./carga-controle.server";
import { estadoControleCarga } from "./carga-controle";
export async function prepararCargaControlada(e: {
  admin: any;
  clinicaId: string;
  cargaId: string;
  userId: string;
  podeContinuar?: () => Promise<boolean>;
}) {
  const { prepararLeadsCarga } = await import("@/lib/nina/carga-preflight.server");
  const {
    LOTE_PREFLIGHT,
    baselineLead,
    descreverFalhaPreflight,
    descreverPreparacaoParcial,
    pendentesPreflight,
  } = await import("@/lib/nina/carga-preflight");
  const carga = await carregarCarga(e.admin, e.clinicaId, e.cargaId);
  const resultado =
    carga.status === "preparando"
      ? await comLeaseCarga({
          admin: e.admin,
          carga,
          fase: "preflight",
          executar: async (dono, atual) => {
            const plano = Array.isArray(atual.plano) ? (atual.plano as any[]) : [];
            const inicioConfirmado = (atual.config as any)?._inicioCarga;
            // O snapshot é criado apenas pelo comando Iniciar; `confirmado` legado
            // pertence à confirmação adicional de alto volume, não ao reset inicial.
            const reiniciarNoInicio =
              inicioConfirmado?.versao === 1 && inicioConfirmado?.resetTodosLeads === true;
            const participantes = reiniciarNoInicio
              ? inicioConfirmado.leads
              : [
                  ...new Map(
                    plano.map((p: any) => [
                      p.leadId,
                      { id: p.leadId as string, indice: p.leadIndice as number },
                    ]),
                  ).values(),
                ];
            if (
              !Array.isArray(participantes) ||
              !participantes.length ||
              (reiniciarNoInicio &&
                (participantes.length !== 10 ||
                  new Set(participantes.map((l: any) => l.id)).size !== 10))
            )
              throw new Error("O plano não possui participantes válidos.");
            const baselines = Array.isArray(atual.preflight) ? atual.preflight : [];
            let acumulado = [...baselines];
            const pendentes = pendentesPreflight(participantes, baselines).slice(0, LOTE_PREFLIGHT);
            if (!(await dono.aindaAtivo()) || (e.podeContinuar && !(await e.podeContinuar())))
              return;
            const resumo = pendentes.length
              ? await prepararLeadsCarga({
                  admin: e.admin,
                  clinicaId: e.clinicaId,
                  leads: pendentes as any,
                  userId: e.userId,
                  reiniciarNoInicio,
                  podeContinuar: async () =>
                    (await dono.aindaAtivo()) && (!e.podeContinuar || (await e.podeContinuar())),
                  aposPronto: async (resultado) => {
                    acumulado = [
                      ...acumulado.filter((b: any) => b.leadId !== resultado.leadId),
                      baselineLead({ runId: atual.id, resultado }),
                    ];
                    if (!(await dono.alterar({ preflight: acumulado })))
                      throw new Error(
                        "A preparação perdeu sua reserva antes de registrar o lead pronto.",
                      );
                  },
                })
              : { pronto: true, total: 0, prontos: 0, falhas: [], resultados: [] };
            if (resumo.falhas.length)
              throw new Error(
                (
                  descreverPreparacaoParcial(acumulado.length, participantes.length) +
                  " " +
                  descreverFalhaPreflight(resumo as any)
                ).trim(),
              );
            if (
              pendentesPreflight(participantes, acumulado).length === 0 &&
              (await dono.aindaAtivo())
            ) {
              // Revalida todos antes de abrir o gate: outro operador pode ter usado
              // um lead já preparado enquanto os demais ainda eram reiniciados.
              const { data: atuais, error } = await e.admin
                .from("nina_teste_leads")
                .select("id, sessao_seq, conversa_id, ciclo_id")
                .eq("clinica_id", e.clinicaId)
                .in(
                  "id",
                  participantes.map((l: any) => l.id),
                );
              if (error)
                throw new Error(
                  `Não foi possível confirmar as sessões preparadas: ${error.message}`,
                );
              for (const participante of participantes) {
                const lead = atuais?.find((l: any) => l.id === participante.id);
                const baseline = acumulado.find((b: any) => b.leadId === participante.id);
                if (
                  !lead ||
                  !baseline ||
                  lead.conversa_id ||
                  lead.ciclo_id ||
                  Number(lead.sessao_seq) !== baseline.sessao
                )
                  throw new Error(
                    `Lead ${participante.indice}: a sessão mudou durante a preparação. Nenhuma mensagem de carga foi enviada.`,
                  );
              }
              await dono.alterar({ status: "executando", iniciado_em: new Date().toISOString() });
            }
          },
        })
      : { carga, ocupado: estadoControleCarga(carga).ocupado };
  const atual = resultado.carga;
  const snapshot = (atual.config as any)?._inicioCarga;
  const participantes =
    snapshot?.resetTodosLeads && Array.isArray(snapshot.leads)
      ? snapshot.leads.length
      : new Set((Array.isArray(atual.plano) ? atual.plano : []).map((p: any) => p.leadId)).size;
  return retornoCarga(atual, {
    ocupado: resultado.ocupado,
    pronto: atual.status === "executando",
    prontos: Array.isArray(atual.preflight) ? atual.preflight.length : 0,
    total: participantes,
  });
}
