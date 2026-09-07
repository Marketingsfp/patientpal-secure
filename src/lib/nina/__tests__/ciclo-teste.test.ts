import { describe, expect, it } from "bun:test";
import {
  cicloAtivo,
  cicloAtivoDoLead,
  estadoCiclo,
  inconsistenciasCiclos,
  novoNinaSessionId,
  patchEncerrarCiclo,
  podeEncerrar,
  statusCiclo,
  statusPorMotivo,
  type CicloTeste,
} from "@/lib/nina/ciclo-teste";

const ciclo = (over: Partial<CicloTeste>): CicloTeste => ({
  id: "c1",
  lead_id: "l1",
  status: "ativo",
  ...over,
});

describe("ciclo de teste da Nina", () => {
  it("mapeia situações persistidas para o vocabulário da homologação", () => {
    expect(estadoCiclo("ativo")).toBe("active");
    expect(estadoCiclo("resolvido")).toBe("completed");
    expect(estadoCiclo("encerrado_handoff")).toBe("completed_handoff");
    expect(estadoCiclo("cancelado")).toBe("cancelled");
    expect(estadoCiclo("falhou")).toBe("failed");
    expect(statusCiclo("completed_handoff")).toBe("encerrado_handoff");
  });

  it("encerra com motivo, data e situação coerentes", () => {
    const p = patchEncerrarCiclo("handoff_humano", "2026-09-07T12:00:00.000Z");
    expect(p).toEqual({
      status: "encerrado_handoff",
      end_reason: "handoff_humano",
      ended_at: "2026-09-07T12:00:00.000Z",
      memory_reset_at: "2026-09-07T12:00:00.000Z",
      resolved_at: "2026-09-07T12:00:00.000Z",

    });
    expect(statusPorMotivo("falha_tecnica")).toBe("falhou");
  });

  it("um lead pode ter vários ciclos, mas só um ativo", () => {
    const lista = [
      ciclo({ id: "c1", status: "resolvido", ended_at: "2026-09-01T10:00:00Z" }),
      ciclo({ id: "c2", status: "ativo" }),
      ciclo({ id: "c3", lead_id: "l2", status: "ativo" }),
    ];
    expect(cicloAtivoDoLead(lista, "l1")?.id).toBe("c2");
    expect(inconsistenciasCiclos(lista)).toEqual([]);
  });

  it("aponta inconsistências (dois ativos, encerrado sem data)", () => {
    const lista = [
      ciclo({ id: "c1" }),
      ciclo({ id: "c2" }),
      ciclo({ id: "c3", status: "resolvido" }),
    ];
    const p = inconsistenciasCiclos(lista);
    expect(p).toContain("lead l1 com 3 ciclos ativos".replace("3", "2"));
    expect(p).toContain("ciclo c3 encerrado sem data de encerramento");
  });

  it("só encerra ciclo ativo e gera sessão própria de memória", () => {
    expect(podeEncerrar(ciclo({}))).toBe(true);
    expect(podeEncerrar(ciclo({ status: "resolvido" }))).toBe(false);
    expect(cicloAtivo("resolvido")).toBe(false);
    expect(novoNinaSessionId("abc")).toBe("nina_sess_abc");
  });
});
