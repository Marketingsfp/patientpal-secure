import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calendarioAplicavel,
  classificarPeriodo,
  dentroDaFaixa,
  instanteLocal,
  type CalendarioPublicado,
} from "../classificador-periodo";

/** Horários sintéticos — usados apenas nos testes, nunca na Base oficial. */
const cal = (o: Partial<CalendarioPublicado> = {}): CalendarioPublicado => ({
  versao_id: o.versao_id ?? "v1",
  versao: o.versao ?? 1,
  status: o.status ?? "publicado",
  publicado_em: o.publicado_em ?? "2026-01-01T12:00:00Z",
  vigencia_inicio: o.vigencia_inicio ?? "2026-01-01",
  vigencia_fim: o.vigencia_fim ?? null,
  fuso: o.fuso ?? "America/Sao_Paulo",
  clinica_id: o.clinica_id ?? "clinica-A",
  unidade_id: o.unidade_id ?? null,
  dias: o.dias ?? [
    // segunda: manhã + tarde (intervalo de almoço entre as faixas)
    { dia_semana: 1, fechado: false, faixas: [{ hora_inicio: "08:00", hora_fim: "12:00" }, { hora_inicio: "13:00", hora_fim: "18:00" }] },
    // terça: fechado explicitamente
    { dia_semana: 2, fechado: true, faixas: [] },
    // quarta: contínuo
    { dia_semana: 3, fechado: false, faixas: [{ hora_inicio: "07:00", hora_fim: "19:00" }] },
  ],
  excecoes: o.excecoes ?? [],
});

const classificar = (em: string | null, extra: Partial<Parameters<typeof classificarPeriodo>[0]> = {}) =>
  classificarPeriodo({
    em,
    escopo: { clinica_id: "clinica-A", unidade_id: null },
    calendarios: [cal()],
    ...extra,
  });

describe("Classificador de período — limites", () => {
  it("abertura incluída e fechamento excluído", () => {
    // 2026-03-02 é segunda-feira
    expect(classificar("2026-03-02T11:00:00Z").classificacao).toBe("DENTRO_DO_HORARIO"); // 08:00 local
    expect(classificar("2026-03-02T14:59:00Z").classificacao).toBe("DENTRO_DO_HORARIO"); // 11:59
    expect(classificar("2026-03-02T15:00:00Z").classificacao).toBe("FORA_DO_HORARIO"); // 12:00 exato
    expect(classificar("2026-03-02T20:59:00Z").classificacao).toBe("DENTRO_DO_HORARIO"); // 17:59
    expect(classificar("2026-03-02T21:00:00Z").classificacao).toBe("FORA_DO_HORARIO"); // 18:00 exato
  });

  it("intervalo entre duas faixas é fora do horário", () => {
    const r = classificar("2026-03-02T15:30:00Z"); // 12:30 local
    expect(r.classificacao).toBe("FORA_DO_HORARIO");
    expect(r.motivo).toBe("fora_das_faixas");
  });

  it("dia fechado é fora, e informa o motivo", () => {
    const r = classificar("2026-03-03T13:00:00Z"); // terça 10:00
    expect(r.classificacao).toBe("FORA_DO_HORARIO");
    expect(r.motivo).toBe("dia_fechado");
  });

  it("dia não configurado não vira fora do horário", () => {
    const r = classificar("2026-03-05T13:00:00Z"); // quinta, sem configuração
    expect(r.classificacao).toBe("NAO_CLASSIFICAVEL");
    expect(r.motivo).toBe("dia_nao_configurado");
    expect(r.versao).toBe(1);
  });

  it("dentroDaFaixa respeita [inicio, fim)", () => {
    const f = { hora_inicio: "08:00", hora_fim: "12:00" };
    expect(dentroDaFaixa("08:00", f)).toBe(true);
    expect(dentroDaFaixa("11:59", f)).toBe(true);
    expect(dentroDaFaixa("12:00", f)).toBe(false);
    expect(dentroDaFaixa("07:59", f)).toBe(false);
  });
});

