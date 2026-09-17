import { describe, expect, it } from "bun:test";
import { agoraNaClinica } from "./nina-agora";
import { comporRequestNina, validarRuntimeContext } from "./nina/prompt-composer";

describe("referência temporal da Nina", () => {
  it.each([
    ["2026-09-17T07:59:00Z", "04:59", "noite", "Boa noite"],
    ["2026-09-17T08:00:00Z", "05:00", "manha", "Bom dia"],
    ["2026-09-17T14:59:00Z", "11:59", "manha", "Bom dia"],
    ["2026-09-17T15:00:00Z", "12:00", "tarde", "Boa tarde"],
    ["2026-09-17T16:33:00Z", "13:33", "tarde", "Boa tarde"],
    ["2026-09-17T20:59:00Z", "17:59", "tarde", "Boa tarde"],
    ["2026-09-17T21:00:00Z", "18:00", "noite", "Boa noite"],
    ["2026-09-18T03:00:00Z", "00:00", "noite", "Boa noite"],
  ])("%s usa o período local %s", (instante, hora, periodo, saudacao) => {
    expect(agoraNaClinica(undefined, new Date(instante))).toMatchObject({
      hora, periodo_do_dia: periodo, saudacao_do_periodo: saudacao, fuso: "America/Sao_Paulo",
    });
  });

  it("UTC já no dia seguinte não adianta hoje nem amanhã", () => {
    const a = agoraNaClinica(undefined, new Date("2026-09-18T02:59:00Z"));
    expect(a.iso).toBe("2026-09-17");
    expect(a.diaSemana).toBe(4);
    expect(a.datas_referencia).toMatchObject({
      hoje: "2026-09-17", amanha: "2026-09-18", depois_de_amanha: "2026-09-19",
      semana_atual: { inicio: "2026-09-14", fim: "2026-09-20" },
      proxima_semana: { inicio: "2026-09-21", fim: "2026-09-27" },
    });
  });

  it.each([
    ["2026-09-20T15:00:00Z", "2026-09-21"],
    ["2026-09-21T03:00:00Z", "2026-09-28"],
    ["2026-12-31T15:00:00Z", "2027-01-04"],
  ])("próxima semana é civil, inclusive domingo e virada do ano (%s)", (instante, inicio) => {
    expect(agoraNaClinica(undefined, new Date(instante)).datas_referencia.proxima_semana.inicio).toBe(inicio);
  });

  it("calcula amanhã no ano bissexto", () => {
    const a = agoraNaClinica(undefined, new Date("2028-02-28T15:00:00Z"));
    expect(a.datas_referencia.amanha).toBe("2028-02-29");
    expect(a.datas_referencia.depois_de_amanha).toBe("2028-03-01");
    expect(a.datas_referencia.proximos_dias[1]).toEqual({ data: "2028-02-29", dia_semana: 2, nome_dia: "terça-feira" });
  });

  it("cada turno recebe a data atualizada sem depender do início da sessão", () => {
    const antes = agoraNaClinica(undefined, new Date("2026-09-18T02:59:59Z"));
    const depois = agoraNaClinica(undefined, new Date("2026-09-18T03:00:00Z"));
    expect(antes.iso).toBe("2026-09-17");
    expect(depois.iso).toBe("2026-09-18");
  });

  it("contexto contém fatos temporais, preservando o prompt publicado", () => {
    const runtimeContext = { data_hora_atual: agoraNaClinica(undefined, new Date("2026-09-17T16:33:00Z")) };
    const publicado = "Siga as instruções publicadas desta clínica.";
    const request = comporRequestNina({ behaviorPrompt: publicado, runtimeContext });
    expect(request.behaviorPrompt).toBe(publicado);
    expect(validarRuntimeContext(runtimeContext)).toEqual([]);
    expect(request.systemPrompt).toContain('"saudacao_do_periodo": "Boa tarde"');
  });
});
