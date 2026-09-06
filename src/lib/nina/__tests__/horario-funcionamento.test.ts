import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  conflitosDeVigencia,
  ehRetroativa,
  estadoDoDia,
  podeEditarHorario,
  podePublicarRetroativo,
  validarDia,
  validarExcecao,
  validarPublicacao,
  validarVigencia,
  versaoAplicavel,
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
    expect(src.match(/exigirAdmin|versaoEditavel/g)?.length).toBeGreaterThanOrEqual(6);
    expect(src).toContain("context.userId");
  });
});

/* ------------------------------------------------------------------ */
/* FASE 2 — publicação, vigência e histórico                           */
/* ------------------------------------------------------------------ */

const V = (o: Partial<any>) => ({
  id: o.id ?? "x",
  versao: o.versao ?? 1,
  status: o.status ?? "publicado",
  vigencia_inicio: o.vigencia_inicio ?? "2026-01-01",
  vigencia_fim: o.vigencia_fim ?? null,
  publicado_em: o.publicado_em ?? "2026-01-01T10:00:00Z",
});

describe("Horário — versões e histórico", () => {
  it("rascunho nunca é usado como horário oficial", () => {
    const versoes = [V({ id: "r", versao: 2, status: "rascunho", publicado_em: null, vigencia_inicio: "2026-01-01" })];
    expect(versaoAplicavel(versoes as any, "2026-06-01")).toBeNull();
  });

  it("usa a versão que valia na data do atendimento", () => {
    const v1 = V({ id: "v1", versao: 1, status: "substituido", vigencia_inicio: "2026-01-01", vigencia_fim: "2026-05-31" });
    const v2 = V({ id: "v2", versao: 2, vigencia_inicio: "2026-06-01" });
    expect(versaoAplicavel([v1, v2] as any, "2026-03-10")?.id).toBe("v1");
    expect(versaoAplicavel([v1, v2] as any, "2026-07-10")?.id).toBe("v2");
  });

  it("não presume horário quando o calendário histórico é desconhecido", () => {
    const v2 = V({ id: "v2", versao: 2, vigencia_inicio: "2026-06-01" });
    expect(versaoAplicavel([v2] as any, "2026-01-15")).toBeNull();
  });

  it("detecta conflito de vigência entre versões oficiais", () => {
    const atual = V({ id: "v1", versao: 1, vigencia_inicio: "2026-01-01" });
    const conflitos = conflitosDeVigencia({ id: "v2", vigencia_inicio: "2026-06-01" }, [atual] as any);
    expect(conflitos.map((c) => c.id)).toEqual(["v1"]);
    const semConflito = conflitosDeVigencia(
      { id: "v3", vigencia_inicio: "2026-06-01" },
      [V({ id: "v1", vigencia_inicio: "2026-01-01", vigencia_fim: "2026-05-31" })] as any,
    );
    expect(semConflito).toHaveLength(0);
  });

  it("retroativo só com administrador e justificativa", () => {
    expect(ehRetroativa("2026-01-01", "2026-06-01")).toBe(true);
    expect(podePublicarRetroativo("gestor")).toBe(false);
    expect(podePublicarRetroativo("admin")).toBe(true);
    const errosGestor = validarPublicacao({
      vigenciaInicio: "2026-01-01",
      hoje: "2026-06-01",
      role: "gestor",
      motivoRetroativo: "correção do cadastro inicial",
      temDiaConfigurado: true,
    });
    expect(errosGestor.join(" ")).toContain("apenas para administradores");
    const errosSemMotivo = validarPublicacao({
      vigenciaInicio: "2026-01-01",
      hoje: "2026-06-01",
      role: "admin",
      motivoRetroativo: "",
      temDiaConfigurado: true,
    });
    expect(errosSemMotivo.join(" ")).toContain("justificativa");
    expect(
      validarPublicacao({
        vigenciaInicio: "2026-01-01",
        hoje: "2026-06-01",
        role: "admin",
        motivoRetroativo: "recuperação do horário oficial antigo",
        temDiaConfigurado: true,
      }),
    ).toHaveLength(0);
  });

  it("não publica versão vazia nem sem permissão", () => {
    expect(
      validarPublicacao({ vigenciaInicio: "2026-06-01", hoje: "2026-06-01", role: "admin", temDiaConfigurado: false }).join(" "),
    ).toContain("pelo menos um dia");
    expect(
      validarPublicacao({ vigenciaInicio: "2026-06-01", hoje: "2026-06-01", role: "recepcao", temDiaConfigurado: true }).join(" "),
    ).toContain("administradores e gestores");
  });

  const src = readFileSync(resolve(process.cwd(), "src/lib/nina/horario-funcionamento.functions.ts"), "utf8");

  it("backend publica por versão, com confirmação de conflito e bloqueio de edição após publicar", () => {
    expect(src).toContain("nina_calendario_publicar");
    expect(src).toContain("confirmarConflito");
    expect(src).toContain("já foi publicada e não pode ser alterada");
    expect(src).toContain("nina_calendario_versoes");
  });
});
