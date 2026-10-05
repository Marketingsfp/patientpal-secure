import { expect, it } from "bun:test";
import { criarPerguntasDoTurno, comporRespostaParcial } from "../perguntas-independentes";
import {
  conhecimentoDaMesmaSessao,
  normalizarConhecimentoSessao,
  type ConhecimentoSessao,
} from "../confidence/conhecimento-sessao";
import { confirmarItemDaPergunta } from "../identificacao-catalogo";
import type { ResultadoBroker } from "../tool-broker";
import type { ResultadoConhecimento } from "../knowledge-contract";
const pendente = (termo: string): ConhecimentoSessao => ({
  versao: 1,
  clinicaId: "c",
  sessionId: "s",
  consulta: { termo, medico: termo },
  referencias: [{ registro: termo, procedimento: termo, medicoNome: termo, versao: null }],
  esclarecimento: {
    tipo: "procedimento",
    opcoes: [{ id: termo, nome: termo }],
    pergunta: "Você quis dizer " + termo + "?",
  },
  esclarecimentoTentativas: 1,
});
it("mantém perguntas pendentes separadas entre turnos, sem carregar outra clínica ou sessão", () => {
  const turno = criarPerguntasDoTurno(null);
  for (const nome of ["Urologia", "Psiquiatria"])
    turno.registrar({ termo: nome, medico: nome }, pendente(nome), null, false);
  const estado = normalizarConhecimentoSessao(turno.estado(null))!;
  expect(estado.pendenciasIdentificacao).toHaveLength(2);
  expect(conhecimentoDaMesmaSessao(estado, "outra", "s")).toBeNull();
  expect(conhecimentoDaMesmaSessao(estado, "c", "outra")).toBeNull();
  expect(
    confirmarItemDaPergunta(estado, {
      mensagem: "sim",
      historico: [{ role: "assistant", content: estado.esclarecimento!.pergunta }],
    }),
  ).toBeNull();
  const retomada = criarPerguntasDoTurno(estado);
  const args = { termo: "Psiquiatria", medico: "Nome corrigido" };
  const origem = retomada.referencia(args);
  expect(origem?.consulta.termo).toBe("Psiquiatria");
  retomada.registrar(args, { ...pendente("Psiquiatria"), esclarecimento: undefined }, origem, true);
  expect(retomada.estado(null)?.consulta.termo).toBe("Urologia");
  expect(retomada.pendentes).toHaveLength(1);
  expect(retomada.temConfirmadas).toBe(true);
});
it("outra pergunta não consome a tentativa nem apaga a pendência anterior", () => {
  const turno = criarPerguntasDoTurno(pendente("Urologia"));
  const args = { termo: "Psiquiatria", medico: "Antonio", nova_solicitacao: true };
  expect(turno.referencia(args)).toBeNull();
  turno.registrar(args, null, null, true);
  expect(turno.estado(null)?.esclarecimentoTentativas).toBe(1);
  expect(turno.estado(null)?.consulta.termo).toBe("Urologia");
});
it("repetir consulta no mesmo turno não multiplica perguntas", () => {
  const turno = criarPerguntasDoTurno(null);
  for (let i = 0; i < 3; i++) turno.registrar({ termo: "ECG" }, pendente("ECG"), null, false);
  expect(turno.pendentes).toHaveLength(1);
  const resposta = comporRespostaParcial("Consulta confirmada.", turno.pendentes);
  expect(resposta).toContain("Consulta confirmada.");
  expect(resposta.match(/Você quis dizer/g)).toHaveLength(1);
});

it("esclarecimentos com o mesmo texto aparecem uma vez, preservando a resposta independente", () => {
  const p = pendente("ECG");
  const texto = comporRespostaParcial("A consulta de Psiquiatria está confirmada no catálogo.", [p, { ...p, consulta: { termo: "eletrocardiograma" } }]);
  expect(texto.match(/Você quis dizer ECG/g)).toHaveLength(1);
  expect(texto).toContain("Psiquiatria");
});
it("normalização descarta pendências de outra sessão e limita profundidade", () => {
  const p = pendente("ECG");
  const r = normalizarConhecimentoSessao({
    ...p,
    pendenciasIdentificacao: [
      { ...p, sessionId: "outra" },
      { ...p, pendenciasIdentificacao: [p] },
    ],
  })!;
  expect(r.pendenciasIdentificacao).toHaveLength(1);
  expect(r.pendenciasIdentificacao![0]!.pendenciasIdentificacao).toBeUndefined();
});

