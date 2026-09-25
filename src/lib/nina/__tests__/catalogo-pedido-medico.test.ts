import { describe, expect, test } from "bun:test";
import { servicoDoRegistro, servicoParaEnvio } from "@/components/nina/catalogo/FormServico";
import { servicoSchema } from "../catalogo";
import { servicoParaRegistro } from "../catalogo-conhecimento";

const exame = {
  id: "exame-teste", nome: "Mamografia", procedimento_id: null,
  valor: null, valor_observacao: null, descricao_publica: null,
  preparo: null, restricoes: null, executantes: [], formas_pagamento: [],
};

describe("pedido médico no catálogo de exames", () => {
  test.each(["obrigatorio", "dispensado", "nao_informado"] as const)(
    "%s é preservado ao editar, salvar e reabrir o cadastro", pedido_medico => {
      const formulario = servicoDoRegistro({ ...exame, estrutura: { pedido_medico } });
      const dados = servicoParaEnvio(formulario);
      const reaberto = servicoDoRegistro({ ...exame, ...JSON.parse(JSON.stringify(dados)) });
      expect(reaberto.estrutura.pedido_medico).toBe(pedido_medico);
      expect(servicoParaRegistro({ ...exame, ...dados }).extras?.pedido_medico).toBe(pedido_medico);
    },
  );

  test("cadastro antigo não presume exigência nem dispensa e mantém requisitos em texto", () => {
    const antigo = { ...exame, restricoes: "Apresentar pedido assinado." };
    const formulario = servicoDoRegistro(antigo);
    expect(formulario.estrutura.pedido_medico).toBe("nao_informado");
    const registro = servicoParaRegistro(antigo);
    expect(registro.observacoes).toContain("Apresentar pedido assinado.");
    expect(registro.observacoes).not.toContain("dispensado");
    expect(servicoParaRegistro(exame).observacoes).not.toContain("Pedido médico:");
  });

  test("revisão do formulário não muda a regra publicada antes de publicar", () => {
    const publicado = { ...exame, estrutura: { pedido_medico: "obrigatorio" },
      rascunho: { estrutura: { pedido_medico: "dispensado" } } };
    expect(servicoDoRegistro(publicado).estrutura.pedido_medico).toBe("dispensado");
    expect(servicoParaRegistro(publicado).extras?.pedido_medico).toBe("obrigatorio");
  });

  test("Nina recebe a regra explícita junto ao exame", () => {
    expect(servicoParaRegistro({ ...exame, estrutura: { pedido_medico: "obrigatorio" } }).observacoes)
      .toContain("Pedido médico: obrigatório");
    expect(servicoParaRegistro({ ...exame, estrutura: { pedido_medico: "dispensado" } }).observacoes)
      .toContain("Pedido médico: dispensado");
  });

  test("servidor recusa valores inválidos", () => {
    expect(servicoSchema.safeParse({ ...exame, estrutura: { pedido_medico: "talvez" } }).success).toBe(false);
  });
});
