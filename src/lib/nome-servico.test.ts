import { describe, expect, test } from "bun:test";
import { chaveNomeServicoUnico, MSG_SERVICO_JA_CADASTRADO } from "./nome-servico";
import { traduzirErro } from "./traduzir-erro";

describe("nome único de serviço", () => {
  test("ignora maiúsculas, acentos e espaços extras", () => {
    expect(chaveNomeServicoUnico("  Eco  Carótidas e   Vertebrais ")).toBe(
      chaveNomeServicoUnico("ECO CAROTIDAS E VERTEBRAIS"),
    );
  });

  test("pontuação diferente continua sendo outro nome (igual ao banco)", () => {
    expect(chaveNomeServicoUnico("LAUDO PARA CONCURSO - CLINICO GERAL")).not.toBe(
      chaveNomeServicoUnico("LAUDO PARA CONCURSO CLINICO GERAL"),
    );
  });

  test("violação do índice vira a mensagem combinada", () => {
    const erro = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "uq_procedimentos_clinica_nome_ativo"',
    };
    expect(traduzirErro(erro)).toBe(MSG_SERVICO_JA_CADASTRADO);
  });
});
