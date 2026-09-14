/** Executa somente a fila persistida. Processador injetado para testes sem IA/DB real. */
import { normalizarConfig, estourouOrcamento } from "./carga";
import { chaveMensagemCarga, proximaRodadaCarga, estadoControleCarga } from "./carga-controle";
import { carregarCargaControlada, comLeaseCarga, retornoCarga } from "./carga-controle.server";

const ORCAMENTO_LOTE_MS = 20_000;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type ItemCarga = {
  indice: number;
  leadId: string;
  leadIndice: number;
  cenario: string;
  mensagem: string;
};

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
  esperar?: (ms: number) => Promise<void>;
  heartbeatMs?: number;
}) {
  const agora = e.agora ?? Date.now;
  const carga = await carregarCargaControlada(e.admin, e.clinicaId, e.cargaId);
  if (carga.status !== "executando") return retornoCarga(carga);
  const ritmo = estadoControleCarga(carga, agora());
  if (ritmo.aguardarMs > 0)
    return retornoCarga(carga, { aguardandoRitmo: true, aguardarMs: ritmo.aguardarMs });
  const resultado = await comLeaseCarga({
    admin: e.admin,
    carga,
    fase: "lote",
    agora,
    heartbeatMs: e.heartbeatMs,
    executar: async (dono, inicial) => {
      const config = normalizarConfig(inicial.config ?? {});
      const plano = Array.isArray(inicial.plano) ? (inicial.plano as ItemCarga[]) : [];
      const inicioLote = agora();
      const inicioTeste = Date.parse(inicial.iniciado_em ?? "");
      if (!Number.isFinite(inicioTeste))
        throw new Error("O teste não possui início de execução válido.");
      let enviadas = Number(inicial.enviadas ?? 0);
      let atual = inicial;
      while (enviadas < plano.length) {
        if (agora() - inicioLote >= ORCAMENTO_LOTE_MS) break;
        if (!(await dono.aindaAtivo())) break;
        if (
          agora() - inicioTeste >= config.duracaoMaxS * 1000 ||
          estourouOrcamento(
            config,
            Number(atual.input_tokens ?? 0) + Number(atual.output_tokens ?? 0),
          ).estourou
        ) {
          await dono.alterar({
            status: "parado",
            cancelar: true,
            finalizado_em: new Date(agora()).toISOString(),
          });
          break;
        }
        const rodada = proximaRodadaCarga(
          plano,
          enviadas,
          Math.min(config.conversasSimultaneas, config.mensagensPorMinuto),
        );
        if (!rodada.length)
          throw new Error("Fila do teste inválida: nenhum item pode ser reservado.");
        const intervaloRodada = Math.max(
          config.intervaloMs,
          Math.ceil((60_000 * rodada.length) / config.mensagensPorMinuto),
        );
        if (
          !(await dono.alterar(
            {},
            rodada.map((item) => item.indice),
          ))
        )
          break;
        const t0Rodada = agora();
        const encerradas = await Promise.allSettled(
          rodada.map(async (item) => {
            const t0 = agora();
            let resp: any = null;
            let erro: string | null = null;
            let status: "ok" | "erro" | "timeout" | "cancelado" = "erro";
            if (!(await dono.aindaAtivo()))
              return {
                item,
                status: "cancelado" as const,
                erro: "Teste interrompido antes do envio.",
                latencia: 0,
                conversaId: null,
                ferramentas: [],
                inputTokens: 0,
                outputTokens: 0,
                chamadas: 0,
                retries: 0,
              };
            const baseline = (Array.isArray(inicial.preflight) ? inicial.preflight : []).find(
              (b: any) => b.leadId === item.leadId,
            );
            const { data: leadAtual, error: erroLead } = await e.admin
              .from("nina_teste_leads")
              .select("id, sessao_seq")
              .eq("clinica_id", e.clinicaId)
              .eq("id", item.leadId)
              .maybeSingle();
            if (erroLead)
              throw new Error(`Não foi possível confirmar a sessão do lead: ${erroLead.message}`);
            if (
              !baseline ||
              baseline.runId !== inicial.id ||
              !Number.isInteger(baseline.sessao) ||
              !leadAtual ||
              Number(leadAtual.sessao_seq) !== baseline.sessao
            )
              throw new Error(
                `Lead ${item.leadIndice}: a sessão mudou ou não possui baseline. O roteiro foi encerrado; prepare um novo teste.`,
              );
            try {
              // Não usa Promise.race: timeout de espera não cancela a Nina.
              // O lease continua sendo renovado até o processador realmente terminar.
              resp = await e.processar(
                {
                  clinicaId: e.clinicaId,
                  leadId: item.leadId,
                  tipo: "text",
                  texto: item.mensagem,
                  chave: chaveMensagemCarga(inicial.id, item.indice),
                },
                e.userId,
              );
              if (resp?.erro) {
                erro = String(resp.erro).slice(0, 500);
                status = "erro";
              } else if (resp?.processamento === "ERRO" || resp?.mensagemPersistida === false) {
                erro = "O processador não confirmou a mensagem de teste.";
                status = "erro";
              } else if (
                resp?.duplicada ||
                ["DUPLICADA", "AGRUPADA", "SEM_RESPOSTA"].includes(String(resp?.processamento)) ||
                !resp?.reply
              ) {
                status = "cancelado";
                erro = `Processamento ${String(resp?.processamento ?? "sem resposta")}: nenhuma nova resposta foi comprovada; a mensagem não será reenviada.`;
              } else status = "ok";
            } catch (err) {
              throw new Error(
                `Falha técnica do processador: ${String(err instanceof Error ? err.message : err).slice(0, 450)}`,
              );
            }
            const latencia = agora() - t0;
            if (latencia > config.timeoutS * 1000) {
              status = "timeout";
              erro = `A execução terminou após o limite de ${config.timeoutS}s. A mensagem não foi reenviada.`;
            }
            // Vínculo exato com a execução devolvida. Nunca usa a última execução do lead.
            let exec: any = null;
            const semChamada =
              resp?.duplicada ||
              ["DUPLICADA", "AGRUPADA", "SEM_RESPOSTA"].includes(String(resp?.processamento));
            if (resp?.execucaoId && !semChamada) {
              const { data, error } = await e.admin
                .from("nina_execucoes")
                .select(
                  "id, conversation_id, model, tool_calls, input_tokens, output_tokens, retries",
                )
                .eq("clinica_id", e.clinicaId)
                .eq("id", resp.execucaoId)
                .maybeSingle();
              if (error) throw new Error(`Falha ao ler a execução vinculada: ${error.message}`);
              if (!data || (resp.conversaId && data.conversation_id !== resp.conversaId))
                throw new Error(
                  "A execução devolvida não tem vínculo confirmado com a conversa da mensagem.",
                );
              exec = data;
            }
            return {
              item,
              status,
              erro,
              latencia,
              conversaId: resp?.conversaId ?? null,
              ferramentas: Array.isArray(exec?.tool_calls) ? (exec.tool_calls as string[]) : [],
              inputTokens: Number(exec?.input_tokens ?? 0),
              outputTokens: Number(exec?.output_tokens ?? 0),
              chamadas: exec ? 1 : 0,
              retries: Number(exec?.retries ?? 0),
            };
          }),
        );
        // Uma falha em telemetria/sessão não solta o lease enquanto outro lead continua.
        const falhasTecnicas = encerradas.flatMap((r, i) =>
          r.status === "rejected"
            ? [
                {
                  item: rodada[i]!,
                  erro: String(r.reason instanceof Error ? r.reason.message : r.reason).slice(
                    0,
                    500,
                  ),
                },
              ]
            : [],
        );
        // Preserva os resultados comprovados dos outros leads mesmo se uma leitura falhar.
        // Sem execução vinculada, nenhuma chamada/token é presumido para o item afetado.
        const resultados = encerradas.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : {
                item: rodada[i]!,
                status: "erro" as const,
                erro: String(r.reason instanceof Error ? r.reason.message : r.reason).slice(0, 500),
                latencia: Math.max(0, agora() - t0Rodada),
                conversaId: null,
                ferramentas: [] as string[],
                inputTokens: 0,
                outputTokens: 0,
                chamadas: 0,
                retries: 0,
              },
        );
        const amostras = resultados.map((r) => ({
          clinica_id: e.clinicaId,
          carga_id: inicial.id,
          indice: r.item.indice,
          lead_id: r.item.leadId,
          lead_indice: r.item.leadIndice,
          conversa_id: r.conversaId,
          cenario: r.item.cenario,
          mensagem: String(r.item.mensagem).slice(0, 300),
          status: r.status,
          tentativa: 1,
          latencia_ms: r.latencia,
          chamadas_modelo: r.chamadas,
          ferramentas: r.ferramentas,
          input_tokens: r.inputTokens,
          output_tokens: r.outputTokens,
          erro: r.erro,
        }));
        const { error } = await e.admin.from("nina_teste_carga_amostras").insert(amostras);
        if (error)
          throw new Error(`Não foi possível registrar o resultado do lote: ${error.message}`);
        enviadas += rodada.length;
        const somar = (campo: "inputTokens" | "outputTokens" | "chamadas" | "retries") =>
          resultados.reduce((n, r) => n + r[campo], 0);
        const salvo = await dono.alterar(
          {
            enviadas,
            sucesso:
              Number(atual.sucesso ?? 0) + resultados.filter((r) => r.status === "ok").length,
            erros: Number(atual.erros ?? 0) + resultados.filter((r) => r.status === "erro").length,
            timeouts:
              Number(atual.timeouts ?? 0) + resultados.filter((r) => r.status === "timeout").length,
            retries: Number(atual.retries ?? 0) + somar("retries"),
            chamadas_modelo: Number(atual.chamadas_modelo ?? 0) + somar("chamadas"),
            ferramentas:
              Number(atual.ferramentas ?? 0) +
              resultados.reduce((n, r) => n + r.ferramentas.length, 0),
            input_tokens: Number(atual.input_tokens ?? 0) + somar("inputTokens"),
            output_tokens: Number(atual.output_tokens ?? 0) + somar("outputTokens"),
          },
          falhasTecnicas.map((r) => r.item.indice),
          new Date(t0Rodada + intervaloRodada).toISOString(),
        );
        if (!salvo) break;
        atual = salvo;
        if (falhasTecnicas.length) throw new Error(falhasTecnicas[0]!.erro);
        if (!(await dono.aindaAtivo())) break;
        if (enviadas >= plano.length) {
          await dono.alterar({
            status: "concluido",
            finalizado_em: new Date(agora()).toISOString(),
          });
          break;
        }
        const pausa = Math.max(0, intervaloRodada - (agora() - t0Rodada));
        if (pausa && agora() - inicioLote + pausa >= ORCAMENTO_LOTE_MS) break;
        if (pausa) await (e.esperar ?? dormir)(pausa);
      }
      if (enviadas >= plano.length && (await dono.aindaAtivo()))
        await dono.alterar({ status: "concluido", finalizado_em: new Date(agora()).toISOString() });
    },
  });
  return retornoCarga(resultado.carga, { ocupado: resultado.ocupado });
}
