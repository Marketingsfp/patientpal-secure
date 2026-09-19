import { describe, expect, it } from "bun:test";
import {
  calcularProgresso,
  regrasPadrao,
  type ProvaProgresso,
  type SessaoProgresso,
} from "@/lib/coach/treinamento-plano";

const HOJE = "2026-09-19";
const regras = regrasPadrao(HOJE);

function sessao(
  dia: string,
  modo: "voz" | "texto",
  nota: number,
  simulacaoGestor = false,
): SessaoProgresso {
  return {
    created_at: `${dia}T14:00:00.000Z`,
    modo,
    nota,
    simulacao_gestor: simulacaoGestor,
  };
}

function prova(dia: string, nota: number, simulacaoGestor = false): ProvaProgresso {
  return { created_at: `${dia}T14:00:00.000Z`, nota, simulacao_gestor: simulacaoGestor };
}

describe("calcularProgresso", () => {
  it("conta a meta do dia só com sessões de hoje e nota mínima", () => {
    const p = calcularProgresso(
      [
        sessao(HOJE, "texto", 8),
        sessao(HOJE, "texto", 4), // abaixo da nota mínima
        sessao("2026-09-18", "texto", 9), // ontem
        sessao(HOJE, "voz", 7),
      ],
      [],
      [{ dia: HOJE, segundos: 1800 }],
      regras,
    );
    expect(p.hoje.whatsapp).toBe(1);
    expect(p.hoje.ligacoes).toBe(1);
    expect(p.hoje.provaFeita).toBe(false);
    expect(p.hoje.completo).toBe(false);
  });

  it("mantém a trilha concluída no dia seguinte (acumulado)", () => {
    const sessoes = [
      ...Array.from({ length: 5 }, () => sessao("2026-09-18", "texto", 8)),
      ...Array.from({ length: 5 }, () => sessao("2026-09-18", "voz", 8)),
    ];
    const p = calcularProgresso(sessoes, [prova("2026-09-18", 7)], [], regras);
    expect(p.trilha.concluida).toBe(true);
    expect(p.trilha.percentual).toBe(100);
    // ...e o "o que fazer hoje" recomeça do zero
    expect(p.hoje.percentual).toBe(0);
  });

  it("ignora simulações feitas pelo gestor", () => {
    const p = calcularProgresso(
      [sessao(HOJE, "texto", 9, true), sessao(HOJE, "texto", 9)],
      [prova(HOJE, 10, true)],
      [],
      regras,
    );
    expect(p.hoje.whatsapp).toBe(1);
    expect(p.totais.sessoes).toBe(1);
    expect(p.trilha.provaAprovada).toBe(false);
  });

  it("aprova a trilha só com prova acima da nota mínima", () => {
    const p = calcularProgresso([], [prova(HOJE, 5)], [], regras);
    expect(p.trilha.provaAprovada).toBe(false);
    const q = calcularProgresso([], [prova(HOJE, 6)], [], regras);
    expect(q.trilha.provaAprovada).toBe(true);
  });

  it("soma tempo do dia e acumulado, com dias de constância", () => {
    const p = calcularProgresso(
      [],
      [],
      [
        { dia: HOJE, segundos: 3600 },
        { dia: "2026-09-18", segundos: 600 },
        { dia: "2026-09-17", segundos: 0 },
      ],
      regras,
    );
    expect(p.hoje.segundos).toBe(3600);
    expect(p.totais.segundos).toBe(4200);
    expect(p.totais.dias).toBe(2);
  });
});