describe("Classificador de período — exceções e vigência", () => {
  it("exceção fechada prevalece sobre a semana", () => {
    const c = cal({ excecoes: [{ data: "2026-03-02", tipo: "fechado" }] });
    const r = classificarPeriodo({
      em: "2026-03-02T13:00:00Z",
      escopo: { clinica_id: "clinica-A" },
      calendarios: [c],
    });
    expect(r.classificacao).toBe("FORA_DO_HORARIO");
    expect(r.motivo).toBe("excecao_fechado");
  });

  it("exceção especial define o horário daquela data", () => {
    const c = cal({ excecoes: [{ data: "2026-03-02", tipo: "especial", hora_inicio: "09:00", hora_fim: "11:00" }] });
    const base = { escopo: { clinica_id: "clinica-A" }, calendarios: [c] };
    expect(classificarPeriodo({ em: "2026-03-02T13:00:00Z", ...base }).classificacao).toBe("DENTRO_DO_HORARIO"); // 10:00
    expect(classificarPeriodo({ em: "2026-03-02T18:00:00Z", ...base }).motivo).toBe("excecao_especial_fora"); // 15:00
  });

  it("usa a versão que valia na data do evento", () => {
    const v1 = cal({ versao_id: "v1", versao: 1, status: "substituido", vigencia_inicio: "2026-01-01", vigencia_fim: "2026-05-31" });
    const v2 = cal({
      versao_id: "v2",
      versao: 2,
      vigencia_inicio: "2026-06-01",
      dias: [{ dia_semana: 1, fechado: false, faixas: [{ hora_inicio: "13:00", hora_fim: "19:00" }] }],
    });
    const base = { escopo: { clinica_id: "clinica-A" }, calendarios: [v1, v2] };
    const antigo = classificarPeriodo({ em: "2026-03-02T13:00:00Z", ...base }); // 10:00, segunda
    expect(antigo.versao).toBe(1);
    expect(antigo.classificacao).toBe("DENTRO_DO_HORARIO");
    const novo = classificarPeriodo({ em: "2026-06-01T13:00:00Z", ...base }); // 10:00, segunda
    expect(novo.versao).toBe(2);
    expect(novo.classificacao).toBe("FORA_DO_HORARIO");
  });

  it("evento anterior a qualquer versão não é classificável", () => {
    const c = cal({ vigencia_inicio: "2026-06-01" });
    const r = classificarPeriodo({ em: "2026-03-02T13:00:00Z", escopo: { clinica_id: "clinica-A" }, calendarios: [c] });
    expect(r.motivo).toBe("sem_versao_para_a_data");
    expect(r.classificacao).toBe("NAO_CLASSIFICAVEL");
  });

  it("sem calendário publicado é não classificável", () => {
    const r = classificarPeriodo({ em: "2026-03-02T13:00:00Z", escopo: { clinica_id: "clinica-A" }, calendarios: [] });
    expect(r.motivo).toBe("sem_calendario_publicado");
  });

  it("rascunho (sem publicação) não classifica", () => {
    const rascunho = cal({ publicado_em: null });
    const r = classificarPeriodo({ em: "2026-03-02T13:00:00Z", escopo: { clinica_id: "clinica-A" }, calendarios: [rascunho] });
    expect(r.motivo).toBe("sem_calendario_publicado");
  });
});