it("correção explícita não reinicia a tentativa como novo assunto", () => {
  const a = pendente("ECG");
  const turno = criarPerguntasDoTurno(a, "não, é hemograma");
  expect(turno.referencia({ termo: "hemograma", nova_solicitacao: true })).toBe(a);
});

const resultadoExame = (): ResultadoBroker => ({
  ferramenta: "consultar_cadastro", capacidade: "searchKnowledgeBase", fonte: "base_conhecimento",
  success: true, reused: false, appointment_confirmed: false,
  dados: { found: true, knowledge_status: "found", tipo_atendimento: "exame_procedimento",
    records: [{ id: "duo", procedimento: "Densitometria duo energética", preco_cartao: 180 }] },
});
const duvidaExame = (): ConhecimentoSessao => ({ ...pendente("Densitometria coluna lombar e colo de fêmur"),
  consulta: { termo: "Densitometria coluna lombar e colo de fêmur", tipo_atendimento: "exame_procedimento" },
});

it("reformulação preserva qualificadores, não confirma preço e permite confirmação no próximo turno", () => {
  const turno = criarPerguntasDoTurno(null), original = duvidaExame();
  turno.registrar(original.consulta, original, null, false);
  const args = { termo: "Densitometria duo energética", reformula_de: original.consulta.termo };
  expect(turno.referencia(args)).toBeNull(); // não é outra tentativa do paciente
  const dados = turno.reconciliar(args, resultadoExame()).dados as ResultadoConhecimento;
  expect(dados.price).toBeNull();
  expect(dados.esclarecimento?.pergunta).toContain("coluna lombar e colo de fêmur");
  turno.registrar(args, { ...original, consulta: { termo: args.termo },
    referencias: [{ registro: "duo", versao: null, procedimento: "Densitometria duo energética", medicoNome: null }],
    esclarecimento: dados.esclarecimento }, null, false);
  const salvo = normalizarConhecimentoSessao(turno.estado(null))!;
  expect(turno.pendentes).toHaveLength(1);
  expect(turno.temConfirmadas).toBe(false);
  expect(confirmarItemDaPergunta(salvo, { mensagem: "sim", historico: [{ role: "assistant", content: salvo.esclarecimento!.pergunta }] })?.id).toBe("duo");
  const proximo = criarPerguntasDoTurno(salvo, "sim");
  const r = resultadoExame();
  expect(proximo.reconciliar({ termo: args.termo }, r)).toBe(r);
  proximo.registrar({ termo: args.termo }, { ...salvo, esclarecimento: undefined }, proximo.referencia({ termo: args.termo }), true);
  expect(proximo.pendentes).toHaveLength(0);
});

it("não associa por semelhança de nomes, referência inexistente, outro médico ou pedido independente", () => {
  for (const args of [
    { termo: "Densitometria corpo inteiro" },
    { termo: "Densitometria duo energética", reformula_de: "inexistente" },
    { termo: "Densitometria duo energética", reformula_de: duvidaExame().consulta.termo, medico: "Outro médico" },
    { termo: "Densitometria duo energética", reformula_de: duvidaExame().consulta.termo, nova_solicitacao: true },
  ]) {
    const turno = criarPerguntasDoTurno(null), original = duvidaExame(), r = resultadoExame();
    turno.registrar(original.consulta, original, null, false);
    expect(turno.reconciliar(args, r)).toBe(r);
    turno.registrar(args, null, null, true);
    expect(turno.pendentes).toHaveLength(1);
    expect(turno.temConfirmadas).toBe(true);
  }
});

it("conflito oficial e falha técnica não viram hipótese de equivalência", () => {
  const turno = criarPerguntasDoTurno(null), original = duvidaExame();
  turno.registrar(original.consulta, original, null, false);
  const args = { termo: "Densitometria duo energética", reformula_de: original.consulta.termo };
  for (const r of [{ ...resultadoExame(), dados: { knowledge_status: "conflict" } },
    { ...resultadoExame(), success: false, erro: "TIMEOUT" }]) expect(turno.reconciliar(args, r)).toBe(r);
});
