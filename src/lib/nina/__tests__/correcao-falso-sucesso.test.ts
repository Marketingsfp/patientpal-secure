import { describe, expect, test } from "bun:test";
import { mensagemCorrecaoFalsoSucesso } from "../correcao-falso-sucesso";

const rascunho = "Perfeito, reservei a opção de quinta às 15:30. Me informe o nome completo e a data de nascimento.";

describe("correção de reserva afirmada sem gravação", () => {
  test("o rascunho é marcado como não enviado e a nova resposta não pede desculpas", () => {
    const m = mensagemCorrecaoFalsoSucesso(rascunho, "aguardando_dados");
    expect(m).toContain("NÃO foi enviado ao paciente");
    expect(m).toContain(rascunho);
    expect(m).toContain("não peça desculpas");
    expect(m).toContain("Não consulte vagas nem agende");
  });
  test("com horário escolhido e dados pendentes, mantém o pedido dos dados", () => {
    const m = mensagemCorrecaoFalsoSucesso(rascunho, "aguardando_dados");
    expect(m).toContain("continue pedindo os dados");
    expect(m).not.toContain("iniciar coleta de dados");
  });
  test("aguardando confirmação final, não pede novos dados", () => {
    expect(mensagemCorrecaoFalsoSucesso(rascunho, "aguardando_confirmacao")).toContain("não peça novos dados");
  });
  test("sem horário escolhido, a correção não inicia agendamento nem coleta", () => {
    const m = mensagemCorrecaoFalsoSucesso("Já agendei sua consulta.", "sem_escolha");
    expect(m).toContain("não autoriza consultar vagas, agendar nem iniciar coleta de dados");
    expect(m).toContain("Não transforme um pedido de informação em pedido de agendamento");
  });
});
