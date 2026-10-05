import { expect, test } from "bun:test";
import { estadoVazio, normalizarEstado } from "../fluxo-estado-normalizar";
import { selecionarVagaValidada, type VagaAgendamento } from "../agendamento-escolha";
import { pendenciaBloqueiaFerramenta } from "../perguntas-independentes";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";
import { protegerEfeitosDaResposta } from "../resposta/efeitos-confirmados";

const vaga: VagaAgendamento = { medico_id:"isis", medico:"Isis Serrano Duarte", procedimento:"USG ABDOMINAL TOTAL",
  catalogo_id:"usg", tipo_atendimento:"exame_procedimento", data:"2026-10-06", hora:"08:00",
  inicio:"2026-10-06T08:00:00-03:00", fim:"2026-10-06T08:10:00-03:00", modalidade:"hora_marcada", agenda_id:"a" };
const pendencia: ConhecimentoSessao = { versao:1, clinicaId:"c", sessionId:"s",
  consulta:{termo:"hemograma",tipo_atendimento:"exame_procedimento"},
  referencias:[], esclarecimento:{tipo:"procedimento",pergunta:"Qual hemograma?",opcoes:[{id:"hemograma",nome:"HEMOGRAMA COMPLETO"}]} };
function estado() {
  const e = estadoVazio(); e.session_id="s"; selecionarVagaValidada(e,"c",vaga,"Resumo entregue");
  return normalizarEstado(JSON.parse(JSON.stringify(e)));
}
test("hemograma não bloqueia a operação exatamente vinculada ao ultrassom", () => {
  const e=estado();
  expect(pendenciaBloqueiaFerramenta("agendar",{medico_id:"isis",inicio:vaga.inicio,fim:vaga.fim,procedimento:vaga.procedimento},[pendencia],e,"c")).toBe(false);
  expect(pendenciaBloqueiaFerramenta("verificar_horario",{medico_id:"isis",data:vaga.data,hora:vaga.hora},[pendencia],e,"c")).toBe(false);
  expect(e.appointment.confirmation?.aceita).toBe(false); // liberar o broker não concede consentimento
});
test("pendência do mesmo atendimento, sem identidade ou de outra sessão continua bloqueando", () => {
  for (const p of [
    {...pendencia,consulta:{termo:vaga.procedimento!}},
    {...pendencia,referencias:[{registro:"usg",versao:null,procedimento:vaga.procedimento,medicoNome:null}]},
    {...pendencia,esclarecimento:{...pendencia.esclarecimento!,opcoes:[]}},
    {...pendencia,sessionId:"outra"},
  ]) expect(pendenciaBloqueiaFerramenta("agendar",{},[p],estado(),"c")).toBe(true);
  expect(pendenciaBloqueiaFerramenta("agendar",{},[pendencia],estadoVazio(),"c")).toBe(true);
});
test("liberação não permite trocar médico/horário/procedimento", () => {
  for (const args of [{medico_id:"outro"},{hora:"09:00"},{inicio:"2026-10-07T08:00:00-03:00"},{procedimento:"TSH"}])
    expect(pendenciaBloqueiaFerramenta("agendar",args,[pendencia],estado(),"c")).toBe(true);
  expect(pendenciaBloqueiaFerramenta("solicitar_atendente_humano",{},[pendencia],estado(),"c")).toBe(true);
});
test("sessão 670: não anuncia transferência fictícia nem chama bloqueio de instabilidade", () => {
  const r=protegerEfeitosDaResposta("A Dra. Isis é para o ultrassom.\n\nNo momento, tive uma instabilidade técnica no sistema ao processar a reserva.\n\nVou encaminhar você agora para a nossa equipe.\n\nUm momento, por favor!",{handoffConfirmado:false,bloqueioIdentificacao:true});
  expect(r.texto).toContain("A Dra. Isis é para o ultrassom.");
  expect(r.texto).not.toContain("instabilidade"); expect(r.texto).not.toContain("Vou encaminhar");
  expect(r.texto).toContain("ainda não foi realizado");
});
test("preserva transferência confirmada, pergunta e negativa verdadeira", () => {
  for(const texto of ["Posso encaminhar você?", "Não consegui encaminhar você.", "Seu agendamento não foi concluído."])
    expect(protegerEfeitosDaResposta(texto,{handoffConfirmado:false,bloqueioIdentificacao:false}).texto).toBe(texto);
  const texto="Vou encaminhar você para a equipe.";
  expect(protegerEfeitosDaResposta(texto,{handoffConfirmado:true,bloqueioIdentificacao:false}).texto).toBe(texto);
});
