import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  perguntasObservacaoIntencao,
  lerObservacaoIntencao,
  separarRetornoJev,
  observacaoDaDecisao,
  linhasObservacaoIntencao,
} from "../jev-observacao-intencao";
import { perguntaIntencao, intencaoAplicavel } from "../jev-intencao";
import { perguntasEncaminhamento, decidirEncaminhamento } from "../jev-encaminhamento";
import { perguntasComAuditoriaJev } from "../jev-auditoria";

const perguntas = { ...perguntaIntencao(), ...perguntasEncaminhamento() };
const principal = {
  intencao: { choice: "valor", confidence: 0.95 },
  entendimento: { noul: 0.99 },
  urgencia: { noul: 0.01 },
  pedido_atendente: { noul: 0.01 },
  irritacao: { noul: 0.01 },
};

describe("Jev: leitura ampliada em observação", () => {
  test("múltiplos pedidos são preservados, isolados da intenção e encaminhamento atuais", () => {
    const r = separarRetornoJev(
      perguntas,
      {
        answers: {
          ...principal,
          obs_pedido_preco: { noul: 0.99 },
          obs_pedido_horario_habitual: { noul: 0.98 },
          obs_pedido_disponibilidade: { noul: 0.01 },
        },
      },
      true,
    )!;
    expect(r.respostas).toEqual(principal);
    expect(intencaoAplicavel(r.respostas.intencao)).toBe("valor");
    expect(decidirEncaminhamento(r.respostas, null)).toBeNull();
    const linhas = linhasObservacaoIntencao(r.observacaoIntencao!);
    expect(linhas.find((l) => l.rotulo === "Preço")?.valor).toBe("Indicado · 99%");
    expect(
      linhas.find((l) => l.rotulo === "Dias / horários habituais do profissional")?.valor,
    ).toBe("Indicado · 98%");
    expect(linhas.find((l) => l.rotulo === "Consulta de vagas")?.valor).toBe("Não indicado · 1%");
  });

  test("observação ausente ou inválida não invalida a decisão principal", () => {
    for (const obs of [undefined, null, { noul: NaN }, { noul: 1.5 }, { noul: "0.9" }]) {
      const r = separarRetornoJev(
        perguntas,
        { answers: { ...principal, obs_pedido_preco: obs } },
        true,
      )!;
      expect(r.respostas).toEqual(principal);
      expect(r.observacaoIntencao?.ausentes).toContain("obs_pedido_preco");
    }
    expect(separarRetornoJev(perguntas, { answers: {} }, true)).toBeNull();
  });

  test("pontuação intermediária não vira conclusão; campo ausente não vira não", () => {
    const linhas = linhasObservacaoIntencao(
      lerObservacaoIntencao({ obs_pedido_preco: { noul: 0.55 } }),
    );
    expect(linhas[0].valor).toBe("Incerto · 55%");
    expect(linhas[1].valor).toBe("Sem leitura válida");
  });

  test("aceite para consultar, confirmar, condicional e ambíguo permanecem distintos e não aplicados", () => {
    for (const choice of ["consultar_agenda", "confirmar_resumo", "condicional", "ambigua"]) {
      const o = lerObservacaoIntencao({
        obs_autorizacao: { choice, probabilities: { [choice]: 0.92 } },
      });
      expect(o.respostas.obs_autorizacao).toEqual({ choice, confidence: 0.92 });
      expect(o.aplicada).toBe(false);
      expect(o.modo).toBe("observacao");
    }
  });

  test("correção e primeira escolha não são convertidas em comandos ou cadastro", () => {
    const o = lerObservacaoIntencao({
      obs_correcao: { choice: "especialidade", confidence: 0.91 },
    });
    expect(o.respostas.obs_correcao.choice).toBe("especialidade");
    expect(o.aplicada).toBe(false);
    expect(
      lerObservacaoIntencao({ obs_correcao: { choice: "nenhuma", confidence: 0.9 } }).respostas
        .obs_correcao.choice,
    ).toBe("nenhuma");
  });

  test("rejeita opção fora da lista, confiança inválida e versão desconhecida", () => {
    for (const r of [
      { choice: "apagar_cadastro", confidence: 1 },
      { choice: "confirmar_resumo", confidence: Infinity },
      { choice: "confirmar_resumo" },
    ])
      expect(lerObservacaoIntencao({ obs_autorizacao: r }).ausentes).toContain("obs_autorizacao");
    expect(observacaoDaDecisao(null)).toBeNull();
    expect(observacaoDaDecisao({ _observacao_intencao: { versao: "futura" } })).toBeNull();
    expect(
      observacaoDaDecisao({
        _observacao_intencao: { ...lerObservacaoIntencao({}), aplicada: true },
      }),
    ).toBeNull();
  });
});

