import { expect, test } from "bun:test";
import { especialidadePorNomePopular } from "../nome-popular-especialidade";
import {
  PEDIR_NOME_ATENDIMENTO,
  PEDIR_NOME_ATENDIMENTO_NEUTRO,
  REGRA_SEM_INDICACAO,
  perguntaNomeAtendimento,
  textoPedirNomeAtendimento,
} from "../atendimento-sem-indicacao";

test.each([
  ["oi qro marca consulta do coracao", "CARDIOLOGIA"],
  ["tem médico do coração?", "CARDIOLOGIA"],
  ["queria um medico de vista", "OFTALMOLOGIA"],
  ["medico de olho pra minha mae", "OFTALMOLOGIA"],
  ["precisa de medico de crianca", "PEDIATRIA"],
  ["qro marca medica de mulher", "GINECOLOGIA"],
  ["doutor de osso", "ORTOPEDIA"],
  ["medico de pele", "DERMATOLOGIA"],
  ["tem medico do pulmao", "PNEUMOLOGIA"],
  ["medico de ouvido", "OTORRINOLARINGOLOGIA"],
  ["médico do estômago", "GASTROENTEROLOGIA"],
  ["medico da prostata", "UROLOGIA"],
  ["medico de idoso pro meu pai", "GERIATRIA"],
  ["tem dentista?", "ODONTOLOGIA"],
])("nome popular é especialidade informada: %s", (msg, esp) => {
  expect(especialidadePorNomePopular(msg)?.especialidade).toBe(esp);
});

test.each([
  "to com dor no peito qual medico eu passo",
  "meu coracao ta acelerado",
  "medico de cabeca",
  "quero uma consulta",
  "dor no osso",
])("sintoma, pedido sem nome ou nome ambíguo não vira especialidade: %s", (msg) => {
  expect(especialidadePorNomePopular(msg)).toBeNull();
});

test("frase sobre sintomas só quando o paciente citou sintoma", () => {
  expect(textoPedirNomeAtendimento("to com dor nas costas qual medico")).toBe(
    PEDIR_NOME_ATENDIMENTO,
  );
  expect(textoPedirNomeAtendimento("quero uma consulta")).toBe(PEDIR_NOME_ATENDIMENTO_NEUTRO);
  expect(PEDIR_NOME_ATENDIMENTO_NEUTRO).not.toMatch(/sintoma/);
  expect(PEDIR_NOME_ATENDIMENTO_NEUTRO).toContain("Se souber o nome do profissional");
});

test("regra e Jev tratam nome popular como nome informado, sem liberar escolha por idade", () => {
  expect(REGRA_SEM_INDICACAO).toContain("Nome popular de especialidade NÃO é sintoma");
  expect(REGRA_SEM_INDICACAO).toContain("sintomas, queixas, idade ou diagnóstico");
  expect(JSON.stringify(perguntaNomeAtendimento())).toContain("médico/consulta do coração");
});
