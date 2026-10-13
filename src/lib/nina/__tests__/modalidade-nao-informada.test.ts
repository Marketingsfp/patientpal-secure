import { describe, expect, test } from "bun:test";
import {
  corrigirModalidadeNaoConsta,
  REGRA_MODALIDADE_NAO_INFORMADA,
  TEXTO_MODALIDADE_PELA_EQUIPE,
} from "../modalidade-nao-informada";
import { publicadoDoAtendimento } from "../catalogo-estrutura";
import { orientacaoModalidade } from "../modalidade-atendimento";
import { REGRA_AGENDAMENTO_POR_ITEM, REGRA_TRANSICAO_AGENDAMENTO } from "../transicao-agendamento";

const atendimento = (modalidade: "hora_marcada" | null) => ({
  id: "c",
  nome: "CONSULTA",
  especialidade: "ORTOPEDIA",
  modalidade,
  horarios: [],
  executantes: [],
  precos: [],
});

describe("modalidade não informada: quem informa é a equipe", () => {
  test("troca a frase de 'não consta no sistema' e mantém o resto", () => {
    const texto =
      "A modalidade exata de atendimento da Dra. Paciente Teste (se é por hora marcada ou por ordem de chegada) não consta no nosso sistema.\nNossa equipe humana pode verificar para você como funciona a agenda dela no sábado.";
    const r = corrigirModalidadeNaoConsta(texto);
    expect(r).toBe(
      `${TEXTO_MODALIDADE_PELA_EQUIPE}\nNossa equipe humana pode verificar para você como funciona a agenda dela no sábado.`,
    );
    expect(r).not.toMatch(/não consta/);
  });

  test("outras variações de ausência também são trocadas, uma vez só", () => {
    expect(
      corrigirModalidadeNaoConsta(
        "Não tenho essa informação sobre a ordem de chegada. A forma de atendimento não está cadastrada. Atendemos aos sábados.",
      ),
    ).toBe(`${TEXTO_MODALIDADE_PELA_EQUIPE} Atendemos aos sábados.`);
  });

  test("texto sem ausência de modalidade fica intacto", () => {
    const t = [
      "Modalidade: Hora marcada. Valor: R$ 120,00.",
      "O valor do exame não consta no cadastro.",
      "Atendimento por ordem de chegada, das 07h às 10h.",
    ];
    for (const texto of t) expect(corrigirModalidadeNaoConsta(texto)).toBe(texto);
  });

  test("a IA recebe 'informada pela equipe' em vez de 'não informada'", () => {
    const sem = publicadoDoAtendimento(atendimento(null) as never);
    const com = publicadoDoAtendimento(atendimento("hora_marcada") as never);
    expect(JSON.stringify(sem)).toContain("informada pela equipe de atendimento");
    expect(JSON.stringify(sem)).not.toContain("Modalidade: não informada");
    expect(JSON.stringify(com)).toContain("Modalidade: Hora marcada");
    expect(orientacaoModalidade("nao_definida")).toContain("nossa equipe de atendimento");
  });

  test("a regra entra nas instruções de agendamento", () => {
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain(REGRA_MODALIDADE_NAO_INFORMADA);
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain(REGRA_MODALIDADE_NAO_INFORMADA);
  });
});
