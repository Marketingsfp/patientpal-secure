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
