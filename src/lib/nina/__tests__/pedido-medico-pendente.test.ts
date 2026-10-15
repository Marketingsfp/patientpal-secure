import { expect, it } from "bun:test";
import {
  MOTIVO_PEDIDO_NAO_ENVIADO,
  fotoPendenteNoTurno,
  pedidoMedicoPendente,
  type SolicitacaoPedidoMedico,
} from "../pedido-medico";
import { respostaAntesDaTransferencia, transferenciaDispensaDados } from "../dados-transferencia";

const ctx = { conversaId: "conversa-1", inicioSessao: "2026-10-15T10:00:00Z", teste: false };
const pedido = (item = "Eletrocardiograma") =>
  `Para ${item}, é necessário pedido médico. Pode enviar uma foto legível do pedido médico por aqui?`;
let minuto = 0;
const msg = (direction: "in" | "out", body: string, extra: Record<string, unknown> = {}) => ({
  conversa_id: "conversa-1",
  direction,
  body,
  tipo: "text",
  is_teste: false,
  created_at: `2026-10-15T10:${String(++minuto).padStart(2, "0")}:00Z`,
  ...extra,
});

it("sem pedido do sistema na sessão não há pendência", () => {
  expect(pedidoMedicoPendente([msg("in", "Oi"), msg("out", "Olá!")], ctx)).toBeNull();
});

it("primeiro pedido sem foto: pede de novo com a mesma frase", () => {
  const r = pedidoMedicoPendente(
    [
      msg("in", "Vocês fazem eletrocardiograma?"),
      msg("out", `Fazemos sim.\n\n${pedido()}`),
      msg("in", "Quanto custa?"),
    ],
    ctx,
  );
  expect(r).toEqual({ nome: "Eletrocardiograma", vezes: 1, pergunta: pedido() });
});

it("pedido quebrado em linhas pela formatação também conta", () => {
  const quebrado = pedido().replace(". Pode", ".\n\nPode");
  const r = pedidoMedicoPendente([msg("out", quebrado), msg("in", "ok")], ctx);
  expect(r?.vezes).toBe(1);
  expect(r?.pergunta).toBe(pedido());
});

it("dois pedidos sem foto: pendência para encaminhar direto", () => {
  const r = pedidoMedicoPendente(
    [
      msg("out", pedido()),
      msg("in", "Não tenho o pedido agora"),
      msg("out", `Entendo.\n\n${pedido()}`),
      msg("in", "Levo o original no dia"),
    ],
    ctx,
  );
  expect(r?.vezes).toBe(2);
});

it("foto depois do pedido encerra a pendência", () => {
  const r = pedidoMedicoPendente(
    [msg("out", pedido()), msg("in", "", { tipo: "image" }), msg("in", "Mandei")],
    ctx,
  );
  expect(r).toBeNull();
});

it("ignora outra conversa, sessão anterior e ambiente diferente", () => {
  const fora = [
    msg("out", pedido(), { conversa_id: "conversa-2" }),
    msg("out", pedido(), { created_at: "2026-10-15T09:00:00Z" }),
    msg("out", pedido(), { is_teste: true }),
  ];
  expect(pedidoMedicoPendente(fora, ctx)).toBeNull();
  expect(pedidoMedicoPendente(fora, { ...ctx, teste: true })?.vezes).toBe(1);
});

it("encaminhamento por pedido não enviado dispensa nome e data", () => {
  expect(
    transferenciaDispensaDados({ motivo: `${MOTIVO_PEDIDO_NAO_ENVIADO}: Eletrocardiograma` }),
  ).toBe(true);
  expect(
    transferenciaDispensaDados({
      motivo: `[Normal] ${MOTIVO_PEDIDO_NAO_ENVIADO}: Eletrocardiograma`,
    }),
  ).toBe(true);
});

const solicitacao = (acao: SolicitacaoPedidoMedico["acao"]): SolicitacaoPedidoMedico => ({
  id: "item-1",
  nome: "Eletrocardiograma",
  acao,
  pergunta: pedido(),
  bloqueia_agenda: false,
});

it("foto primeiro: pendente quando o item pede a foto neste turno ou já pediu uma vez", () => {
  expect(fotoPendenteNoTurno(null, [solicitacao("solicitar_foto")])).toBe(true);
  expect(fotoPendenteNoTurno(null, [solicitacao("ja_solicitado")])).toBe(true);
  expect(fotoPendenteNoTurno({ nome: "Eletrocardiograma", vezes: 1, pergunta: pedido() }, [])).toBe(
    true,
  );
});

it("foto primeiro: não segura com foto recebida, sem pedido ou depois do segundo pedido", () => {
  expect(fotoPendenteNoTurno(null, [])).toBe(false);
  expect(fotoPendenteNoTurno(null, [solicitacao("foto_recebida")])).toBe(false);
  expect(
    fotoPendenteNoTurno({ nome: "Eletrocardiograma", vezes: 2, pergunta: pedido() }, [
      solicitacao("ja_solicitado"),
    ]),
  ).toBe(false);
});

it("foto primeiro: a resposta mantém a dúvida respondida e tira encaminhamento e dados", () => {
  const texto =
    "Sim, o valor no cartão de crédito é R$ 132,00 e o pagamento pode ser feito na clínica.\n\nVou encaminhar você para a nossa equipe. Para agilizar o seu atendimento, me envie, por favor, o seu nome completo e a sua data de nascimento.";
  const limpo = respostaAntesDaTransferencia(texto);
  expect(limpo).toContain("R$ 132,00");
  expect(limpo).not.toMatch(/encaminh|nome completo|data de nascimento/i);
});
