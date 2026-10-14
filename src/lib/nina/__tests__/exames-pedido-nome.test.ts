import { describe, expect, test } from "bun:test";
import {
  acrescentarSolicitacaoPedido,
  removerPedidoDeFoto,
  type SolicitacaoPedidoMedico,
} from "../pedido-medico";
import { extrairDadosTransferencia } from "../dados-transferencia";
import { protegerEfeitosDaResposta, semRegistroInventado } from "../resposta/efeitos-confirmados";

// Fase 8 da homologação de 14/10/2026 (exames). Dados fictícios.

const pedido = (nome: string): SolicitacaoPedidoMedico => ({
  id: "s1",
  nome,
  acao: "solicitar_foto",
  pergunta: `Para ${nome}, é necessário pedido médico. Pode enviar uma foto legível do pedido médico por aqui?`,
  bloqueia_agenda: false,
});

describe("pedido médico cobrado uma vez só (E1)", () => {
  test("a frase da IA sai e fica só a do sistema", () => {
    const ia =
      "Realizamos sim o exame de EEG.\n\n*Valores:*\nDinheiro: R$ 100,00\nPix/cartão: R$ 120,00\n\nPara realizar este exame, o pedido médico é obrigatório.\n\nVocê pode me enviar uma foto legível do seu pedido médico por aqui?";
    const final = acrescentarSolicitacaoPedido(ia, [pedido("EEG")]);
    expect(final.match(/foto/gi)).toHaveLength(1);
    expect(final).toContain("Dinheiro: R$ 100,00");
    expect(final).not.toContain("o pedido médico é obrigatório");
    expect(final.endsWith("Pode enviar uma foto legível do pedido médico por aqui?")).toBe(true);
  });

  test("outras exigências e informações ficam", () => {
    expect(
      removerPedidoDeFoto(
        "A Dra. Teste atende às sextas. Para a realização da audiometria, o pedido médico é obrigatório.\n* Requisito:\nApresentação de pedido médico obrigatória.\nPreparo: jejum de 8 horas.",
      ),
    ).toBe("A Dra. Teste atende às sextas.\nPreparo: jejum de 8 horas.");
  });

  test("sem solicitação nova, a resposta não muda", () => {
    const ia = "Assim que puder, envie a foto do pedido médico.";
    expect(acrescentarSolicitacaoPedido(ia, [{ ...pedido("EEG"), acao: "ja_solicitado" }])).toBe(
      ia,
    );
  });
});

describe("rótulo 'nome' não entra no nome (E6)", () => {
  test("o paciente é meu pai: nome …", () => {
    expect(
      extrairDadosTransferencia(
        "o paciente é meu pai: nome joao teste de lima, nasceu em 22 de janeiro de 1953. segue com o marcelo sexta de manha",
      ).nome_completo,
    ).toBe("Joao Teste de Lima");
  });
});

describe("preferência não é registrada (E5)", () => {
  test("'registrei' e 'deixei anotada' viram 'entendi'", () => {
    expect(semRegistroInventado("Perfeito, registrei sua preferência pela Dra. Teste.")).toBe(
      "Perfeito, entendi sua preferência pela Dra. Teste.",
    );
    expect(semRegistroInventado("Perfeito! Já deixei anotada a sua preferência pelo sábado.")).toBe(
      "Perfeito! Entendi a sua preferência pelo sábado.",
    );
    const r = protegerEfeitosDaResposta("Registrei sua preferência.", {
      handoffConfirmado: false,
      bloqueioIdentificacao: false,
    });
    expect(r).toMatchObject({ texto: "Entendi sua preferência.", alterado: true });
  });
});
