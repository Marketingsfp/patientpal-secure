import { describe, expect, test } from "bun:test";
import { limitarRetornoParaModelo } from "../confidence/evidencias-turno";
import { profissionalParaRegistro } from "../catalogo-conhecimento";
import { removerPerguntaDeAgendamento, PERGUNTA_ENCAMINHAMENTO } from "../fluxo-agendamento-item";

type RegistroModelo = {
  medico: string;
  dia: string;
  preco_dinheiro: number;
  extras: { modalidade_atendimento?: string; estrutura?: unknown };
};
type RetornoModelo = {
  records: RegistroModelo[];
  retorno_truncado?: boolean;
  retorno_compactado?: boolean;
  instrucao?: string;
  vinculos_agenda?: unknown;
};

const texto = (n: number, base = "Texto de teste. ") => base.repeat(Math.ceil(n / base.length));

// Mesmo formato e ordem de grandeza do retorno real de Cardiologia (9 médicos,
// ~125 mil caracteres): os registros carregam cópias grandes em `extras`.
function retornoGrande() {
  const records = Array.from({ length: 9 }, (_, i) => ({
    id: `p${i}`,
    categoria: "CONSULTA",
    tipo: "profissional",
    procedimento: "Consulta — Cardiologia",
    medico: `Profissional Teste ${i}`,
    dia: `Segunda-feira 0${i}:00–12:00 · Quarta-feira 13:00–17:00`,
    preco_dinheiro: 120 + i,
    preco_cartao: 145 + i,
    observacoes: texto(1500),
    preparo: null,
    extras: {
      catalogo_tipo: "profissional",
      estrutura: { aliases: [], atendimentos: texto(9000) },
      atendimentos_publicados: texto(7000),
      observacao_publica: texto(1500),
      formas_pagamento: texto(600),
      horarios: texto(300),
      modalidade_atendimento: "hora_marcada",
      nina_pode_agendar: false,
      atendimento_humano_obrigatorio: false,
      pedido_medico: "nao_informado",
    },
  }));
  return {
    ok: true,
    found: true,
    instrucao: texto(7700),
    mapa_campos: texto(1500),
    notes: [texto(10000)],
    trace: [texto(1500)],
    vinculos_agenda: [texto(2500)],
    days: ["Segunda-feira", "Quarta-feira"],
    records,
  };
}

describe("retorno do catálogo para a IA", () => {
  test("compacta sem retirar registros: todos os médicos com horários e preços", () => {
    const original = retornoGrande();
    expect(JSON.stringify(original).length).toBeGreaterThan(100_000);
    const r = limitarRetornoParaModelo(original) as RetornoModelo;
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(24_000);
    expect(r.retorno_truncado).toBeUndefined();
    expect(r.retorno_compactado).toBe(true);
    expect(r.records).toHaveLength(9);
    for (const [i, reg] of r.records.entries()) {
      expect(reg.medico).toBe(`Profissional Teste ${i}`);
      expect(reg.dia).toContain("Quarta-feira 13:00–17:00");
      expect(reg.preco_dinheiro).toBe(120 + i);
      expect(reg.extras.modalidade_atendimento).toBe("hora_marcada");
      expect(reg.extras.estrutura).toBeUndefined();
    }
    expect(r.instrucao).toBe(original.instrucao);
    expect(r.vinculos_agenda).toEqual(original.vinculos_agenda);
  });

  test("retorno pequeno passa inteiro; sem registros cai no corte explícito", () => {
    const pequeno = { ok: true, records: [{ id: "a", dia: "Segunda-feira" }] };
    expect(limitarRetornoParaModelo(pequeno)).toBe(pequeno);
    const semRegistros = limitarRetornoParaModelo({ ok: true, texto: texto(40_000) }) as Record<
      string,
      unknown
    >;
    expect(semRegistros.retorno_truncado).toBe(true);
  });

  test("item estruturado não leva os atendimentos crus junto dos traduzidos", () => {
    const r = profissionalParaRegistro(
      {
        id: "p",
        nome: "Profissional Teste",
        especialidades: [],
        atende_consultorio: null,
        formas_pagamento: [],
        convenios: [],
        horarios: [],
        tipo_atendimento: null,
        observacao_publica: "",
        aviso_dia: null,
        aviso_valido_de: null,
        aviso_valido_ate: null,
        estrutura: {
          atendimentos: [
            {
              id: "a1",
              nome: "Consulta",
              modalidade: "hora_marcada",
              horarios: [{ dia: "Segunda-feira", inicio: "08:00", fim: "12:00" }],
              executantes: [],
              precos: [{ forma: "Dinheiro", valor: 100 }],
            },
          ],
        },
      },
      "2026-10-12",
    );
    const extras = r.extras as {
      estrutura: { atendimentos?: unknown };
      atendimentos_publicados: unknown[];
    };
    expect(extras.estrutura.atendimentos).toBeUndefined();
    expect(extras.atendimentos_publicados).toHaveLength(1);
    expect(r.observacoes).toContain("Dinheiro: R$ 100,00");
  });
});

describe("uma só oferta de encaminhamento", () => {
  test("retira a oferta afirmada pela IA antes da pergunta do sistema", () => {
    const resposta = [
      "Boa noite!",
      "Temos atendimento na especialidade de Cardiologia.",
      "Valores da consulta: Dinheiro: R$ 120,00 Pix/cartão: R$ 145,00.",
      "Como você prefere o primeiro horário disponível, posso transferir a conversa para a nossa equipe de atendimento verificar as próximas vagas na agenda e concluir o seu agendamento.",
    ].join("\n");
    const limpa = removerPerguntaDeAgendamento(resposta);
    expect(limpa).not.toContain("posso transferir");
    expect(limpa).toContain("Valores da consulta");
    expect(`${limpa}\n\n${PERGUNTA_ENCAMINHAMENTO}`.match(/encaminh|transferir/gi)).toHaveLength(1);
  });

  test("mantém frases informativas e a última pergunta que não é sobre marcar", () => {
    expect(removerPerguntaDeAgendamento("O preparo é jejum de 8 horas.")).toBe(
      "O preparo é jejum de 8 horas.",
    );
    expect(
      removerPerguntaDeAgendamento("Valor: R$ 100,00.\n\nPrecisa de mais alguma informação?"),
    ).toBe("Valor: R$ 100,00.\n\nPrecisa de mais alguma informação?");
  });
});
