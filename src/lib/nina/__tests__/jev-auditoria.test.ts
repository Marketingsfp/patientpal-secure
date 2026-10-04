import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { idsConversasJev, perguntasComAuditoriaJev, textoDaDecisaoJev } from "../jev-auditoria";

describe("Auditoria das decisões do Jev", () => {
  test("registros antigos não ganham mensagem presumida", () => {
    for (const perguntas of [
      null,
      [],
      ["intencao"],
      {},
      { mensagem: "não é um vínculo conhecido" },
    ]) {
      expect(textoDaDecisaoJev(perguntas)).toBeNull();
    }
    expect(perguntasComAuditoriaJev(["intencao"])).toEqual(["intencao"]);
  });

  test("preserva contexto antigo sem confundir termo com mensagem", () => {
    const p = perguntasComAuditoriaJev(["especialidade"], { termo: "cardio", opcoes: 5 });
    expect(p).toEqual({ chaves: ["especialidade"], termo: "cardio", opcoes: 5 });
    expect(textoDaDecisaoJev(p)).toEqual({
      rotulo: "Termo pesquisado",
      texto: "cardio",
      truncado: false,
    });
  });

  test("mantém texto exato e IDs de mensagens agrupadas sem mudar o chamador", () => {
    const entrada = ["a", "b", "a"];
    const texto = "quero cardio\n  amanhã?";
    const p = perguntasComAuditoriaJev(["intencao"], undefined, {
      origem: "paciente",
      texto,
      mensagensEntrada: entrada,
    });
    expect(textoDaDecisaoJev(p)).toEqual({
      rotulo: "Mensagem do paciente analisada",
      texto,
      truncado: false,
    });
    expect(p).toMatchObject({ _texto_analisado: { mensagens_entrada: ["a", "b"] } });
    expect(entrada).toEqual(["a", "b", "a"]);
  });

  test("conferência mostra a candidata da Nina, sem afirmar que foi enviada", () => {
    const p = perguntasComAuditoriaJev(["afirma_vaga"], undefined, {
      origem: "resposta_nina",
      texto: "Temos vaga amanhã",
    });
    expect(textoDaDecisaoJev(p)?.rotulo).toBe("Resposta da Nina conferida (antes do envio)");
  });

  test("corte de texto é explícito, apenas no registro", () => {
    const mensagem = { origem: "paciente" as const, texto: "a".repeat(6500) };
    const p = perguntasComAuditoriaJev([], undefined, mensagem);
    expect(textoDaDecisaoJev(p)?.texto.length).toBe(6000);
    expect(textoDaDecisaoJev(p)?.truncado).toBe(true);
    expect(mensagem.texto.length).toBe(6500);
  });

  test("ignora payload malformado sem inferir autor", () => {
    for (const m of [
      { origem: "desconhecida", texto: "x" },
      { origem: "__proto__", texto: "x" },
      { origem: "paciente", texto: 1 },
    ])
      expect(textoDaDecisaoJev({ _texto_analisado: m })).toBeNull();
  });

  test("consulta somente UUIDs únicos; referências legadas permanecem no registro", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const linhas = [id, null, "teste-123", "", id].map((conversation_id) => ({ conversation_id }));
    expect(idsConversasJev(linhas)).toEqual([id]);
    expect(linhas[2].conversation_id).toBe("teste-123");
  });

  // Executa a função de persistência real, isolando apenas o transporte Supabase.
  const fonte = readFileSync(new URL("../jev.server.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("jev.server.ts", fonte, ts.ScriptTarget.Latest, true);
  const funcao = ast.statements.find(
    (s) => ts.isFunctionDeclaration(s) && s.name?.text === "registrarDecisaoJev",
  );
  if (!funcao) throw new Error("registrarDecisaoJev não encontrada");
  const js = ts.transpile(funcao.getText(ast).replace(/^export /, ""), {
    target: ts.ScriptTarget.ES2022,
  });

  for (const teste of [false, true]) {
    test(`persiste texto e conversa no mesmo registro: ${teste ? "homologação" : "real"}, sucesso e erro`, async () => {
      const registros: Array<Record<string, unknown>> = [];
      const registrar = runInNewContext(`${js}\nregistrarDecisaoJev`, {
        perguntasComAuditoriaJev,
        console,
        supabaseAdmin: {
          from: (tabela: string) => {
            expect(tabela).toBe("nina_jev_decisoes");
            return {
              insert: async (r: Record<string, unknown>) => {
                registros.push(r);
              },
            };
          },
        },
      });
      for (const resultado of [
        { ok: true, respostas: { intencao: { choice: "medico" } }, latencyMs: 25 },
        { ok: false, motivo: "tempo_esgotado", latencyMs: 4000 },
      ]) {
        await registrar({
          clinicaId: "clinica-a",
          conversationId: "conversa-a",
          fase: "fase1_intencao",
          teste,
          perguntas: { intencao: {} },
          resultado,
          aplicada: false,
          contagem: { falhas: 1, marco: "m" },
          mensagem: { origem: "paciente", texto: "Tem cardiologista?" },
        });
      }
      expect(registros).toHaveLength(2);
      for (const r of registros) {
        expect(r).toMatchObject({ clinica_id: "clinica-a", conversation_id: "conversa-a", teste });
        expect(textoDaDecisaoJev(r.perguntas)?.texto).toBe("Tem cardiologista?");
      }
      expect(registros[0].respostas).toMatchObject({ _nina: { falhas: 1, marco: "m" } });
      expect(registros[1].erro).toBe("tempo_esgotado");
    });
  }
});
