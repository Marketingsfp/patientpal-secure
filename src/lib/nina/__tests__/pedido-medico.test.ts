import { expect, it } from "bun:test";
import {
  avaliarPedidoMedico,
  atualizarSolicitacoesPedido,
  acrescentarSolicitacaoPedido,
} from "../pedido-medico";
import type { ResultadoConhecimento } from "../knowledge-contract";
import { formatarTextoMobile } from "../resposta/formato-mobile";
import { textoDoPedidoLido, textoDaImagem } from "../leitura-imagem";

const resultado = (
  nome = "Eletrocardiograma",
  campo = "obrigatorio",
): Partial<ResultadoConhecimento> => ({
  fonte_consulta: "base_conhecimento",
  found: true,
  knowledge_status: "found",
  records: [
    {
      id: "item-1",
      procedimento: nome,
      extras: {
        estrutura: { pedido_medico: campo, aliases: nome === "Eletrocardiograma" ? ["ECG"] : [] },
      },
    },
  ],
});
const ctx = {
  conversaId: "conversa-1",
  inicioSessao: "2026-10-04T10:00:00Z",
  teste: false,
  bloquearAgenda: true,
  mensagens: [] as any[],
};
const foto = {
  conversa_id: ctx.conversaId,
  created_at: "2026-10-04T10:01:00Z",
  is_teste: false,
  direction: "in",
  tipo: "image",
  status: "received",
  transcricao: "Enviei a foto de um pedido médico com: ECG.",
};
for (const nome of ["Eletrocardiograma", "Aplicação de injeção", "Consulta — Cardiologia"])
  it(`solicita foto para ${nome} obrigatório`, () => {
    const r = avaliarPedidoMedico(resultado(nome), ctx);
    expect(r[0]?.acao).toBe("solicitar_foto");
    expect(acrescentarSolicitacaoPedido("Informação confirmada.", r)).toContain(
      `Para ${nome}, é necessário pedido médico.`,
    );
  });
for (const campo of ["dispensado", "nao_informado", "", "true"])
  it(`não presume obrigatoriedade: ${campo}`, () =>
    expect(avaliarPedidoMedico(resultado(undefined, campo), ctx)).toEqual([]));
it("respeita fonte selecionada, falha e ambiguidade", () => {
  for (const patch of [
    { fonte_consulta: "clinica_os" },
    { found: false },
    { knowledge_status: "conflict" },
    { esclarecimento: { tipo: "procedimento", pergunta: "Qual?", opcoes: [] } },
  ])
    expect(
      avaliarPedidoMedico({ ...resultado(), ...patch } as Partial<ResultadoConhecimento>, ctx),
    ).toEqual([]);
});
it("não generaliza requisito de um médico para outro", () => {
  expect(
    avaliarPedidoMedico(
      {
        ...resultado(),
        records: [...resultado().records!, ...resultado(undefined, "dispensado").records!],
      },
      ctx,
    ),
  ).toEqual([]);
  expect(
    avaliarPedidoMedico(
      { ...resultado(), records: [...resultado().records!, ...resultado("Outro exame").records!] },
      ctx,
    ),
  ).toEqual([]);
});
it("reconhece foto do mesmo exame por alias publicado", () => {
  expect(avaliarPedidoMedico(resultado(), { ...ctx, mensagens: [foto] })[0]?.acao).toBe(
    "foto_recebida",
  );
});
it("reconhece siglas completas e não usa legenda nem seleção incerta como prova do pedido", () => {
  const transcricao = textoDoPedidoLido(
    ["M.A.P.A. 24h", "ECG"],
    "Também quero Hemograma. Dr. Silva pediu.",
  );
  expect(
    avaliarPedidoMedico(resultado("M.A.P.A. 24h"), {
      ...ctx,
      mensagens: [{ ...foto, transcricao }],
    })[0]?.acao,
  ).toBe("foto_recebida");
  expect(
    avaliarPedidoMedico(resultado("Hemograma"), {
      ...ctx,
      mensagens: [{ ...foto, transcricao }],
    })[0]?.acao,
  ).toBe("solicitar_foto");
  expect(
    avaliarPedidoMedico(resultado(), {
      ...ctx,
      mensagens: [{ ...foto, transcricao: textoDaImagem({ tipo: "marcacao_incerta" }) }],
    })[0]?.acao,
  ).toBe("solicitar_foto");
});
for (const [caso, patch] of Object.entries({
  texto: { tipo: "text", body: "Já enviei" },
  imagemSemLeitura: { transcricao: "Foto anexada" },
  outroExame: { transcricao: "Enviei a foto de um pedido médico com: Hemograma." },
  outraConversa: { conversa_id: "conversa-2" },
  outraSessao: { created_at: "2026-10-03T10:01:00Z" },
  outroAmbiente: { is_teste: true },
  falha: { status: "failed" },
}))
  it(`não aceita ${caso} como foto do pedido`, () => {
    expect(
      avaliarPedidoMedico(resultado(), { ...ctx, mensagens: [{ ...foto, ...patch }] })[0]?.acao,
    ).toBe("solicitar_foto");
  });
