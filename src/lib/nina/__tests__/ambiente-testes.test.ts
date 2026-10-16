import { describe, expect, test } from "bun:test";
import { MODOS_PACIENTE, modoDaPosicao, modoPorId } from "../ambiente-testes/modos";
import {
  LIMITES_AMBIENTE,
  entradaPaciente,
  instrucoesPaciente,
  lerAcaoPaciente,
  turnosPermitidos,
} from "../ambiente-testes/paciente";
import { entradaJuiz, lerResultadoJuiz } from "../ambiente-testes/juiz";
import { limparNomes, sortearAssuntos } from "../ambiente-testes/assuntos";
import { PAPEIS_MODELOS, garantirPapel } from "../papeis-modelos";
import { MODELO_SOL } from "../avaliador-sol";

// Ambiente de testes da Nina: módulos puros. Dados fictícios.

describe("modos de paciente", () => {
  test("10 modos, um por lead, com ids únicos", () => {
    expect(MODOS_PACIENTE).toHaveLength(10);
    expect(new Set(MODOS_PACIENTE.map((m) => m.id)).size).toBe(10);
    expect(modoPorId("indeciso")?.nome).toBe("Indeciso");
    expect(modoPorId("nao-existe")).toBeNull();
  });

  test("com 20 leads, os modos se repetem em ciclo e os assuntos não repetem", () => {
    const modos = Array.from({ length: 20 }, (_, i) => modoDaPosicao(i));
    expect(modos[0]!.id).toBe(MODOS_PACIENTE[0]!.id);
    expect(modos[10]!.id).toBe(MODOS_PACIENTE[0]!.id);
    expect(modos[19]!.id).toBe(MODOS_PACIENTE[9]!.id);
    expect(modoDaPosicao(29).id).toBe(MODOS_PACIENTE[9]!.id);
    const catalogo = {
      consultas: Array.from({ length: 12 }, (_, i) => `Especialidade Ficticia ${i + 1}`),
      exames: Array.from({ length: 12 }, (_, i) => `Exame Ficticio ${i + 1}`),
    };
    const assuntos = sortearAssuntos(
      modos.map((m) => m.assunto),
      catalogo,
      () => 0,
    ).filter((a) => !a.startsWith("algo que"));
    expect(assuntos).toHaveLength(18);
    expect(new Set(assuntos).size).toBe(18);
  });

  test("as instruções do paciente não trazem nada da Nina", () => {
    const texto = instrucoesPaciente(MODOS_PACIENTE[0]!, "consulta de cardiologia");
    expect(texto).toContain("consulta de cardiologia");
    expect(texto).not.toMatch(/catálogo|ferramenta|prompt|Nina/i);
  });
});

describe("paciente difícil", () => {
  test("a clínica fala como user e o paciente como assistant; a última é da clínica", () => {
    expect(entradaPaciente([])[0]!.role).toBe("user");
    const e = entradaPaciente([
      { autor: "paciente", texto: "oi" },
      { autor: "clinica", texto: "Olá!" },
      { autor: "paciente", texto: "quanto custa?" },
    ]);
    expect(e.map((m) => m.role)).toEqual(["assistant", "user", "assistant", "user"]);
  });

  test("lê o JSON e protege contra respostas fora do formato", () => {
    expect(lerAcaoPaciente('{"acao":"enviar","mensagem":"tem eco?","motivo":"x"}')).toEqual({
      acao: "enviar",
      mensagem: "tem eco?",
      motivo: "x",
    });
    expect(lerAcaoPaciente('{"acao":"enviar","mensagem":"","motivo":"x"}').acao).toBe("encerrar");
    expect(lerAcaoPaciente("oi, vcs fazem raio x?").mensagem).toBe("oi, vcs fazem raio x?");
    expect(lerAcaoPaciente("").acao).toBe("encerrar");
    expect(
      lerAcaoPaciente(`{"acao":"enviar","mensagem":"${"a".repeat(900)}","motivo":""}`).mensagem,
    ).toHaveLength(LIMITES_AMBIENTE.caracteresMensagem);
  });

  test("turnos ficam dentro do intervalo", () => {
    expect(turnosPermitidos(undefined)).toBe(10);
    expect(turnosPermitidos(1)).toBe(4);
    expect(turnosPermitidos(99)).toBe(16);
  });
});

describe("juiz", () => {
  test("normaliza categoria, gravidade e nota", () => {
    const r = lerResultadoJuiz(
      JSON.stringify({
        resultado: "reprovado",
        nota: 140,
        resumo: "ok",
        falhas: [{ categoria: "xyz", gravidade: "?", trecho: "t", explicacao: "e" }],
        acertos: ["a", "b", "c", "d"],
      }),
    );
    expect(r.nota).toBe(100);
    expect(r.falhas[0]).toMatchObject({ categoria: "outro", gravidade: "media" });
    expect(r.acertos).toHaveLength(3);
    expect(() => lerResultadoJuiz("sem json")).toThrow();
  });

  test("a entrada traz o modo, o assunto e as linhas marcadas", () => {
    const t = entradaJuiz(MODOS_PACIENTE[1]!, "USG TIREOIDE", [
      { autor: "paciente", texto: "oi" },
      { autor: "sistema", texto: "Protocolo X" },
    ]);
    expect(t).toContain("[paciente] oi");
    expect(t).toContain("[sistema] Protocolo X");
    expect(t).toContain("USG TIREOIDE");
  });
});

describe("assuntos do catálogo", () => {
  test("sorteio sem repetição, consulta com prefixo e modo livre", () => {
    let i = 0;
    const seq = [0, 0, 0.5, 0.9];
    const r = sortearAssuntos(
      ["consulta", "exame", "exame", "livre"],
      { consultas: ["CARDIOLOGIA"], exames: ["USG TIREOIDE", "HEMOGRAMA", "USG TIREOIDE"] },
      () => seq[i++ % seq.length]!,
    );
    expect(r[0]).toBe("consulta de cardiologia");
    expect(r[1]).not.toBe(r[2]);
    expect(r[3]).toMatch(/talvez a clínica não ofereça/);
    expect(limparNomes(["EXAME TESTE", "ok", "Hemograma", "hemograma"])).toEqual(["Hemograma"]);
  });
});

describe("papéis de modelo", () => {
  test("paciente difícil e juiz usam o Claude Opus 5.5", () => {
    expect(PAPEIS_MODELOS.paciente_dificil.modelo).toBe(MODELO_SOL);
    expect(PAPEIS_MODELOS.juiz_testes.modelo).toBe(MODELO_SOL);
    expect(() => garantirPapel("paciente_dificil", "outro/modelo")).toThrow();
  });
});
