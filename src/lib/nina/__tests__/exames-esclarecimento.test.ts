import { describe, expect, test } from "bun:test";
import { trocaDeAssunto } from "../escolha-paciente";
import { pendenciasAPerguntar } from "../perguntas-independentes";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";

// Fase 8 da homologação de 14/10/2026 (exames). Dados fictícios.

describe("correção do exame é troca de pedido (E2)", () => {
  test("confundi os pedidos / não é esse exame", () => {
    expect(
      trocaDeAssunto(
        "pera confundi os pedido. o meu é dopler venoso das pernas, os dois lados. nao é carotida, desculpa",
      ),
    ).toBe(true);
    expect(trocaDeAssunto("Errei o exame, o certo é ultrassom de tireoide.")).toBe(true);
    expect(trocaDeAssunto("Não é esse exame, é o com Doppler.")).toBe(true);
  });

  test("trocar profissional ou se confundir com nomes continua o mesmo pedido", () => {
    expect(trocaDeAssunto("me confundi, raiani e karen: qual delas é a de sabado?")).toBe(false);
    expect(
      trocaDeAssunto(
        "pensando bem quinta cedo com o milton fica melhor pra mim. pode seguir com ele em vez da raisa",
      ),
    ).toBe(false);
    expect(trocaDeAssunto("Quero ver nutricionista em vez da consulta de dermatologia.")).toBe(
      true,
    );
  });
});

const pendente = (termo: string, opcoes: string[] = []): ConhecimentoSessao =>
  ({
    consulta: { termo, tipo_atendimento: "exame_procedimento" },
    referencias: [],
    esclarecimento: {
      tipo: "procedimento",
      pergunta: opcoes.length
        ? `Qual destas você deseja?\n${opcoes.join("\n")}`
        : `Não encontrei "${termo}" no nosso cadastro.`,
      opcoes: opcoes.map((nome, i) => ({ id: String(i), nome })),
    },
  }) as unknown as ConhecimentoSessao;

describe("esclarecimento sem empilhar (E3)", () => {
  test("lista que a resposta já trouxe não é anexada de novo", () => {
    const opcoes = ["USG TIREOIDE", "USG TIREOIDE COM DOPPLER", "USG TIREOIDE INFANTIL"];
    const texto = "Qual delas está no pedido?\n* USG TIREOIDE\n* USG TIREOIDE COM DOPPLER";
    expect(pendenciasAPerguntar(texto, [pendente("tireoide", opcoes)])).toHaveLength(0);
  });

  test("termos criados pela IA ao reformular não viram 'Não encontrei' para o paciente", () => {
    const lista = [
      pendente("enfermagem", ["CURATIVO"]),
      pendente("ferida"),
      pendente("curativo perna"),
    ];
    const restantes = pendenciasAPerguntar("", lista, "nao é no dente, é curativo na perna");
    expect(restantes.map((p) => p.consulta.termo)).toEqual(["curativo perna"]);
    // Sem nenhum termo do paciente, nada some.
    expect(pendenciasAPerguntar("", lista, "oi")).toHaveLength(3);
  });
});
