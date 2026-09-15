import { POLITICA_WATCHDOG } from "./watchdog";
/** Transporte canônico da Nina, reutilizado pelo webhook e pela retomada de lotes. */
import {
  carregarControleWatchdog,
  gerarComCheckpointNina,
  finalizarTextoComCheckpointNina,
  vincularSaidaWatchdogNina,
  entregarComCheckpointNina,
  finalizarWatchdogNina,
  ErroEntregaWatchdog,
  type ControleWatchdogNina,
} from "./watchdog.server";
import { criarGuardiaoReservaTurno } from "./reserva-turno";
import { gerarRespostaNina, metaSendText, type WhatsAppConfigRow } from "../whatsapp.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { estadoConversaPorTelefone, ninaPodeResponder } from "../atendimento/handoff.server";

export type EntradaRespostaWhatsappNina = {
  clinicaId: string;
  cfg: WhatsAppConfigRow & { access_token: string };
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  webhookPhoneNumberId?: string | null;
  from: string;
  fromDigits: string;
  convId: string | null;
  msgInserida: { id: string };
  textoPaciente: string;
  audioFalhou: boolean;
  ehAudio: boolean;
  tipo: string;
  retomada?: import("./burst.server").TurnoNina;
};

export async function processarRespostaWhatsappNina(entrada: EntradaRespostaWhatsappNina) {
  const {
    cfg,
    phoneNumberId,
    displayPhoneNumber,
    webhookPhoneNumberId,
    from,
    fromDigits,
    convId,
    msgInserida,
    textoPaciente,
    audioFalhou,
    ehAudio,
    tipo,
  } = entrada;
  const params = { clinicaId: entrada.clinicaId };
  let resultado: string | undefined;
  async function registrarStatusWhatsapp(clinicaId: string, ok: boolean, erro?: string) {
    await supabaseAdmin
      .from("whatsapp_configs")
      .update({
        ultimo_teste_em: new Date().toISOString(),
        ultimo_teste_ok: ok,
        ultimo_teste_erro: ok ? null : (erro ?? "Falha de envio").slice(0, 500),
      })
      .eq("clinica_id", clinicaId);
  }
  // FASE 3 — a trava da conversa vale por TODO o turno e é
  // solta no finally, inclusive quando a execução falha.
  let loteId = "";
  let controle: ControleWatchdogNina | null = null;
  let erroProcessamento: unknown;
  let lockTurno: import("@/lib/nina/lock-conversa.server").LockConversa | null = null;
  let execTurno: string | null = null;
  let revisaoTurno = 0;
  let turnoSuperseded = false;
  const conferirReservaTurno = criarGuardiaoReservaTurno(async () => {
    if (!lockTurno) return true;
    const { validarReservaTurnoNina } = await import("@/lib/nina/burst.server");
    return validarReservaTurnoNina(lockTurno);
  });
  try {
    if (!phoneNumberId) {
      throw new Error(
        "WhatsApp não configurado: Phone Number ID ausente na configuração e no webhook da Meta.",
      );
    }
    const { RESPOSTA_AUDIO_FALHOU, respostaMidiaNaoSuportada } =
      await import("@/lib/whatsapp-midia.server");
    let reply = "";
    // FASE 5 — contrato do resultado deste turno. Todo texto
    // passa pela finalização antes de ser avaliado e enviado.
    const { criarResultado } = await import("@/lib/nina/resposta/contrato");
    let resultadoTurno: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina | null = null;
    // Auditoria: id da execução que produziu esta resposta.
    // `traceId` é o identificador do turno (FASE 1): preenchido
    // por `gerarRespostaNina` e usado para ligar a mensagem
    // entregue ao registro da execução.
    const auditoriaNina: {
      execucaoId?: string | null;
      traceId?: string | null;
      // FASE 5 — snapshot da avaliação final do texto enviado.
      decisaoId?: string | null;
      textoFinalHash?: string | null;
      // FASE 6 — avalia o conteúdo preparado para fala quando
      // ele difere do texto avaliado (resumo falado).
      avaliarRepresentacao?: (
        texto: string,
        representacao: "audio_integral" | "audio_resumo",
      ) => Promise<{ decisaoId: string | null; textoHash: string | null } | null>;
    } = {};

    // Mensagens de entrada reais desta resposta. O paciente pode
    // ter escrito em partes: pegamos as mensagens dele ainda sem
    // resposta, na ordem em que chegaram.
    // O registro atômico do lote é a fonte dos IDs, não uma
    // consulta de mensagens antigas feita antes de aguardar a trava.
    const entradasNina: string[] = msgInserida.id ? [msgInserida.id] : [];
    // FASE 2 — Burst Aggregation: mensagens seguidas do mesmo
    // paciente viram UM turno lógico para a Nina. A mensagem já
    // foi persistida e publicada no Realtime acima; aqui só a
    // decisão da IA espera a quiet window.
    let entradasTurno = entradasNina;
    if (textoPaciente) {
      const { aguardarTurnoNina } = await import("@/lib/nina/burst.server");
      const turno =
        entrada.retomada ??
        (await aguardarTurnoNina({
          clinicaId: params.clinicaId,
          telefone: fromDigits || from,
          conversaId: convId,
          mensagemId: (msgInserida as { id?: string } | null)?.id ?? null,
          textoAtual: textoPaciente,
        }));
      if (!turno) {
        // Uma mensagem mais nova do mesmo paciente assume o
        // turno: esta invocação encerra sem responder.
        const { registrarTurnoSemModelo } = await import("@/lib/nina/rastreio/turno.server");
        await registrarTurnoSemModelo({
          clinicaId: params.clinicaId,
          conversaId: convId,
          mensagensEntrada: entradasNina,
          origem: "nenhuma",
          motivo: "turno assumido por mensagem mais nova (agrupamento)",
        });
        return { agrupada: true };
      }
      loteId = turno.batchId;
      lockTurno = turno.lock;
      revisaoTurno = turno.revisao;
      controle = await carregarControleWatchdog(turno);
      if (turno.mensagens.length) entradasTurno = turno.mensagens;
      reply = await gerarComCheckpointNina(controle, auditoriaNina, () =>
        gerarRespostaNina(params.clinicaId, turno.texto, from, {
          validarReservaTurno: conferirReservaTurno,
          auditoria: auditoriaNina,
          mensagensEntrada: entradasTurno,
          lote: { batchId: turno.batchId || null, revisao: turno.revisao || null },
          revisao: turno.revisao
            ? { telefone: fromDigits || from, valor: turno.revisao }
            : undefined,
        }),
      );
      execTurno = auditoriaNina.execucaoId ?? null;
      // Instrumentação mínima para métricas: marca quais
      // mensagens recebidas foram realmente processadas por
      // esta execução. Não altera decisão, resposta ou fluxo.
      if (auditoriaNina.execucaoId && entradasTurno.length) {
        try {
          await supabaseAdmin
            .from("whatsapp_mensagens")
            .update({ execucao_id: auditoriaNina.execucaoId })
            .in("id", entradasTurno)
            .is("execucao_id", null);
        } catch (e) {
          console.error("[nina] marcação de execução na entrada falhou", e);
        }
      }
    } else if (audioFalhou) {
      const { CHAVE_TEMPLATE_AUDIO_FALHOU } = await import("@/lib/whatsapp-midia.server");
      resultadoTurno = criarResultado({
        origem: "midia",
        texto: RESPOSTA_AUDIO_FALHOU,
        chaveTemplate: CHAVE_TEMPLATE_AUDIO_FALHOU,
      });
      reply = resultadoTurno.texto;
    } else {
      const { chaveTemplateMidia } = await import("@/lib/whatsapp-midia.server");
      resultadoTurno = criarResultado({
        origem: "midia",
        texto: respostaMidiaNaoSuportada(tipo),
        chaveTemplate: chaveTemplateMidia(tipo),
      });
      reply = resultadoTurno.texto;
    }
    // Gate de identificação: o contrato veio junto da geração.
    if (!resultadoTurno) {
      const doGate = (
        auditoriaNina as {
          resultado?: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina;
        }
      ).resultado;
      if (doGate) resultadoTurno = doGate;
    }

    // O protocolo pode ter entregue o aviso durante a geração.
    // Respeitar o desfecho antes de finalizar, sintetizar ou enviar.
    if (resultadoTurno?.estado === "descartar") reply = "";

    // Revalida o dono ANTES de enviar: um atendente pode ter
    // assumido enquanto o modelo pensava. Nesse caso, a resposta
    // é descartada para o paciente não receber IA e humano juntos.
    if (reply && from) {
      const agora = await estadoConversaPorTelefone(params.clinicaId, from);
      if (!ninaPodeResponder(agora)) {
        reply = "";
        // FASE 1 — atendente assumiu durante a geração.
        const { registrarTurnoSemModelo } = await import("@/lib/nina/rastreio/turno.server");
        await registrarTurnoSemModelo({
          ...(auditoriaNina.traceId ? { turnoId: auditoriaNina.traceId } : {}),
          clinicaId: params.clinicaId,
          conversaId: convId,
          mensagensEntrada: entradasNina,
          batchId: loteId || null,
          revisaoConversa: revisaoTurno || null,
          origem: "nenhuma",
          motivo: "atendente humano assumiu a conversa antes do envio",
        });
      }
    }

    // FASE 5 — FINALIZAÇÃO ÚNICA: saudação, banner de handoff,
    // erro, mídia e despedida passam pelo mesmo serviço antes
    // da avaliação final e do envio. O transporte manda o texto
    // aprovado, sem acrescentar nada depois.
    let encerrarConversaId: string | null = null;
    if (reply && lockTurno) {
      await conferirReservaTurno();
    }
    if (reply) {
      try {
        const { finalizarResposta } = await import("@/lib/nina/resposta/finalizacao.server");
        const base = resultadoTurno ?? criarResultado({ origem: "modelo", texto: reply });
        const chaveTurnoEnvio =
          auditoriaNina.traceId ??
          loteId ??
          `${params.clinicaId}|${from}|${(msgInserida as { id?: string } | null)?.id ?? ""}`;
        // FASE 4 — o transporte envia a ÚLTIMA versão aprovada
        // do turno. Se o texto que chegou aqui já é essa
        // aprovação, a finalização apenas a devolve; uma
        // correção nunca é desfeita por um candidato antigo.
        const finalizada = await finalizarTextoComCheckpointNina(controle, () =>
          finalizarResposta({
            clinicaId: params.clinicaId,
            canal: "whatsapp",
            chaveTurno: chaveTurnoEnvio,
            chaveTurnoRaiz: chaveTurnoEnvio,
            conversaId: convId,
            telefone: from,
            mensagemPaciente: textoPaciente || null,
            resultado: { ...base, texto: reply },
            avaliarEncerramento: Boolean(textoPaciente),
          }),
        );
        reply = finalizada.texto;
        encerrarConversaId = finalizada.encerrarConversaId;
      } catch (e) {
        if (controle) throw e;
        console.error("[nina] finalização da resposta falhou", e);
      }
    }
    // FASE 4 — antes de QUALQUER envio: a resposta ainda vale?
    if (reply && revisaoTurno) {
      const { respostaObsoleta } = await import("@/lib/nina/revisao-conversa.server");
      const obsoleta = await respostaObsoleta({
        clinicaId: params.clinicaId,
        telefone: fromDigits || from,
        revisaoProcessada: revisaoTurno,
      });
      if (obsoleta) {
        // Chegou mensagem nova durante a geração: a resposta
        // antiga é descartada e o próximo lote reprocessa com
        // o contexto completo.
        console.warn("[nina] resposta obsoleta descartada", {
          revisao_processada: revisaoTurno,
          lote: loteId || null,
        });
        turnoSuperseded = true;
        reply = "";
        // FASE 1 — o turno existiu e não entregou nada: fica
        // registrado com o motivo, sem inventar uma entrega.
        const { registrarTurnoSemModelo } = await import("@/lib/nina/rastreio/turno.server");
        await registrarTurnoSemModelo({
          ...(auditoriaNina.traceId ? { turnoId: auditoriaNina.traceId } : {}),
          clinicaId: params.clinicaId,
          conversaId: convId,
          mensagensEntrada: entradasNina,
          batchId: loteId || null,
          revisaoConversa: revisaoTurno || null,
          origem: "nenhuma",
          motivo: "resposta descartada por revisão obsoleta da conversa",
        });
      }
    }
    if (reply) {
      // Paciente mandou áudio → Nina responde falando (se a
      // clínica não desligou). Qualquer falha cai para texto.
      let audioEnviado = false;
      let precisaTextoCompleto = true;
      if (ehAudio && cfg.access_token) {
        try {
          const {
            respostaAudioDesativada,
            prepararParaFala,
            pareceLista,
            resumoFalado,
            sintetizarFala,
            LIMITE_FALA_CURTA,
          } = await import("@/lib/nina-audio.server");
          if (!(await respostaAudioDesativada(params.clinicaId))) {
            const longa = reply.length > LIMITE_FALA_CURTA || pareceLista(reply);
            const falado = longa ? resumoFalado(reply) : prepararParaFala(reply);
            const audio = await sintetizarFala(falado);
            if (audio) {
              const { metaUploadMedia, metaSendAudio } = await import("@/lib/whatsapp.server");
              await conferirReservaTurno();
              const mediaId = await metaUploadMedia(
                phoneNumberId,
                cfg.access_token,
                audio.bytes,
                audio.mime,
                `nina.${audio.ext}`,
              );
              // O áudio é OUTRA representação: quando é resumo
              // falado, o conteúdo difere do texto avaliado e
              // recebe o seu próprio registro.
              const representacaoAudio = longa
                ? ("audio_resumo" as const)
                : ("audio_integral" as const);
              const { registrarEntregaSaida } = await import("@/lib/nina/confidence-engine.server");
              const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
              const hashFalado = hashDoTexto(falado);
              // Conteúdo falado diferente do texto avaliado =>
              // avaliação PRÓPRIA. Sem ela, o áudio fica sem
              // nota; nunca herda a nota do texto completo.
              const { falaPrecisaDeAvaliacaoPropria } =
                await import("@/lib/nina/confidence/identidade-saida");
              const precisa = falaPrecisaDeAvaliacaoPropria({
                textoAvaliadoHash: auditoriaNina.textoFinalHash,
                conteudoFalado: falado,
              }).precisa;
              const decisaoAudio = precisa
                ? ((await auditoriaNina.avaliarRepresentacao?.(falado, representacaoAudio)) ?? null)
                : { decisaoId: auditoriaNina.decisaoId ?? null, textoHash: hashFalado };
              const decisaoIdAudio = decisaoAudio?.decisaoId ?? null;
              await registrarEntregaSaida({
                clinicaId: params.clinicaId,
                decisaoId: decisaoIdAudio,
                execucaoId: auditoriaNina.execucaoId ?? null,
                conversaId: convId,
                representacao: representacaoAudio,
                estado: "envio_tentado",
                textoHash: hashFalado,
              });
              await conferirReservaTurno();
              const envioAudio = controle
                ? await entregarComCheckpointNina(
                    controle,
                    {
                      texto: "🎤 " + falado,
                      tipo: "audio",
                      integral: !longa,
                      canal: "whatsapp",
                      from: displayPhoneNumber,
                      transcricao: falado,
                      mime: audio.mime,
                      mediaId,
                      execucaoId: auditoriaNina.execucaoId,
                    },
                    () =>
                      metaSendAudio(phoneNumberId, cfg.access_token, from, mediaId, {
                        timeoutMs: POLITICA_WATCHDOG.entregaTimeoutMs,
                      }),
                  )
                : {
                    ...(await metaSendAudio(phoneNumberId, cfg.access_token, from, mediaId)),
                    mensagemId: null,
                  };
              const audioId = envioAudio.wa_message_id;
              const { data: msgAudio, error: erroAudio } = envioAudio.mensagemId
                ? { data: { id: envioAudio.mensagemId }, error: null }
                : await supabaseAdmin
                    .from("whatsapp_mensagens")
                    .insert({
                      clinica_id: params.clinicaId,
                      wa_message_id: audioId,
                      conversa_id: convId,
                      direction: "out",
                      from_number: displayPhoneNumber,
                      to_number: from,
                      body: `🎤 ${falado}`,
                      tipo: "audio",
                      transcricao: falado,
                      media_mime: audio.mime,
                      status: "sent",
                      enviada_por: "nina",
                      execucao_id: auditoriaNina.execucaoId ?? null,
                    })
                    .select("id")
                    .maybeSingle();
              if (erroAudio) {
                console.error("[nina] falha ao gravar áudio enviado", erroAudio);
              }
              // Confirmada só porque a Meta devolveu id da
              // mensagem — não pela simples existência da linha.
              await registrarEntregaSaida({
                clinicaId: params.clinicaId,
                decisaoId: decisaoIdAudio,
                execucaoId: auditoriaNina.execucaoId ?? null,
                conversaId: convId,
                outgoingMessageId: (msgAudio as { id?: string } | null)?.id ?? null,
                representacao: representacaoAudio,
                estado: audioId ? "confirmada" : "falhou",
                textoHash: hashFalado,
                transporteId: audioId ?? null,
              });
              if (!loteId && !longa && msgAudio?.id && audioId)
                await vincularSaidaWatchdogNina(msgInserida.id, msgAudio.id);
              audioEnviado = true;
              precisaTextoCompleto = longa;
            }
          }
        } catch (e) {
          if ((e as { codigo?: string })?.codigo === "NINA_RESERVA_TURNO_PERDIDA") throw e;
          if (e instanceof ErroEntregaWatchdog) throw e;
          console.error("Nina resposta em áudio falhou (caindo para texto)", e);
        }
      }

      if (!audioEnviado || precisaTextoCompleto) {
        const { registrarEntregaSaida } = await import("@/lib/nina/confidence-engine.server");
        const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
        const hashEnviado = hashDoTexto(reply);
        // A nota pertence ao texto avaliado. Texto entregue
        // diferente (aviso controlado, mensagem de sistema) sai
        // SEM nota, em vez de herdar a de outro conteúdo.
        const mesmoTextoAvaliado =
          Boolean(auditoriaNina.textoFinalHash) && auditoriaNina.textoFinalHash === hashEnviado;
        const vinculoBase = {
          clinicaId: params.clinicaId,
          decisaoId: mesmoTextoAvaliado ? (auditoriaNina.decisaoId ?? null) : null,
          vincularAvaliacao: mesmoTextoAvaliado,
          execucaoId: auditoriaNina.execucaoId ?? null,
          conversaId: convId,
          representacao: "texto_completo" as const,
          textoHash: hashEnviado,
        };
        // O hash do texto que sai é comparável ao avaliado: se
        // divergir, o registro mostra isso em vez de esconder.
        await registrarEntregaSaida({
          ...vinculoBase,
          estado: "envio_tentado",
          detalhe: {
            hash_avaliado: auditoriaNina.textoFinalHash ?? null,
            confere: mesmoTextoAvaliado,
            avaliada: mesmoTextoAvaliado,
          },
        });
        let outId: string | null = null;
        let saidaPersistida: string | null = null;
        try {
          await conferirReservaTurno();
          if (controle) {
            const envio = await entregarComCheckpointNina(
              controle,
              {
                texto: reply,
                tipo: "text",
                canal: "whatsapp",
                from: displayPhoneNumber,
                execucaoId: auditoriaNina.execucaoId,
              },
              () =>
                metaSendText(phoneNumberId, cfg.access_token, from, reply, {
                  timeoutMs: POLITICA_WATCHDOG.entregaTimeoutMs,
                }),
            );
            outId = envio.wa_message_id;
            saidaPersistida = envio.mensagemId;
          } else {
            ({ wa_message_id: outId } = await metaSendText(
              phoneNumberId,
              cfg.access_token,
              from,
              reply,
            ));
          }
        } catch (e) {
          await registrarEntregaSaida({
            ...vinculoBase,
            estado: "falhou",
            detalhe: { erro: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }
        const { data: msgOut, error: erroMsgOut } = saidaPersistida
          ? { data: { id: saidaPersistida }, error: null }
          : await supabaseAdmin
              .from("whatsapp_mensagens")
              .insert({
                clinica_id: params.clinicaId,
                wa_message_id: outId,
                conversa_id: convId,
                direction: "out",
                from_number: displayPhoneNumber,
                to_number: from,
                body: reply,
                tipo: "text",
                status: "sent",
                enviada_por: "nina",
                execucao_id: auditoriaNina.execucaoId ?? null,
              })
              .select("id")
              .maybeSingle();
        if (erroMsgOut) {
          console.error("[nina] falha ao gravar mensagem enviada", erroMsgOut);
        }
        if (!loteId && msgOut?.id && outId)
          await vincularSaidaWatchdogNina(msgInserida.id, msgOut.id);
        // Entregue = a Meta devolveu identificador de transporte.
        await registrarEntregaSaida({
          ...vinculoBase,
          outgoingMessageId: (msgOut as { id?: string } | null)?.id ?? null,
          estado: outId ? "confirmada" : "falhou",
          transporteId: outId,
        });

        // FASE 1 — liga o turno à mensagem realmente entregue.
        try {
          const { gravarEntregaDoTurno } = await import("@/lib/nina/rastreio/turno.server");
          await gravarEntregaDoTurno({
            clinicaId: params.clinicaId,
            turnoId: auditoriaNina.traceId ?? null,
            execucaoId: auditoriaNina.execucaoId ?? null,
            conversaId: convId,
            outgoingMessageId: (msgOut as { id?: string } | null)?.id ?? null,
            canal: "whatsapp",
            // Só estados comprovados: transporte confirmado
            // pela Meta (outId) ou apenas gravado.
            estado: outId
              ? "confirmada"
              : (msgOut as { id?: string } | null)?.id
                ? "persistida"
                : "falhou",
            transporteId: outId ?? null,
          });
        } catch {
          // Rastreabilidade nunca interrompe o atendimento.
        }
      }

      // Envio confirmado: agora sim a conversa é resolvida pelo
      // MESMO mecanismo do botão "Resolver". Falha de envio nunca
      // chega aqui (a exceção sobe), então não existe conversa
      // resolvida sem mensagem final entregue.
      if (encerrarConversaId) {
        try {
          const { resolverConversaPelaNina } =
            await import("@/lib/nina/encerramento-automatico.server");
          await resolverConversaPelaNina({
            clinicaId: params.clinicaId,
            conversaId: encerrarConversaId,
          });
        } catch (e) {
          console.error("[nina] falha ao resolver conversa automaticamente", e);
        }
      }

      // Espera do paciente: só abre prazo quando a Nina fez
      // uma pergunta necessária para continuar. Informação
      // simples ou despedida não liga relógio nenhum.
      if (!encerrarConversaId) {
        try {
          const { registrarEsperaPorTelefone } = await import("@/lib/nina/espera-paciente.server");
          await registrarEsperaPorTelefone({
            clinicaId: params.clinicaId,
            telefone: from,
            resposta: reply,
          });
        } catch (e) {
          console.error("nina espera paciente error", e);
        }
      }

      if (webhookPhoneNumberId && webhookPhoneNumberId !== cfg.phone_number_id) {
        await supabaseAdmin
          .from("whatsapp_configs")
          .update({
            phone_number_id: webhookPhoneNumberId,
            display_phone_number: displayPhoneNumber,
            ultimo_teste_em: new Date().toISOString(),
            ultimo_teste_ok: true,
            ultimo_teste_erro: null,
          })
          .eq("clinica_id", params.clinicaId);
      }
    }
  } catch (e) {
    erroProcessamento = e;
    const { ErroAgrupamentoNina } = await import("@/lib/nina/agrupamento-turno");
    if (e instanceof ErroAgrupamentoNina && e.podeRepetirEntrada) {
      resultado = `pendente: ${e.message}`.slice(0, 500);
      // Nenhum modelo/ferramenta iniciou: a Meta pode repetir o
      // evento, reutilizando a entrada e o lote persistidos.
      return { pendente: true, resultado };
    }
    if ((e as { codigo?: string })?.codigo === "NINA_RESERVA_TURNO_PERDIDA") {
      turnoSuperseded = true;
      resultado = "reserva_perdida_sem_reenvio";
    }
    console.error("Nina autoreply error", e);
    await registrarStatusWhatsapp(params.clinicaId, false, String((e as Error)?.message ?? e));
  } finally {
    try {
      await finalizarWatchdogNina(controle, erroProcessamento);
    } catch (e) {
      console.error("[nina] conclusão durável pendente", e);
    }
    if (loteId || lockTurno) {
      try {
        const { concluirTurnoNina } = await import("@/lib/nina/burst.server");
        await concluirTurnoNina(
          loteId,
          execTurno,
          lockTurno,
          turnoSuperseded ? "SUPERSEDED" : "PROCESSED",
        );
      } catch (e) {
        console.error("[nina] encerramento do turno falhou", e);
      }
    }
  }
  return { resultado };
}
