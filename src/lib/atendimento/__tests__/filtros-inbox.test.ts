import { describe, expect, it } from "bun:test";
import {
  atendenteConsulta,
  conversaNaVisualizacao,
  escopoConsulta,
  estadoDeEscopoLegado,
  lerValorEscopo,
  ordemVisualizacao,
  planoVisualizacao,
  rotuloEscopo,
  statusConsulta,
  valorEscopoControle,
  type EstadoFiltrosInbox,
} from "../filtros-inbox";

const base = (p: Partial<EstadoFiltrosInbox> = {}): EstadoFiltrosInbox => ({
  base: "minhas",
  atendenteId: null,
  visualizacao: "recentes",
  naoAtribuidas: false,
  gestor: false,
  meuId: "eu",
  ...p,
});

describe("filtros da Inbox em dois eixos", () => {
  it("escopo padrão é minhas e visualização recentes", () => {
    const e = base();
    expect(escopoConsulta(e)).toBe("minhas");
    expect(statusConsulta(e.visualizacao)).toBe("all");
    expect(ordemVisualizacao(e.visualizacao)).toBe("recentes");
  });

  it("atendente é escolhido por user_id, nunca por nome", () => {
    const valor = valorEscopoControle("equipe", "uuid-1");
    expect(valor).toBe("agente:uuid-1");
    expect(lerValorEscopo(valor)).toEqual({ base: "equipe", atendenteId: "uuid-1" });
    expect(lerValorEscopo("Jean")).toEqual({ base: "minhas", atendenteId: null });
  });

  it("sem supervisão o atendente escolhido é ignorado", () => {
    expect(atendenteConsulta(base({ atendenteId: "uuid-1", gestor: false }))).toBeNull();
    expect(atendenteConsulta(base({ atendenteId: "uuid-1", gestor: true }))).toBe("uuid-1");
  });

  it("resolvidas usa o histórico encerrado do escopo", () => {
    const e = base({ visualizacao: "resolvidas", gestor: true });
    expect(escopoConsulta(e)).toBe("fechadas");
    // O estado agora é decidido pela visualização no backend (closed + finished).
    expect(statusConsulta(e.visualizacao)).toBe("all");
    expect(planoVisualizacao(e.visualizacao)).toMatchObject({
      somenteResolvidas: true,
      ordenarPor: "resolved_at",
      ascendente: false,
    });
    // Supervisor pedindo as SUAS resolvidas não recebe o histórico da clínica.
    expect(atendenteConsulta(e)).toBe("eu");
    expect(atendenteConsulta({ ...e, base: "equipe" })).toBeNull();
  });

  it("maior tempo esperando ordena por espera e exige paciente aguardando", () => {
    expect(ordemVisualizacao("espera")).toBe("espera");
    expect(conversaNaVisualizacao("espera", null)).toBe(false);
    expect(conversaNaVisualizacao("espera", "2026-01-01T10:00:00Z")).toBe(true);
    expect(conversaNaVisualizacao("recentes", null)).toBe(true);
  });

  it("fila de não atribuídas continua acessível", () => {
    expect(escopoConsulta(base({ naoAtribuidas: true }))).toBe("nao_atribuidas");
    expect(estadoDeEscopoLegado("nao_atribuidas").naoAtribuidas).toBe(true);
    expect(estadoDeEscopoLegado("fechadas")).toEqual({
      base: "minhas",
      visualizacao: "resolvidas",
      naoAtribuidas: false,
    });
  });

  it("rótulo curto mostra o atendente quando há um selecionado", () => {
    expect(rotuloEscopo("minhas", null)).toBe("Minhas");
    expect(rotuloEscopo("equipe", null)).toBe("Todas");
    expect(rotuloEscopo("equipe", "Jean Telefone")).toBe("Jean Telefone");
  });
});

