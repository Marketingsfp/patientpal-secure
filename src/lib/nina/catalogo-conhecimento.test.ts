import { describe, expect, it } from "bun:test";
import { extrairEvidencia } from "./confidence/evidencia-extrator";
import { verificarFormaPagamento } from "./confidence/pagamento-declarado";
import {
  avisoVigente,
  montarResultadoCatalogo,
  profissionalParaRegistro,
  servicoParaRegistro,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "./catalogo-conhecimento";

const servico: ServicoPublicado = {
  id: "s1",
  nome: "ECOCARDIOGRAMA",
  valor: null,
  valor_observacao: null,
  descricao_publica: null,
  preparo: "Trazer exames anteriores",
  restricoes: "Idade mínima informada: 12 anos",
  executantes: [{ nome: "Rosângela Riolino", horarios: "Ter 08:00h — Agendado" }],
  formas_pagamento: [
    { forma: "Dinheiro", valor: 152 },
    { forma: "Cartão", valor: 180 },
  ],
};

const profissional: ProfissionalPublicado = {
  id: "p1",
  nome: "Alex Louza",
  especialidades: [{ id: null, nome: "Cardiologia" }],
  atende_consultorio: null,
  formas_pagamento: [{ forma: "Dinheiro", valor: 120, condicao: "Consulta Cardiologia" }],
  convenios: [],
  horarios: [],
  tipo_atendimento: "Consulta",
  observacao_publica: "Consulta Cardiologia — Qua 13h — Agendado",
  aviso_dia: "Hoje atende só até 12h",
  aviso_valido_de: "2026-09-06",
  aviso_valido_ate: "2026-09-06",
};

describe("catálogo como fonte de conhecimento da Nina", () => {
  it.each([null, undefined, "inválido", [null], []].map((formas) => ({ formas })))(
    "preserva lista de pagamento sem confundir ausência e lista vazia: %j",
    ({ formas }) => {
      for (const tipo of ["servico", "profissional"]) {
        const dados = montarResultadoCatalogo({
          servicos:
            tipo === "servico"
              ? [{ ...servico, nome: "Consulta Cardiologia", formas_pagamento: formas }]
              : [],
          profissionais:
            tipo === "profissional" ? [{ ...profissional, formas_pagamento: formas }] : [],
          hojeISO: "2026-09-13",
        });
        const evidencia = extrairEvidencia({
          ferramenta: "consultar_base_conhecimento",
          capacidade: "searchKnowledgeBase",
          fonte: "base_conhecimento",
          success: true,
          args: { termo: "cardiologia" },
          dados,
        });
        const resultado = verificarFormaPagamento({
          forma: "pix",
          negacao: true,
          chave: { procedimento: "Cardiologia" },
          fatos: evidencia.fatos,
          consultas: [evidencia.consulta],
        });
        expect(resultado.situacao).not.toBe("confirmado");
      }
    },
  );

  it("não converte um preço cadastrado só em PIX para dinheiro", () => {
    const formas = [{ forma: "PIX", valor: 100, condicao: "Consulta Cardiologia" }];
    const s = servicoParaRegistro({ ...servico, valor: 100, formas_pagamento: formas });
    const p = profissionalParaRegistro({ ...profissional, formas_pagamento: formas }, "2026-09-13");
    for (const registro of [s, p]) {
      expect(registro.preco_dinheiro).toBeNull();
      expect(registro.extras?.formas_pagamento).toEqual(formas);
      expect(registro.observacoes).toContain("PIX");
    }
  });

  it("preserva valores distintos de PIX e dinheiro sem depender da ordem das formas", () => {
    const formas = [
      { forma: "PIX", valor: 95 },
      { forma: "Dinheiro", valor: 100 },
    ];
    for (const ordem of [formas, [...formas].reverse()]) {
      expect(servicoParaRegistro({ ...servico, formas_pagamento: ordem }).preco_dinheiro).toBe(100);
      expect(
        profissionalParaRegistro({ ...profissional, formas_pagamento: ordem }, "2026-09-13")
          .preco_dinheiro,
      ).toBe(100);
    }
  });

  it("um valor genérico sem formas não declara aceite em dinheiro", () => {
    const r = servicoParaRegistro({ ...servico, valor: 100, formas_pagamento: [] });
    expect(r.preco_dinheiro).toBeNull();
    expect(r.observacoes).toContain("forma de pagamento não informada");
  });

  it("pagamento à vista não declara dinheiro nem PIX por suposição", () => {
    const r = servicoParaRegistro({
      ...servico,
      formas_pagamento: [{ forma: "À vista", valor: 100 }],
    });
    expect(r.preco_dinheiro).toBeNull();
    expect(r.extras?.formas_pagamento).toEqual([{ forma: "À vista", valor: 100 }]);
  });

  it("mapeia serviço preservando preços por forma de pagamento e preparo", () => {
    const r = servicoParaRegistro(servico);
    expect(r.procedimento).toBe("ECOCARDIOGRAMA");
    expect(r.preco_dinheiro).toBe(152);
    expect(r.preco_cartao).toBe(180);
    expect(r.preparo).toBe("Trazer exames anteriores");
    expect(r.medico).toBe("Rosângela Riolino");
    expect(String(r.observacoes)).toContain("Requisitos");
  });

  it("campo vazio continua desconhecido, nunca vira zero ou 'não atende'", () => {
    const vazio = servicoParaRegistro({
      ...servico,
      formas_pagamento: [],
      valor: null,
      preparo: null,
    });
    expect(vazio.preco_dinheiro).toBeNull();
    expect(vazio.preco_cartao).toBeNull();
    expect(vazio.preparo).toBeNull();

    const prof = profissionalParaRegistro(profissional, "2026-09-06");
    expect(String(prof.observacoes)).not.toContain("Não atende no consultório");
  });

  it("aviso do dia só entra dentro da vigência", () => {
    expect(avisoVigente(profissional, "2026-09-06")).toBe("Hoje atende só até 12h");
    expect(avisoVigente(profissional, "2026-09-07")).toBeNull();
    const prof = profissionalParaRegistro(profissional, "2026-09-07");
    expect(String(prof.observacoes)).not.toContain("Aviso vigente");
  });

  it("resultado sem registros é not_found e proíbe deduzir", () => {
    const r = montarResultadoCatalogo({ servicos: [], profissionais: [], hojeISO: "2026-09-06" });
    expect(r.found).toBe(false);
    expect(r.knowledge_status).toBe("not_found");
    expect(r.source_type).toBe("catalog");
    expect(r.instrucao).toContain("proibido deduzir");
  });

  it("resultado com registros traz preço, profissionais e rastreabilidade", () => {
    const r = montarResultadoCatalogo({
      servicos: [servico],
      profissionais: [profissional],
      hojeISO: "2026-09-06",
    });
    expect(r.knowledge_status).toBe("found");
    // FASE 4 — o resumo preserva as duas formas quando os valores divergem.
    expect(r.price).toBe("Dinheiro: R$ 152,00 / Pix/cartão: R$ 180,00");

    expect(r.doctors).toContain("Rosângela Riolino");
    expect(r.doctors).toContain("Alex Louza");
    expect(r.trace.map((t) => t.record_id)).toEqual(["s1", "p1"]);
    expect(r.instrucao).toContain("escala habitual");
  });

  it("nenhum campo interno chega ao contexto do modelo", () => {
    const serializado = JSON.stringify(
      montarResultadoCatalogo({
        servicos: [servico],
        profissionais: [profissional],
        hojeISO: "2026-09-06",
      }),
    );
    expect(serializado).not.toContain("nota_interna");
    expect(serializado).not.toContain("rascunho");
  });

  it("mais de um item compatível marca ambiguidade para a Nina perguntar", () => {
    const r = montarResultadoCatalogo({
      servicos: [servico, { ...servico, id: "s2", nome: "ECOCARDIOGRAMA COM DOPPLER" }],
      profissionais: [],
      hojeISO: "2026-09-06",
      ambiguo: true,
    });
    expect(r.instrucao).toContain("qual item está no pedido médico");
  });
});
