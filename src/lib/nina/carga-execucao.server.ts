/** Uma unidade por requisição limita o acúmulo de contexto/modelo/auditoria. */
import { normalizarConfig, estourouOrcamento } from "./carga";
import { configBateria, itemBateria } from "./carga-bateria";
import {
  decidirTurnoBateria,
  devolverCenarioBateria,
  devolverVagasBateria,
  verificarCenarioBateria,
  type PacienteLuna,
} from "./carga-bateria.server";
import { cargaParalela } from "./carga-paralela";
import { comReservaParalela } from "./carga-paralela.server";
import { chaveMensagemCarga, estadoControleCarga } from "./carga-controle";
import { carregarCargaControlada, comLeaseCarga, retornoCarga } from "./carga-controle.server";
import {
  desfechoItemCarga,
  gravarAmostraCarga,
  lerAmostrasCarga,
  tokensAmostrasCarga,
  totaisAmostrasCarga,
  type ItemCarga,
  type DesfechoItemCarga,
} from "./carga-itens.server";

const pacienteLunaPadrao: PacienteLuna = async (cenario, historico) =>
  (await import("./carga-redacao-luna.server")).proximaMensagemPacienteLuna(cenario, historico);

export async function executarCargaControlada(e: {
  admin: any;
  clinicaId: string;
  cargaId: string;
  userId: string;
  processar: (
    data: { clinicaId: string; leadId: string; tipo: "text"; texto: string; chave: string },
    userId: string,
  ) => Promise<any>;
  agora?: () => number;
  heartbeatMs?: number;
  /** Job persistido ainda possui autorização/reserva para iniciar novas mensagens. */
  podeContinuar?: () => Promise<boolean>;
  /** Bateria por profissional: a Luna escreve a próxima mensagem do paciente. */
  paciente?: PacienteLuna;
}) {
  const agora = e.agora ?? Date.now;
  const carga = await carregarCargaControlada(e.admin, e.clinicaId, e.cargaId);
  if (carga.status !== "executando") return retornoCarga(carga, { aguardandoDesfecho: false });
  const ritmo = estadoControleCarga(carga, agora());
  if (ritmo.aguardarMs > 0)
    return retornoCarga(carga, {
      aguardandoRitmo: true,
      aguardarMs: ritmo.aguardarMs,
      aguardandoDesfecho: false,
    });
  let aguardandoDesfecho = false;
  const paralelo = cargaParalela(carga.config);
  const reservar = paralelo ? comReservaParalela : comLeaseCarga;
  // Bateria encerrada antes do fim (erro, prazo, orçamento): nenhuma vaga de teste fica ocupada.
  const devolverSeEncerrou = async () => {
    if (!configBateria(carga.config)) return;
    const atual = await carregarCargaControlada(e.admin, e.clinicaId, e.cargaId).catch(() => null);
    if (atual && ["erro", "parado"].includes(atual.status))
      await devolverVagasBateria(e.admin, atual).catch(() => undefined);
  };
  const resultado = await reservar({
    admin: e.admin,
    carga,
    fase: "lote",
    agora,
    heartbeatMs: e.heartbeatMs,
    executar: async (dono, inicial) => {
      const config = normalizarConfig(inicial.config ?? {});
      const bateria = configBateria(inicial.config);
      const plano: ItemCarga[] = Array.isArray(inicial.plano) ? inicial.plano : [];
      let amostras = await lerAmostrasCarga(e.admin, inicial);
      const concluidos = new Set(amostras.map((a) => a.indice));
      // O cursor é reconstruído dos resultados, inclusive se a queda ocorreu após o INSERT.
      if (!(await dono.alterar(totaisAmostrasCarga(amostras)))) return;
      if (plano.every((p) => concluidos.has(p.indice))) {
        await dono.alterar(
          { status: "concluido", finalizado_em: new Date(agora()).toISOString() },
          [],
        );
        return;
      }
      const inicio = Date.parse(inicial.iniciado_em ?? "");
      if (!Number.isFinite(inicio)) throw new Error("Início da carga inválido.");
      let item: ItemCarga | undefined;
      let existente: DesfechoItemCarga = { tipo: "novo" };
      const aguardandoLead = new Set<string>();
      for (const candidato of plano) {
        if (paralelo && candidato.indice !== inicial.indiceReservado) continue;
        if (concluidos.has(candidato.indice) || aguardandoLead.has(candidato.leadId)) continue;
        const desfecho = await desfechoItemCarga(e.admin, inicial, candidato);
        if (desfecho.tipo === "pendente") {
          aguardandoLead.add(candidato.leadId);
          continue;
        }
        item = candidato;
        existente = desfecho;
        break;
      }
      if (
        existente.tipo !== "terminal" &&
        (agora() - inicio >= (bateria?.duracaoMaxS ?? config.duracaoMaxS) * 1000 ||
          estourouOrcamento(config, tokensAmostrasCarga(amostras)).estourou)
      ) {
        await dono.alterar({
          status: "parado",
          cancelar: true,
          finalizado_em: new Date(agora()).toISOString(),
        });
        return;
      }
      if (!item) {
        aguardandoDesfecho = true;
        return;
      }
      if (!(await dono.aindaAtivo()) || !(await dono.alterar({}, [item.indice]))) return;
      let t0 = agora();
      let amostra: Record<string, unknown> | undefined;
      let enviou = false;
      const passo = bateria ? itemBateria(item) : null;
      if (existente.tipo === "terminal") {
        amostra = passo
          ? {
              ...existente.resultado,
              resultado: { tipo: "turno", cenarioId: passo.cenarioId, recuperado: true },
            }
          : existente.resultado;
      } else if (bateria && passo && passo.tipo !== "turno") {
        const entrada = { admin: e.admin, carga: inicial, bateria, item: passo, amostras };
        amostra =
          passo.tipo === "verificar"
            ? await verificarCenarioBateria(entrada)
            : await devolverCenarioBateria(entrada);
      } else {
        const baseline = (Array.isArray(inicial.preflight) ? inicial.preflight : []).find(
          (b: any) => b.leadId === item.leadId,
        );
        const { data: lead, error } = await e.admin
          .from("nina_teste_leads")
          .select("id,sessao_seq,conversa_id,resolvido_em")
          .eq("clinica_id", e.clinicaId)
          .eq("id", item.leadId)
          .maybeSingle();
        if (error) throw new Error("Não foi possível confirmar a sessão do lead.");
        if (
          !baseline ||
          baseline.runId !== inicial.id ||
          !Number.isInteger(baseline.sessao) ||
          !lead ||
          Number(lead.sessao_seq) !== baseline.sessao
        )
          throw new Error(
            `Lead ${item.leadIndice}: a sessão mudou ou não possui baseline. Prepare um novo teste.`,
          );
        if (!(await dono.aindaAtivo()) || (e.podeContinuar && !(await e.podeContinuar()))) return;
        let texto = item.mensagem;
        let resultadoBateria: Record<string, unknown> | null = null;
        if (bateria && passo) {
          const decisao = await decidirTurnoBateria({
            admin: e.admin,
            carga: inicial,
            bateria,
            item: passo,
            amostras,
            lead,
            agora: agora(),
            paciente: e.paciente ?? pacienteLunaPadrao,
          });
          // Liberar sem resultado agenda uma nova tentativa deste mesmo passo.
          if (decisao.tipo === "aguardar") return;
          if (decisao.tipo === "dispensar")
            amostra = {
              status: "dispensado",
              conversa_id: lead.conversa_id ?? null,
              erro: null,
              mensagem: "",
              resultado: decisao.resultado,
            };
          else {
            // A escrita da Luna leva segundos: encerrar nesse meio-tempo não envia mais nada.
            if (!(await dono.aindaAtivo())) return;
            texto = decisao.texto;
            resultadoBateria = decisao.resultado;
            // A latência medida é a da Nina, sem o tempo de escrita da Luna.
            t0 = agora();
          }
        }
        let resp: any;
        if (!amostra)
          try {
            enviou = true;
            resp = await e.processar(
              {
                clinicaId: e.clinicaId,
                leadId: item.leadId,
                tipo: "text",
                texto,
                chave: chaveMensagemCarga(inicial.id, item.indice),
              },
              e.userId,
            );
          } catch {
            const aposFalha = await desfechoItemCarga(e.admin, inicial, item);
            if (aposFalha.tipo === "pendente") {
              aguardandoDesfecho = true;
              return;
            }
            amostra =
              aposFalha.tipo === "terminal"
                ? aposFalha.resultado
                : {
                    status: "erro",
                    erro: "PROCESSADOR_FALHOU_ANTES_DA_ENTRADA",
                    conversa_id: null,
                  };
          }
        if (resp) {
          const persistido = await desfechoItemCarga(e.admin, inicial, item);
          if (persistido.tipo === "pendente") {
            aguardandoDesfecho = true;
            return;
          }
          // Texto em memória e success do modelo não comprovam entrega.
          amostra =
            persistido.tipo === "terminal"
              ? persistido.resultado
              : {
                  status: "erro",
                  erro: "ENTRADA_NAO_CONFIRMADA",
                  conversa_id: resp.conversaId ?? null,
                };
          if (resp.execucaoId) {
            const { data: exec, error: erroExec } = await e.admin
              .from("nina_execucoes")
              .select("id,conversation_id,tool_calls,input_tokens,output_tokens,retries")
              .eq("clinica_id", e.clinicaId)
              .eq("id", resp.execucaoId)
              .maybeSingle();
            // Telemetria indisponível não apaga uma entrega comprovada.
            if (!erroExec && exec && exec.conversation_id === amostra.conversa_id) {
              Object.assign(amostra, {
                chamadas_modelo: 1,
                ferramentas: exec.tool_calls ?? [],
                input_tokens: exec.input_tokens ?? 0,
                output_tokens: exec.output_tokens ?? 0,
              });
              await dono.alterar(
                paralelo
                  ? { retriesDoItem: Number(exec.retries ?? 0) }
                  : { retries: Number(inicial.retries ?? 0) + Number(exec.retries ?? 0) },
              );
            }
          }
        }
        if (resultadoBateria && amostra)
          amostra = {
            ...amostra,
            mensagem: texto.slice(0, 300),
            resultado: { ...resultadoBateria, transferida: resp?.transferida === true },
          };
      }
      amostra ??= { status: "erro", erro: "PROCESSADOR_SEM_RESULTADO" };
      // Verificação, devolução e passos dispensados não enviam mensagem: sem latência.
      const latencia = existente.tipo === "novo" && (enviou || !passo) ? agora() - t0 : null;
      if (latencia !== null && latencia > config.timeoutS * 1000 && amostra.status === "ok") {
        amostra.status = "timeout";
        amostra.erro = `Resposta persistida após o limite de ${config.timeoutS}s. Não reenviada.`;
      }
      // Cancelamento preserva o resultado já concluído, sem iniciar outra mensagem.
      await gravarAmostraCarga(e.admin, inicial, item, { ...amostra, latencia_ms: latencia });
      amostras = await lerAmostrasCarga(e.admin, inicial);
      await dono.alterar(
        totaisAmostrasCarga(amostras),
        [],
        new Date(
          t0 + Math.max(config.intervaloMs, Math.ceil(60_000 / config.mensagensPorMinuto)),
        ).toISOString(),
      );
      if (
        plano.every((p) => amostras.some((a) => a.indice === p.indice)) &&
        (await dono.aindaAtivo())
      )
        await dono.alterar({ status: "concluido", finalizado_em: new Date(agora()).toISOString() });
    },
  }).catch(async (erro: unknown) => {
    await devolverSeEncerrou();
    throw erro;
  });
  if (["erro", "parado"].includes(resultado.carga.status)) await devolverSeEncerrou();
  return retornoCarga(resultado.carga, {
    ocupado: resultado.ocupado,
    aguardandoDesfecho,
    ...(aguardandoDesfecho ? { aguardarMs: 5000, aguardandoRitmo: true } : {}),
  });
}
