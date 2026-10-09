import { expect, it } from "bun:test";
import { formatarTextoMobile, formatarMensagemNina } from "../resposta/formato-mobile";
import { finalizarResposta, limparFinalizacoes } from "../resposta/finalizacao.server";
import { criarResultado } from "../resposta/contrato";
import { hashDoTexto } from "../confidence/hash";
import { montarMensagemHandoffFallback } from "@/lib/atendimento/mensagem-handoff";

it("separa saudação, valores, informações e pergunta sem mudar o conteúdo", () => {
  const entrada =
    "Olá! Confira os valores. Dinheiro: R$ 100,00 Pix/cartão: R$ 120,00. Prefere escolher o profissional?";
  const saida = formatarTextoMobile(entrada);
  expect(saida).toBe(
    "Olá!\n\nConfira os valores.\nDinheiro: R$ 100,00\nPix/cartão: R$ 120,00.\n\nPrefere escolher o profissional?",
  );
  expect(saida.replace(/\s/g, "")).toBe(entrada.replace(/\s/g, ""));
});
it("preserva nomes, abreviações, datas, horários, dinheiro, links e telefones", () => {
  const entrada =
    "Dr. João e Dra. Ana atendem na Av. Brasil às 13:30 de 04/10/2026. Valor R$ 1.250,00. Telefone +55 (21) 99999-8888. Veja https://exemplo.com/a?data=04.10&v=1.2 ou nome.sobrenome@exemplo.com.";
  const saida = formatarTextoMobile(entrada);
  expect(saida.replace(/\s/g, "")).toBe(entrada.replace(/\s/g, ""));
  for (const trecho of [
    "Dr. João",
    "Dra. Ana",
    "Av. Brasil",
    "13:30",
    "04/10/2026",
    "R$ 1.250,00",
    "+55 (21) 99999-8888",
    "https://exemplo.com/a?data=04.10&v=1.2",
    "nome.sobrenome@exemplo.com",
  ])
    expect(saida).toContain(trecho);
});
it("divide blocos longos entre frases, sem truncar frases longas ou separar condições", () => {
  const a =
    "O atendimento ocorre na unidade informada, com os documentos descritos na orientação, respeitando todas as condições publicadas para este procedimento.";
  const b =
    "As informações de preparo permanecem vinculadas ao mesmo exame e devem ser verificadas antes do atendimento, inclusive as observações do profissional.";
  expect(formatarTextoMobile(`${a} ${b}`)).toBe(`${a}\n\n${b}`);
  const longa = "Texto sem pontuação ".repeat(30).trim();
  expect(formatarTextoMobile(longa)).toBe(longa);
});
it("mantém blocos e listas existentes, normaliza linhas e é idempotente", () => {
  const texto =
    "  *Dr. João*\r\n1. Segunda, 13:30\r\n2. Terça, 09:00\r\n\r\n\r\n*Dra. Ana*\r\n- Quarta, 14:00  ";
  const esperado = "*Dr. João*\n1. Segunda, 13:30\n2. Terça, 09:00\n\n*Dra. Ana*\n- Quarta, 14:00";
  expect(formatarTextoMobile(texto)).toBe(esperado);
  expect(formatarTextoMobile(esperado)).toBe(esperado);
  expect(formatarMensagemNina("😊")).toBe("");
  const literal = "Código `A. B` e https://exemplo.com.\n\n```a\n\n\nb```";
  expect(formatarTextoMobile(literal)).toBe(literal);
});
it.each(["whatsapp", "test-console"] as const)(
  "finaliza antes do hash e preserva original em %s, inclusive repetição concorrente",
  async (canal) => {
    limparFinalizacoes();
    const texto =
      "Boa tarde! Dinheiro: R$ 100,00 Pix/cartão: R$ 120,00. Deseja consultar horários?";
    const pedido = {
      clinicaId: "mobile-test",
      canal,
      chaveTurno: `mobile-${canal}`,
      resultado: criarResultado({ origem: "modelo", texto }),
    };
    const [a, b] = await Promise.all([finalizarResposta(pedido), finalizarResposta(pedido)]);
    expect(a.texto).toBe(
      "Boa tarde!\nDinheiro: R$ 100,00\nPix/cartão: R$ 120,00.\n\nDeseja consultar horários?",
    );
    expect(a.texto).toBe(b.texto);
    expect(a.textoOriginal).toBe(texto);
    expect(a.textoHash).toBe(hashDoTexto(a.texto));
    expect(a.textoOriginalHash).not.toBe(a.textoHash);
    expect((await finalizarResposta(pedido)).texto).toBe(a.texto);
  },
);
it("mantém protocolo e organização dos avisos de encaminhamento", () => {
  const texto = montarMensagemHandoffFallback({
    protocolo: "MJ-123",
    nome: "Ana",
    motivo: "pedido_do_paciente",
  });
  expect(texto).toContain("\n\nProtocolo do atendimento: MJ-123");
  expect(formatarMensagemNina(texto)).toBe(texto);
});

it("converte negrito Markdown sem alterar fatos, itálico, listas e trechos literais", () => {
  const entrada =
    "**Dr. João**\n**A** e **Hemograma completo**\n**Pix/cartão: R$ 145,00**\n*Já correto* e _itálico_\n* item\n2 * 3\n**sem fechamento\n`**literal**`\n```**código**```\nhttps://exemplo.com/**arquivo**";
  const esperado =
    "*Dr. João*\n*A* e *Hemograma completo*\n*Pix/cartão: R$ 145,00*\n*Já correto* e _itálico_\n* item\n2 * 3\n**sem fechamento\n`**literal**`\n```**código**```\nhttps://exemplo.com/**arquivo**";
  expect(formatarMensagemNina(entrada)).toBe(esperado);
  expect(formatarMensagemNina(esperado)).toBe(esperado);
});

it.each(["whatsapp", "test-console"] as const)(
  "negrito é corrigido antes do hash em %s",
  async (canal) => {
    limparFinalizacoes();
    const texto = "**Hemograma completo**\nDinheiro: **R$ 15,00**";
    const pedido = {
      clinicaId: "negrito-test",
      canal,
      chaveTurno: `negrito-${canal}`,
      resultado: criarResultado({ origem: "modelo", texto }),
    };
    const [a, b] = await Promise.all([finalizarResposta(pedido), finalizarResposta(pedido)]);
    expect(a.texto).toBe("*Hemograma completo*\nDinheiro: *R$ 15,00*");
    expect(a.textoOriginal).toBe(texto);
    expect(a.textoHash).toBe(hashDoTexto(a.texto));
    expect(b.texto).toBe(a.texto);
  },
);