it("não repete solicitação entregue, incluindo quebras mobile", () => {
  const pedidos = avaliarPedidoMedico(resultado(), ctx);
  const body = formatarTextoMobile(pedidos[0]!.pergunta);
  for (const status of ["sent", "delivered", "read"])
    expect(
      avaliarPedidoMedico(resultado(), {
        ...ctx,
        mensagens: [{ ...foto, tipo: "text", direction: "out", status, body }],
      })[0]?.acao,
    ).toBe("ja_solicitado");
  expect(acrescentarSolicitacaoPedido(body, pedidos)).toBe(body);
  for (const status of ["failed", "pending", "queued", "sending"])
    expect(
      avaliarPedidoMedico(resultado(), {
        ...ctx,
        mensagens: [{ ...foto, direction: "out", status, body }],
      })[0]?.acao,
    ).toBe("solicitar_foto");
});
it("mesmo item reavaliado e nova seleção não carregam exigência anterior", () => {
  const pedidos = avaliarPedidoMedico(resultado(), ctx);
  expect(atualizarSolicitacoesPedido(pedidos, resultado(), ctx)).toHaveLength(1);
  expect(atualizarSolicitacoesPedido(pedidos, resultado(undefined, "dispensado"), ctx)).toEqual([]);
  expect(atualizarSolicitacoesPedido(pedidos, { ...resultado(), records: [] }, ctx, true)).toEqual(
    [],
  );
});
it("homologação reconhece foto apenas no seu ambiente", () => {
  expect(
    avaliarPedidoMedico(resultado(), {
      ...ctx,
      teste: true,
      mensagens: [{ ...foto, is_teste: true }],
    })[0]?.acao,
  ).toBe("foto_recebida");
});

for (const modalidade of ["hora_marcada", "chegada_com_pre_agendamento"])
  it(`${modalidade}: sem foto bloqueia agenda; foto do mesmo exame libera e não repete pergunta`, () => {
    const exame = resultado();
    exame.records![0]!.tipo = "servico";
    exame.records![0]!.extras!.modalidade_atendimento = modalidade;
    const falta = avaliarPedidoMedico(exame, ctx);
    expect(falta[0]).toMatchObject({ acao: "solicitar_foto", bloqueia_agenda: true });
    const recebido = avaliarPedidoMedico(exame, { ...ctx, mensagens: [foto] });
    expect(recebido[0]).toMatchObject({ acao: "foto_recebida", bloqueia_agenda: false });
    expect(acrescentarSolicitacaoPedido("Informações do exame.", recebido)).toBe(
      "Informações do exame.",
    );
    const solicitado = avaliarPedidoMedico(exame, {
      ...ctx,
      mensagens: [
        { ...foto, tipo: "text", direction: "out", status: "sent", body: falta[0]!.pergunta },
      ],
    });
    expect(solicitado[0]).toMatchObject({ acao: "ja_solicitado", bloqueia_agenda: true });
  });

it("escala estruturada usa a modalidade do exame sem converter dias habituais em vagas", () => {
  const exame = resultado();
  exame.records![0]!.tipo = "servico";
  exame.records![0]!.extras!.atendimentos_publicados = [
    { modalidade: "chegada_com_pre_agendamento" },
  ];
  expect(avaliarPedidoMedico(exame, ctx)[0]?.bloqueia_agenda).toBe(true);
});
it("publicação desligada conserva a solicitação da foto sem bloquear a agenda", () => {
  const exame = resultado();
  exame.records![0]!.tipo = "servico";
  exame.records![0]!.extras!.modalidade_atendimento = "hora_marcada";
  expect(avaliarPedidoMedico(exame, { ...ctx, bloquearAgenda: false })[0]).toMatchObject({
    acao: "solicitar_foto",
    bloqueia_agenda: false,
  });
});
for (const modalidade of ["chegada_sem_pre_agendamento", "ficha", "nao_definida"])
  it(`${modalidade}: preserva a regra própria de atendimento`, () => {
    const exame = resultado();
    exame.records![0]!.tipo = "servico";
    exame.records![0]!.extras!.modalidade_atendimento = modalidade;
    expect(avaliarPedidoMedico(exame, ctx)[0]?.bloqueia_agenda).toBe(false);
  });
it("consulta obrigatória conserva a solicitação de foto sem herdar o bloqueio dos exames", () => {
  const consulta = resultado("Consulta — Cardiologia");
  consulta.records![0]!.tipo = "profissional";
  consulta.records![0]!.extras!.modalidade_atendimento = "hora_marcada";
  expect(avaliarPedidoMedico(consulta, ctx)[0]).toMatchObject({
    acao: "solicitar_foto",
    bloqueia_agenda: false,
  });
});
