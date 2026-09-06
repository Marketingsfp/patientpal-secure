/**
 * FASE 5 — regras de exibição do desempenho dentro/fora do horário.
 * Dados sintéticos; nada é publicado nem gravado.
 */
import { describe, it, expect } from "bun:test";
import {
  FILTROS_PERIODO,
  contagem,
  formatarDuracao,
  formatarTaxa,
  rotuloMotivo,
  taxa,
  type DesempenhoPeriodo,
} from "../desempenho-periodo";

const base: DesempenhoPeriodo = {
  fuso: "America/Sao_Paulo",
  geradoEm: "2026-09-06T12:00:00Z",
  buckets: {
    DENTRO_DO_HORARIO: {
      mensagem: { eventos: 40, distintos: 40 },
      resposta_nina: { eventos: 20, distintos: 20 },
      resposta_avaliada: { eventos: 10, distintos: 10 },
      erro_reportado: { eventos: 5, distintos: 2 },
      erro_confirmado: { eventos: 1, distintos: 1 },
      suspeita_ia: { eventos: 3, distintos: 3 },
    },
    FORA_DO_HORARIO: {
      mensagem: { eventos: 10, distintos: 10 },
      resposta_nina: { eventos: 6, distintos: 6 },
      erro_reportado: { eventos: 2, distintos: 1 },
    },
    NAO_CLASSIFICAVEL: { mensagem: { eventos: 4, distintos: 4 } },
  },
  total: {
    mensagem: { eventos: 54, distintos: 54 },
    resposta_nina: { eventos: 26, distintos: 26 },
    resposta_avaliada: { eventos: 10, distintos: 10 },
    erro_reportado: { eventos: 7, distintos: 3 },
  },
  tempoResposta: {
    DENTRO_DO_HORARIO: { amostras: 4, medianaSegundos: 90, mediaSegundos: 120 },
  },
  conversas: {
    unicasTotal: 12,
    iniciadas: { DENTRO_DO_HORARIO: 8, FORA_DO_HORARIO: 4 },
    comInteracao: { DENTRO_DO_HORARIO: 10, FORA_DO_HORARIO: 6 },
    observacao: "podem se sobrepor",
  },
  naoClassificavel: {
    eventos: 4,
    motivos: [{ motivo: "dia_nao_configurado", eventos: 4 }],
  },
  versoesUtilizadas: [{ versaoId: "v1", versao: "1" }],
  limitacoes: ["limite"],
};

describe("filtro de período", () => {
  it("oferece os quatro recortes pedidos", () => {
    expect(FILTROS_PERIODO.map((f) => f.valor)).toEqual([
      "todos",
      "DENTRO_DO_HORARIO",
      "FORA_DO_HORARIO",
      "NAO_CLASSIFICAVEL",
    ]);
  });

  it("conta por recorte e no total", () => {
    expect(contagem(base, "DENTRO_DO_HORARIO", "mensagem")).toBe(40);
    expect(contagem(base, "FORA_DO_HORARIO", "mensagem")).toBe(10);
    expect(contagem(base, "NAO_CLASSIFICAVEL", "mensagem")).toBe(4);
    expect(contagem(base, "todos", "mensagem")).toBe(54);
  });

  it("indicador ausente no recorte vale zero, não quebra a tela", () => {
    expect(contagem(base, "FORA_DO_HORARIO", "resposta_avaliada")).toBe(0);
    expect(contagem(null, "todos", "mensagem")).toBe(0);
  });

  it("vários reportes da mesma resposta contam uma resposta com erro", () => {
    expect(contagem(base, "DENTRO_DO_HORARIO", "erro_reportado")).toBe(5);
    expect(contagem(base, "DENTRO_DO_HORARIO", "erro_reportado", "distintos")).toBe(2);
  });
});

describe("taxas com denominador explícito", () => {
  it("mostra numerador e denominador", () => {
    const t = taxa(
      contagem(base, "DENTRO_DO_HORARIO", "erro_confirmado", "distintos"),
      contagem(base, "DENTRO_DO_HORARIO", "resposta_avaliada"),
    );
    expect(t).toEqual({ numerador: 1, denominador: 10, percentual: 10 });
    expect(formatarTaxa(t)).toBe("10.0% (1/10)");
  });

  it("denominador zero vira ausência de dado, nunca 0%", () => {
    const t = taxa(0, 0);
    expect(t.percentual).toBeNull();
    expect(formatarTaxa(t)).toBe("Sem dados");
  });

  it("fora do horário sem avaliações não inventa taxa", () => {
    const t = taxa(
      contagem(base, "FORA_DO_HORARIO", "erro_confirmado", "distintos"),
      contagem(base, "FORA_DO_HORARIO", "resposta_avaliada"),
    );
    expect(formatarTaxa(t)).toBe("Sem dados");
  });
});

describe("conversas e limitações", () => {
  it("iniciadas e com interação podem se sobrepor sem inflar o total", () => {
    const iniciadas =
      (base.conversas.iniciadas.DENTRO_DO_HORARIO ?? 0) +
      (base.conversas.iniciadas.FORA_DO_HORARIO ?? 0);
    const interacoes =
      (base.conversas.comInteracao.DENTRO_DO_HORARIO ?? 0) +
      (base.conversas.comInteracao.FORA_DO_HORARIO ?? 0);
    expect(iniciadas).toBe(base.conversas.unicasTotal);
    expect(interacoes).toBeGreaterThan(base.conversas.unicasTotal);
  });

  it("explica o motivo de não classificável em linguagem simples", () => {
    expect(rotuloMotivo("dia_nao_configurado")).toContain("não é o mesmo que fechado");
    expect(rotuloMotivo("motivo_novo")).toBe("motivo_novo");
  });

  it("formata duração e ausência de amostra", () => {
    expect(formatarDuracao(90)).toBe("1min 30s");
    expect(formatarDuracao(null)).toBe("—");
  });
});
