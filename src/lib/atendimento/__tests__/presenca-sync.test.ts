import { describe, expect, test } from "bun:test";
import {
  SINCRONIA_INICIAL,
  aplicarAtualizacao,
  precisaRelerOficial,
  type EscopoPresenca,
} from "../presenca-sync";

const escopo: EscopoPresenca = { clinicaId: "clinica-A", userId: "atendente-1" };
const upd = (p: Partial<Parameters<typeof aplicarAtualizacao>[2]> = {}) => ({
  clinicaId: "clinica-A",
  userId: "atendente-1",
  estado: "ONLINE" as const,
  versao: 1,
  ...p,
});

describe("FASE 4 — sincronização entre abas e concorrência", () => {
  test("duas abas: a escolha de Pausa numa aba passa a valer na outra", () => {
    // Aba 2 estava mostrando Online (versão 3)
    const aba2 = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ versao: 3, seq: 1 })).estado;
    expect(aba2.estado).toBe("ONLINE");
    // Aba 1 escolheu Pausa → versão 4 chega pela sincronização
    const r = aplicarAtualizacao(aba2, escopo, upd({ estado: "PAUSA", versao: 4, seq: 2 }));
    expect(r.aceita).toBe(true);
    expect(r.estado.estado).toBe("PAUSA");
  });

  test("resposta atrasada de uma consulta antiga não restaura Online", () => {
    const atual = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: "PAUSA", versao: 4, seq: 5 })).estado;
    // Consulta iniciada ANTES da pausa responde agora, trazendo a versão antiga
    const r = aplicarAtualizacao(atual, escopo, upd({ estado: "ONLINE", versao: 3, seq: 2 }));
    expect(r.aceita).toBe(false);
    expect(r).toMatchObject({ motivo: "versao_antiga" });
    expect(r.estado.estado).toBe("PAUSA");
  });

  test("respostas fora de ordem com a mesma versão: vale a mais recente pedida", () => {
    const atual = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: "OFFLINE", versao: 7, seq: 9 })).estado;
    const r = aplicarAtualizacao(atual, escopo, upd({ estado: "ONLINE", versao: 7, seq: 4 }));
    expect(r.aceita).toBe(false);
    expect(r).toMatchObject({ motivo: "resposta_fora_de_ordem" });
    expect(r.estado.estado).toBe("OFFLINE");
  });

  test("heartbeat atrasado (mesma versão, sem escolha nova) não muda nada", () => {
    const atual = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: "PAUSA", versao: 2, seq: 3 })).estado;
    const r = aplicarAtualizacao(atual, escopo, upd({ estado: "ONLINE", versao: 1, seq: 10 }));
    expect(r.aceita).toBe(false);
    expect(r.estado.estado).toBe("PAUSA");
  });

  test("reconexão relê o oficial e preserva a última escolha confirmada", () => {
    const atual = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: "OFFLINE", versao: 5, seq: 1 })).estado;
    // Ao reconectar, a tela relê: o servidor devolve a MESMA escolha e versão
    const r = aplicarAtualizacao(atual, escopo, upd({ estado: "OFFLINE", versao: 5, seq: 2 }));
    expect(r.aceita).toBe(true);
    expect(r.estado.estado).toBe("OFFLINE");
    expect(r.estado.versao).toBe(5);
  });

  test("presença de outra clínica não contamina o escopo atual", () => {
    const atual = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: "PAUSA", versao: 2 })).estado;
    const r = aplicarAtualizacao(atual, escopo, upd({ clinicaId: "clinica-B", estado: "ONLINE", versao: 99 }));
    expect(r.aceita).toBe(false);
    expect(r).toMatchObject({ motivo: "outra_clinica" });
    expect(r.estado.estado).toBe("PAUSA");
  });

  test("presença de outro atendente é ignorada", () => {
    const atual = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: "PAUSA", versao: 2 })).estado;
    const r = aplicarAtualizacao(atual, escopo, upd({ userId: "atendente-2", estado: "ONLINE", versao: 50 }));
    expect(r.aceita).toBe(false);
    expect(r).toMatchObject({ motivo: "outro_atendente" });
  });

  test("primeira leitura sem escolha registrada é aceita como pendência", () => {
    const r = aplicarAtualizacao(SINCRONIA_INICIAL, escopo, upd({ estado: null, versao: 0, seq: 0 }));
    expect(r.aceita).toBe(true);
    expect(r.estado.estado).toBeNull();
  });

  test("conflito de versão ao gravar obriga reler o estado oficial", () => {
    expect(precisaRelerOficial(true)).toBe(true);
    expect(precisaRelerOficial(false)).toBe(false);
    expect(precisaRelerOficial(undefined)).toBe(false);
  });
});