// FASE 2 — matriz Escopo × Visualização: as 9 combinações saem de UM modelo
// composicional (escopo + plano de visualização), sem regra própria por caso.
describe("matriz escopo × visualização", () => {
  const casos: Array<{
    nome: string;
    estado: Partial<EstadoFiltrosInbox>;
    escopo: string;
    atendente: string | null;
    plano: Partial<ReturnType<typeof planoVisualizacao>>;
  }> = [
    {
      nome: "1 minhas + recentes",
      estado: { base: "minhas", visualizacao: "recentes" },
      escopo: "minhas",
      atendente: null,
      plano: { somenteResolvidas: false, exigeEsperaPaciente: false, ordenarPor: "ultima_msg_em" },
    },
    {
      nome: "2 minhas + resolvidas",
      estado: { base: "minhas", visualizacao: "resolvidas", gestor: true },
      escopo: "fechadas",
      atendente: "eu",
      plano: { somenteResolvidas: true, ordenarPor: "resolved_at", ascendente: false },
    },
    {
      nome: "3 minhas + maior espera",
      estado: { base: "minhas", visualizacao: "espera" },
      escopo: "minhas",
      atendente: null,
      plano: { exigeEsperaPaciente: true, ordenarPor: "aguardando_desde", ascendente: true },
    },
    {
      nome: "4 atendente + recentes",
      estado: { base: "equipe", atendenteId: "jean", visualizacao: "recentes", gestor: true },
      escopo: "equipe",
      atendente: "jean",
      plano: { somenteResolvidas: false, ordenarPor: "ultima_msg_em" },
    },
    {
      nome: "5 atendente + resolvidas",
      estado: { base: "equipe", atendenteId: "jean", visualizacao: "resolvidas", gestor: true },
      escopo: "fechadas",
      atendente: "jean",
      plano: { somenteResolvidas: true, ordenarPor: "resolved_at" },
    },
    {
      nome: "6 atendente + maior espera",
      estado: { base: "equipe", atendenteId: "jean", visualizacao: "espera", gestor: true },
      escopo: "equipe",
      atendente: "jean",
      plano: { exigeEsperaPaciente: true, ordenarPor: "aguardando_desde", ascendente: true },
    },
    {
      nome: "7 todas + recentes",
      estado: { base: "equipe", visualizacao: "recentes", gestor: true },
      escopo: "equipe",
      atendente: null,
      plano: { ordenarPor: "ultima_msg_em", ascendente: false },
    },
    {
      nome: "8 todas + resolvidas",
      estado: { base: "equipe", visualizacao: "resolvidas", gestor: true },
      escopo: "fechadas",
      atendente: null,
      plano: { somenteResolvidas: true, ordenarPor: "resolved_at", ascendente: false },
    },
    {
      nome: "9 todas + maior espera",
      estado: { base: "equipe", visualizacao: "espera", gestor: true },
      escopo: "equipe",
      atendente: null,
      plano: { exigeEsperaPaciente: true, ordenarPor: "aguardando_desde", ascendente: true },
    },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      const e = base(caso.estado);
      expect(escopoConsulta(e)).toBe(caso.escopo as any);
      expect(atendenteConsulta(e)).toBe(caso.atendente);
      expect(planoVisualizacao(e.visualizacao)).toMatchObject(caso.plano);
      // O estado da conversa nunca volta pelo parâmetro antigo de status.
      expect(statusConsulta(e.visualizacao)).toBe("all");
    });
  }

  it("sem supervisão o atendente escolhido não entra na consulta", () => {
    const e = base({ base: "equipe", atendenteId: "jean", visualizacao: "recentes", gestor: false });
    expect(atendenteConsulta(e)).toBeNull();
  });

  it("fila de não atribuídas continua tendo prioridade sobre a visualização", () => {
    const e = base({ naoAtribuidas: true, visualizacao: "resolvidas", gestor: true });
    expect(escopoConsulta(e)).toBe("nao_atribuidas");
  });
});
