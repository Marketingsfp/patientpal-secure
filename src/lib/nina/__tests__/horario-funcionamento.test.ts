import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  estadoDoDia,
  podeEditarHorario,
  validarDia,
  validarExcecao,
  validarVigencia,
} from "../horario-funcionamento";

const dia = (fechado: boolean, faixas: Array<[string, string]>) => ({
  dia_semana: 1,
  fechado,
  faixas: faixas.map(([hora_inicio, hora_fim]) => ({ hora_inicio, hora_fim })),
});

describe("Horário de funcionamento — estados", () => {
  it("distingue fechado de não configurado", () => {
    expect(estadoDoDia(undefined)).toBe("nao_configurado");
    expect(estadoDoDia(dia(false, []))).toBe("nao_configurado");
    expect(estadoDoDia(dia(true, []))).toBe("fechado");
    expect(estadoDoDia(dia(false, [["08:00", "12:00"]]))).toBe("aberto");
  });
});

describe("Horário de funcionamento — validações", () => {
  it("aceita faixa contínua e manhã + tarde", () => {
    expect(validarDia(dia(false, [["07:00", "19:00"]]))).toEqual([]);
    expect(
      validarDia(
        dia(false, [
          ["07:00", "12:00"],
          ["13:00", "18:00"],
        ]),
      ),
    ).toEqual([]);
  });

  it("recusa faixas sobrepostas", () => {
    const erros = validarDia(
      dia(false, [
        ["08:00", "13:00"],
        ["12:00", "18:00"],
      ]),
    );
    expect(erros.some((e) => e.includes("sobrepostas"))).toBe(true);
  });

  it("recusa registro incompleto", () => {
    expect(validarDia(dia(false, [["08:00", ""]]))[0]).toContain("00:00");
  });

  it("recusa horário igual e explica a meia-noite", () => {
    expect(validarDia(dia(false, [["08:00", "08:00"]]))[0]).toContain("igual");
    expect(validarDia(dia(false, [["22:00", "02:00"]]))[0]).toContain("meia-noite");
  });

  it("dia fechado não pode ter faixas", () => {
    expect(validarDia(dia(true, [["08:00", "12:00"]]))[0]).toContain("fechado");
  });

  it("valida vigência", () => {
    expect(validarVigencia("2026-09-06")).toEqual([]);
    expect(validarVigencia("")).toHaveLength(1);
    expect(validarVigencia("2026-09-06", "2026-09-01")).toHaveLength(1);
  });

  it("valida exceções por data", () => {
    expect(validarExcecao({ data: "2026-12-25", tipo: "fechado" })).toEqual([]);
    expect(
      validarExcecao({ data: "2026-12-24", tipo: "especial", hora_inicio: "08:00", hora_fim: "12:00" }),
    ).toEqual([]);
    expect(validarExcecao({ data: "2026-12-24", tipo: "especial" })).toHaveLength(1);
    expect(
      validarExcecao({ data: "2026-12-24", tipo: "especial", hora_inicio: "20:00", hora_fim: "02:00" })[0],
    ).toContain("meia-noite");
    expect(validarExcecao({ data: "", tipo: "fechado" })).toHaveLength(1);
  });

  it("permissão só para admin/gestor", () => {
    expect(podeEditarHorario("admin")).toBe(true);
    expect(podeEditarHorario("gestor")).toBe(true);
    expect(podeEditarHorario("recepcao")).toBe(false);
    expect(podeEditarHorario(null)).toBe(false);
  });
});

describe("Horário de funcionamento — backend", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/nina/horario-funcionamento.functions.ts"), "utf8");

  it("reutiliza o calendário existente, sem criar tabela nova", () => {
    expect(src).toContain("nina_calendario_atendimento");
    expect(src).toContain("nina_calendario_excecoes");
  });

  it("exige autenticação real e papel no backend", () => {
    expect(src).toContain("requireSupabaseAuth");
    expect(src.match(/exigirAdmin/g)?.length).toBeGreaterThanOrEqual(4);
    expect(src).toContain("context.userId");
  });
});
