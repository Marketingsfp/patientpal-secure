import { expect, it } from "bun:test";
import { criarPerguntasDoTurno, comporRespostaParcial } from "../perguntas-independentes";
import {
  conhecimentoDaMesmaSessao,
  normalizarConhecimentoSessao,
  type ConhecimentoSessao,
} from "../confidence/conhecimento-sessao";
import { confirmarItemDaPergunta } from "../identificacao-catalogo";
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
