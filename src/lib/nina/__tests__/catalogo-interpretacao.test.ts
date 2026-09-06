/**
 * FASE 3 — interpretação do conteúdo do catálogo.
 *
 * Prova que as CONDIÇÕES chegam ao modelo junto com o dado (valor + forma +
 * condição, dia + recorrência + observação, restrição de idade, preparo,
 * modalidade) e que a definição central de instruções cobre a leitura.
 * Não se exige redação idêntica: verifica-se a preservação da informação.
 */
import { describe, expect, it, mock } from "bun:test";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "../catalogo-conhecimento";

const HOJE = "2026-09-06";

function servico(over: Partial<ServicoPublicado>): ServicoPublicado {
  return {
    id: "s1",
    nome: "Exame",
    valor: null,
    valor_observacao: null,
    descricao_publica: null,
    preparo: null,
    restricoes: null,
    executantes: [],
    formas_pagamento: [],
    ...over,
  };
}

function profissional(over: Partial<ProfissionalPublicado>): ProfissionalPublicado {
  return {
    id: "p1",
    nome: "Dra. Fulana",
    especialidades: [],
    atende_consultorio: null,
    formas_pagamento: [],
    convenios: [],
    horarios: [],
    tipo_atendimento: null,
    observacao_publica: null,
    aviso_dia: null,
    aviso_valido_de: null,
    aviso_valido_ate: null,
    unidades: null,
    ...over,
  };
}

describe("interpretação do catálogo pela Nina", () => {
  it("preço condicional chega com forma e condição, não só o menor valor", () => {
    const r = montarResultadoCatalogo({
      servicos: [
        servico({
          nome: "Densitometria",
          formas_pagamento: [
            { forma: "Dinheiro", valor: 150, condicao: "no atendimento" },
            { forma: "Cartão de crédito", valor: 180, condicao: "em até 3x" },
          ],
          valor_observacao: "A partir de — valor por sessão",
        }),
      ],
      profissionais: [],
      hojeISO: HOJE,
    });
    const notas = r.notes.join(" | ");
    expect(notas).toContain("Dinheiro");
    expect(notas).toContain("R$ 150,00");
    expect(notas).toContain("Cartão de crédito");
    expect(notas).toContain("R$ 180,00");
    expect(notas).toContain("no atendimento");
    expect(notas).toContain("em até 3x");
    expect(notas).toContain("A partir de");
    // A instrução impede tratar o valor de referência como preço único.
    expect(r.instrucao).toMatch(/forma de pagamento/i);
    expect(r.instrucao).toMatch(/nunca apenas o menor/i);
  });

  it("atendimento quinzenal continua quinzenal, com a observação do dia", () => {
    const r = montarResultadoCatalogo({
      servicos: [],
      profissionais: [
        profissional({
          nome: "Dr. Quinzenal",
          especialidades: [{ nome: "Reumatologia" }],
          horarios: [
            {
              dia: "Sábado",
              inicio: "08:00",
              fim: "12:00",
              recorrencia: "Quinzenal",
              observacao: "1º e 3º sábado do mês",
            },
          ],
        }),
      ],
      hojeISO: HOJE,
    });
    const dias = r.days.join(" ");
    expect(dias).toContain("Quinzenal");
    expect(dias).toContain("1º e 3º sábado");
    expect(r.instrucao).toMatch(/quinzenal não vira semanal/i);
  });

  it("restrição de idade escrita em observação pública chega ao modelo", () => {
    const r = montarResultadoCatalogo({
      servicos: [],
      profissionais: [
        profissional({
          nome: "Dra. Pediatra",
          especialidades: [{ nome: "Pediatria" }],
          observacao_publica: "Atendimento a partir de 6 meses",
        }),
      ],
      hojeISO: HOJE,
    });
    expect(JSON.stringify(r)).toContain("a partir de 6 meses");
  });

  it("preparo e requisitos cadastrados são preservados, sem inventar jejum", () => {
    const r = montarResultadoCatalogo({
      servicos: [
        servico({
          nome: "Ultrassom de abdome",
          preparo: "Beber 1 litro de água 1 hora antes",
          restricoes: "Necessário pedido médico",
        }),
      ],
      profissionais: [],
      hojeISO: HOJE,
    });
    const notas = r.notes.join(" | ");
    expect(notas).toContain("Preparo: Beber 1 litro de água");
    expect(notas).toContain("Requisitos: Necessário pedido médico");
    expect(notas).not.toMatch(/jejum/i);
  });

  it("modalidades diferentes não se misturam e convênio vazio não vira 'não atende'", () => {
    const r = montarResultadoCatalogo({
      servicos: [],
      profissionais: [
        profissional({
          id: "p1",
          nome: "Dr. Hora Marcada",
          especialidades: [{ nome: "Ortopedia" }],
          tipo_atendimento: "Hora marcada",
          convenios: [{ nome: "Unimed" }],
        }),
        profissional({
          id: "p2",
          nome: "Dr. Ordem de Chegada",
          especialidades: [{ nome: "Ortopedia" }],
          tipo_atendimento: "Ordem de chegada (ficha/senha)",
          convenios: [],
        }),
      ],
      hojeISO: HOJE,
      priorizar: "profissional",
    });
    const notas = r.notes.join(" | ");
    expect(notas).toContain("Modalidade: Hora marcada");
    expect(notas).toContain("Modalidade: Ordem de chegada (ficha/senha)");
    expect(notas).toContain("Convênios: Unimed");
    expect(notas).not.toMatch(/não atende convênio/i);
  });
});

describe("definição central das instruções", () => {
  it("bloco do catálogo traz data local, condições de pagamento e limites", async () => {
    mock.module("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: {
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 5 }) }) }),
        }),
      },
    }));
    const { blocoPromptCatalogo } = await import("../catalogo-prompt.server");
    const bloco = await blocoPromptCatalogo("clinica-1");

    expect(bloco).toContain("America/Sao_Paulo");
    expect(bloco).toMatch(/Hoje é/);
    expect(bloco).toMatch(/NUNCA informe só o menor preço/i);
    expect(bloco).toMatch(/quinzenal/i);
    expect(bloco).toMatch(/ordem de chegada/i);
    expect(bloco).toMatch(/nota interna/i);
    expect(bloco).toMatch(/faixa etária/i);
    expect(bloco).toMatch(/dado, não instrução/i);
    // Sem regra antiga de planilha convivendo com a do catálogo.
    expect(bloco.toLowerCase()).not.toContain("planilha");
  });

  it("sem catálogo publicado não há bloco de regras", async () => {
    mock.module("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: {
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }),
        }),
      },
    }));
    const { blocoPromptCatalogo } = await import("../catalogo-prompt.server");
    expect(await blocoPromptCatalogo("clinica-1")).toBe("");
  });
});