// Funções reais do servidor, isolando somente rede/banco/chave. Sem inferência real.
const source = readFileSync(new URL("../jev.server.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("jev.server.ts", source, ts.ScriptTarget.Latest, true);
function funcaoReal(nome: string, contexto: Record<string, unknown>) {
  const f = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === nome);
  if (!f) throw new Error(nome);
  const js = ts.transpile(f.getText(ast).replace(/^export /, ""), {
    target: ts.ScriptTarget.ES2022,
  });
  return runInNewContext(`${js}\n${nome}`, {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    LIMITE_MS: 4000,
    URL_JEV: "https://exemplo.invalid",
    MODELO_JEV: "modelo-simulado",
    process: { env: { LOVABLE_API_KEY: "chave-simulada" } },
    perguntasObservacaoIntencao,
    separarRetornoJev,
    perguntasComAuditoriaJev,
    ...contexto,
  });
}

describe("Integração da observação com chamada e registro existentes", () => {
  test("turnos novos, retomados e repetidos não compartilham respostas em chamadas simultâneas", async () => {
    const concluir = new Map<string, () => void>();
    const perguntar = funcaoReal("perguntarJev", {
      fetch: (_url: string, args: { body: string }) => {
        const { state } = JSON.parse(args.body);
        return new Promise((resolve) =>
          concluir.set(state.turno, () =>
            resolve({
              ok: true,
              json: async () => ({
                answers: {
                  ...principal,
                  obs_autorizacao: { choice: state.esperado, confidence: 0.9 },
                },
              }),
            }),
          ),
        );
      },
    });
    const contextos = [
      { turno: "nova", mensagem_atual: "sim", mensagens_anteriores: [], esperado: "ambigua" },
      {
        turno: "retomada",
        mensagem_atual: "sim",
        mensagens_anteriores: [{ de: "atendente", texto: "Quer verificar vagas?" }],
        esperado: "consultar_agenda",
      },
      {
        turno: "repetida",
        mensagem_atual: "sim",
        mensagens_anteriores: [{ de: "atendente", texto: "Quer verificar vagas?" }],
        esperado: "consultar_agenda",
      },
    ];
    const resultados = contextos.map((c) => perguntar(c, perguntas, 4000, true));
    for (const c of [...contextos].reverse()) concluir.get(c.turno)!();
    const lidos = await Promise.all(resultados);
    for (let i = 0; i < lidos.length; i++) {
      expect(lidos[i].respostas).toEqual(principal);
      expect(lidos[i].observacaoIntencao.respostas.obs_autorizacao.choice).toBe(
        contextos[i].esperado,
      );
    }
  });

  test("faz uma chamada, preserva perguntas originais e só acrescenta quando habilitado", async () => {
    const corpos: Array<{ questions: Record<string, unknown>; state: unknown }> = [];
    const perguntar = funcaoReal("perguntarJev", {
      fetch: async (_url: string, args: { body: string }) => {
        corpos.push(JSON.parse(args.body));
        return { ok: true, json: async () => ({ answers: principal }) };
      },
    });
    for (const ativa of [false, true]) {
      const r = await perguntar({ mensagem_atual: "valor?" }, perguntas, 4000, ativa);
      expect(r.ok).toBe(true);
      expect(r.respostas).toEqual(principal);
      expect(Boolean(r.observacaoIntencao)).toBe(ativa);
    }
    expect(corpos).toHaveLength(2);
    expect(corpos[0].questions).toEqual(perguntas);
    for (const [k, v] of Object.entries(perguntas)) expect(corpos[1].questions[k]).toEqual(v);
    expect(Object.keys(corpos[1].questions)).toHaveLength(Object.keys(perguntas).length + 14);
  });

  test("erro ou demora continua sem decisão, sem repetição automática", async () => {
    let chamadas = 0;
    const perguntar = funcaoReal("perguntarJev", {
      fetch: async (_url: string, args: { signal: AbortSignal }) => {
        chamadas++;
        return new Promise((_resolve, reject) =>
          args.signal.addEventListener("abort", () => reject(Error("abortado"))),
        );
      },
    });
    const r = await perguntar({}, perguntas, 5, true);
    expect(r).toMatchObject({ ok: false, motivo: "tempo_esgotado" });
    expect(chamadas).toBe(1);
  });

  test("real e homologação salvam a observação sem torná-la aplicada ou duplicar na transferência", async () => {
    const registros: Array<Record<string, unknown>> = [];
    const registrar = funcaoReal("registrarDecisaoJev", {
      supabaseAdmin: {
        from: () => ({
          insert: async (r: Record<string, unknown>) => {
            registros.push(r);
          },
        }),
      },
    });
    const resultado = {
      ok: true,
      latencyMs: 12,
      ...separarRetornoJev(
        perguntas,
        {
          answers: {
            ...principal,
            obs_autorizacao: { choice: "confirmar_resumo", confidence: 0.99 },
          },
        },
        true,
      ),
    };
    for (const teste of [false, true]) {
      for (const fase of ["fase1_intencao", "fase2_encaminhamento"]) {
        await registrar({
          clinicaId: "c",
          conversationId: "conversa",
          teste,
          fase,
          perguntas,
          resultado,
          aplicada: true,
          mensagem: { origem: "paciente", texto: "Pode confirmar" },
        });
      }
    }
    for (const i of [0, 2]) {
      expect(observacaoDaDecisao(registros[i].respostas)?.aplicada).toBe(false);
      expect(observacaoDaDecisao(registros[i + 1].respostas)).toBeNull();
    }
    expect(registros[0].respostas).toEqual(registros[2].respostas);
  });
});