describe("Classificador de período — fuso e escopo", () => {
  it("lê o instante no fuso da operação sem alterar o valor original", () => {
    const local = instanteLocal("2026-03-02T02:00:00Z", "America/Sao_Paulo");
    expect(local).toEqual({ data: "2026-03-01", hora: "23:00", dow: 0 });
    // mesmo instante, outro fuso
    expect(instanteLocal("2026-03-02T02:00:00Z", "UTC")).toEqual({ data: "2026-03-02", hora: "02:00", dow: 1 });
  });

  it("meia-noite local cai no dia correto", () => {
    expect(instanteLocal("2026-03-02T03:00:00Z", "America/Sao_Paulo")).toEqual({ data: "2026-03-02", hora: "00:00", dow: 1 });
  });

  it("timestamp ausente ou inválido não vira fora do horário", () => {
    expect(classificar(null).motivo).toBe("timestamp_ausente_ou_invalido");
    expect(classificar("não é data").classificacao).toBe("NAO_CLASSIFICAVEL");
  });

  it("escopo desconhecido é não classificável", () => {
    const r = classificarPeriodo({ em: "2026-03-02T13:00:00Z", escopo: { clinica_id: null }, calendarios: [cal()] });
    expect(r.motivo).toBe("escopo_nao_identificavel");
  });

  it("calendário de outra clínica nunca é usado", () => {
    const r = classificarPeriodo({
      em: "2026-03-02T13:00:00Z",
      escopo: { clinica_id: "clinica-B" },
      calendarios: [cal({ clinica_id: "clinica-A" })],
    });
    expect(r.motivo).toBe("sem_versao_para_a_data");
  });

  it("não aplica calendário de unidade a evento sem unidade conhecida", () => {
    const unidade = cal({ unidade_id: "unidade-1" });
    const r = classificarPeriodo({
      em: "2026-03-02T13:00:00Z",
      escopo: { clinica_id: "clinica-A", unidade_id: null },
      calendarios: [unidade],
    });
    expect(r.motivo).toBe("sem_versao_para_a_data");
  });

  it("calendário geral vale para qualquer unidade; o da unidade tem precedência", () => {
    const geral = cal({ versao_id: "geral", unidade_id: null });
    const daUnidade = cal({
      versao_id: "un1",
      unidade_id: "unidade-1",
      dias: [{ dia_semana: 1, fechado: true, faixas: [] }],
    });
    const base = { em: "2026-03-02T13:00:00Z", calendarios: [geral, daUnidade] };
    expect(classificarPeriodo({ ...base, escopo: { clinica_id: "clinica-A", unidade_id: "unidade-2" } }).versao_id).toBe("geral");
    const r = classificarPeriodo({ ...base, escopo: { clinica_id: "clinica-A", unidade_id: "unidade-1" } });
    expect(r.versao_id).toBe("un1");
    expect(r.motivo).toBe("dia_fechado");
  });

  it("dois calendários iguais aplicáveis = conflito não resolvido", () => {
    const a = cal({ versao_id: "a", versao: 1 });
    const b = cal({ versao_id: "b", versao: 2 });
    const r = classificarPeriodo({ em: "2026-03-02T13:00:00Z", escopo: { clinica_id: "clinica-A" }, calendarios: [a, b] });
    expect(r.motivo).toBe("conflito_de_configuracao");
    expect(r.classificacao).toBe("NAO_CLASSIFICAVEL");
  });

  it("calendarioAplicavel isola escopo e data", () => {
    const { calendario } = calendarioAplicavel([cal()], { clinica_id: "clinica-A" }, "2026-03-02");
    expect(calendario?.versao_id).toBe("v1");
  });
});

describe("Classificador de período — não altera atendimento nem usa IA", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/nina/classificador-periodo.ts"), "utf8");
  const srcFn = readFileSync(resolve(process.cwd(), "src/lib/nina/classificador-periodo.functions.ts"), "utf8");

  it("não chama modelos de IA para comparar datas", () => {
    expect(/gemini|openai|gpt-|ai_gateway|lovable\/ai/i.test(src + srcFn)).toBe(false);
  });

  it("não escreve nada nem mexe em conversa, handoff ou timeout", () => {
    expect(/\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(src + srcFn)).toBe(false);
    expect(/handoff|resolver_conversa|timeout|responsavel_id/i.test(src)).toBe(false);
  });
});
