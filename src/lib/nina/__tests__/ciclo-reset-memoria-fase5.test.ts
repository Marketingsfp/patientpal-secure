/**
 * FASE 5 — Consolidação do reset de memória por ciclo (homologação).
 *
 * Testes puros das regras: encerramento marca o reset, o histórico continua
 * auditável, ciclos e sessões não se misturam e o handoff é idempotente.
 */
import { describe, expect, it } from "bun:test";
import {
  ciclosSemProvaDeReset,
  cicloAtivo,
  cicloAtivoDoLead,
  diagnosticoCiclos,
  divisorFimCiclo,
  divisorInicioCiclo,
  inconsistenciasCiclos,
  novoNinaSessionId,
  patchEncerrarCiclo,
  podeEncerrar,
  type CicloDiagnosticoRow,
} from "@/lib/nina/ciclo-teste";

function ciclo(n: number, extra: Partial<CicloDiagnosticoRow> = {}): CicloDiagnosticoRow {
  const id = `c${n}`;
  return {
    id,
    lead_id: "lead-1",
    status: "resolvido",
    sessao_seq: n,
    conversa_id: `conv-${n}`,
    nina_session_id: novoNinaSessionId(id),
    started_at: `2026-09-07T10:${String(n).padStart(2, "0")}:00Z`,
    ended_at: `2026-09-07T10:${String(n).padStart(2, "0")}:30Z`,
    memory_reset_at: `2026-09-07T10:${String(n).padStart(2, "0")}:30Z`,
    ...extra,
  };
}

describe("encerramento marca o reset da memória", () => {
  it("grava fim, motivo e o instante do reset", () => {
    const p = patchEncerrarCiclo("handoff_humano", "2026-09-07T12:00:00Z");
    expect(p.status).toBe("encerrado_handoff");
    expect(p.end_reason).toBe("handoff_humano");
    expect(p.ended_at).toBe("2026-09-07T12:00:00Z");
    expect(p.memory_reset_at).toBe("2026-09-07T12:00:00Z");
  });

  it("não apaga histórico: o patch só toca campos do próprio ciclo", () => {
    const chaves = Object.keys(patchEncerrarCiclo("cenario_concluido"));
    expect(chaves.sort()).toEqual(
      ["end_reason", "ended_at", "memory_reset_at", "resolved_at", "status"].sort(),
    );
  });
});

describe("Teste 4 — handoff duplicado", () => {
  it("só o primeiro encerramento vale", () => {
    const ativo = ciclo(1, { status: "ativo", ended_at: null, memory_reset_at: null });
    expect(podeEncerrar(ativo)).toBe(true);
    const encerrado = { ...ativo, ...patchEncerrarCiclo("handoff_humano") };
    expect(podeEncerrar(encerrado)).toBe(false);
    expect(cicloAtivo(encerrado.status)).toBe(false);
  });
});

describe("Teste 5 — 10 cenários consecutivos no mesmo lead", () => {
  const dez = Array.from({ length: 10 }, (_, i) => ciclo(i + 1));

  it("cada ciclo tem id, sessão e sessão de memória próprios", () => {
    const linhas = diagnosticoCiclos(dez);
    expect(linhas).toHaveLength(10);
    expect(new Set(linhas.map((l) => l.cycle_id)).size).toBe(10);
    expect(new Set(linhas.map((l) => l.nina_session_id)).size).toBe(10);
    expect(new Set(linhas.map((l) => l.sessao)).size).toBe(10);
    expect(new Set(linhas.map((l) => l.conversa_id)).size).toBe(10);
    expect(linhas.map((l) => l.ciclo_seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("todos os ciclos encerrados têm prova de reset", () => {
    expect(ciclosSemProvaDeReset(diagnosticoCiclos(dez))).toHaveLength(0);
  });

  it("aponta ciclo encerrado sem prova de reset", () => {
    const suspeito = [ciclo(1, { memory_reset_at: null })];
    expect(ciclosSemProvaDeReset(diagnosticoCiclos(suspeito))).toHaveLength(1);
  });
});

describe("Testes 1, 2 e 3 — nada transitório atravessa a fronteira", () => {
  it("um ciclo encerrado nunca volta a ser o ciclo ativo", () => {
    const antigo = ciclo(1);
    const novo = ciclo(2, { status: "ativo", ended_at: null, memory_reset_at: null });
    const ativoAgora = cicloAtivoDoLead([antigo, novo], "lead-1");
    expect(ativoAgora?.id).toBe("c2");
    // nome/procedimento/médico coletados, confirmação pendente e prazos ficam
    // no ciclo 1: o ciclo ativo não compartilha conversa nem sessão.
    expect(ativoAgora?.conversa_id).not.toBe(antigo.conversa_id);
    expect(ativoAgora?.nina_session_id).not.toBe(antigo.nina_session_id);
  });

  it("um lead nunca tem dois ciclos ativos", () => {
    const dois = [
      ciclo(1, { status: "ativo", ended_at: null }),
      ciclo(2, { status: "ativo", ended_at: null }),
    ];
    expect(inconsistenciasCiclos(dois).some((p) => p.includes("2 ciclos ativos"))).toBe(true);
  });
});

describe("Teste 6 — leads em paralelo", () => {
  it("o ciclo ativo é sempre o do próprio lead", () => {
    const a = { ...ciclo(3, { status: "ativo", ended_at: null }), lead_id: "lead-A" };
    const b = { ...ciclo(7, { status: "ativo", ended_at: null }), id: "cB", lead_id: "lead-B" };
    expect(cicloAtivoDoLead([a, b], "lead-A")?.id).toBe("c3");
    expect(cicloAtivoDoLead([a, b], "lead-B")?.id).toBe("cB");
    expect(inconsistenciasCiclos([a, b])).toHaveLength(0);
  });
});

describe("Teste 7 — auditoria de ciclo antigo", () => {
  it("ciclos encerrados continuam listados com conversa e sessão originais", () => {
    const linhas = diagnosticoCiclos([ciclo(1), ciclo(2, { status: "encerrado_handoff", end_reason: "handoff_humano" })]);
    const antigo = linhas[0]!;
    expect(antigo.cycle_status).toBe("completed");
    expect(antigo.conversa_id).toBe("conv-1");
    expect(antigo.started_at).toBeTruthy();
    expect(antigo.ended_at).toBeTruthy();
    const ultimo = linhas[1]!;
    expect(ultimo.cycle_status).toBe("completed_handoff");
    expect(ultimo.end_reason).toBe("handoff_humano");
  });
});

describe("linha do tempo interna", () => {
  it("registra encerramento e início com o texto pedido", () => {
    expect(divisorFimCiclo(31, "handoff_humano")).toBe(
      "───── Ciclo 31 encerrado — handoff para atendimento humano ─────",
    );
    expect(divisorInicioCiclo(32)).toBe("───── Ciclo 32 iniciado — nova sessão da Nina ─────");
  });
});
