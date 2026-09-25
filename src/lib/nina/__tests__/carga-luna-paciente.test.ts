import { describe, expect, test } from "bun:test";
import { MODELO_LUNA } from "../carga";
import { consultasDoCatalogo, montarCenariosBateria } from "../carga-bateria";
import {
  montarRequisicaoPacienteLuna,
  objetivoPacienteLuna,
  proximaMensagemPacienteLuna,
  validarRespostaPacienteLuna,
} from "../carga-redacao-luna.server";

const [cenario] = montarCenariosBateria({
  consultas: consultasDoCatalogo([
    {
      id: "p-iarmila",
      nome: "Iarmila Ruzena",
      medico_id: "m-iarmila",
      observacao_publica: [
        "CONSULTA ENDOCRINOLOGIA",
        "Especialidade: ENDOCRINOLOGIA",
        "Dinheiro: R$ 120,00",
        "Observação: Agendado",
      ].join("\n"),
    },
  ]),
  vagasPorMedico: { "m-iarmila": 2 },
  variacoesPorConsulta: 1,
});

const respostaProvedor = (texto: string, status = "completed") =>
  new Response(
    JSON.stringify({
      status,
      output: [{ content: [{ type: "output_text", text: texto }] }],
      usage: { input_tokens: 321, output_tokens: 12 },
    }),
  );

describe("Luna como paciente da bateria", () => {
  test("pedido usa o modelo da Luna, o objetivo do cenário e o histórico no papel certo", () => {
    const req = montarRequisicaoPacienteLuna(cenario!, [
      { autor: "paciente", texto: "Oi, queria marcar endocrinologista" },
      { autor: "nina", texto: "Temos a Dra. Iarmila e o Dr. Felipe. Com quem prefere?" },
    ]);
    expect(req.model).toBe(MODELO_LUNA);
    expect(req.instructions).toContain("NÃO diga o nome do profissional");
    expect(req.instructions).toContain(objetivoPacienteLuna(cenario!));
    expect(req.instructions).toContain("Simulação Teste 01");
    expect(req.input.map((i) => i.role)).toEqual(["assistant", "user"]);
    expect(req.text.format.strict).toBe(true);
    const vazio = montarRequisicaoPacienteLuna(cenario!, []);
    expect(vazio.input).toHaveLength(1);
  });

  test("resposta é validada: texto limpo para enviar, motivo curto para encerrar", () => {
    expect(
      validarRespostaPacienteLuna(
        JSON.stringify({ acao: "enviar", mensagem: "**Pode ser** quinta\n às 08:00", motivo: "" }),
      ),
    ).toEqual({ acao: "enviar", texto: "Pode ser quinta às 08:00", motivo: "" });
    expect(
      validarRespostaPacienteLuna(
        JSON.stringify({ acao: "encerrar", mensagem: "", motivo: "agendado" }),
      ),
    ).toEqual({ acao: "encerrar", texto: "", motivo: "agendado" });
    expect(() =>
      validarRespostaPacienteLuna(JSON.stringify({ acao: "enviar", mensagem: "  ", motivo: "" })),
    ).toThrow("não escreveu");
    expect(() => validarRespostaPacienteLuna("não é json")).toThrow("fora do formato JSON");
    expect(() =>
      validarRespostaPacienteLuna(JSON.stringify({ acao: "responder", mensagem: "x", motivo: "" })),
    ).toThrow("fora do formato esperado");
  });

  test("chamada ao provedor devolve a mensagem e os tokens consumidos", async () => {
    let corpo: any = null;
    const r = await proximaMensagemPacienteLuna(cenario!, [], {
      chave: "teste",
      fetch: (async (_url: string, init: RequestInit) => {
        corpo = JSON.parse(String(init.body));
        return respostaProvedor(
          JSON.stringify({
            acao: "enviar",
            mensagem: "Boa tarde! Queria marcar uma consulta de endocrino",
            motivo: "",
          }),
        );
      }) as typeof fetch,
    });
    expect(corpo.model).toBe(MODELO_LUNA);
    expect(r).toEqual({
      acao: "enviar",
      texto: "Boa tarde! Queria marcar uma consulta de endocrino",
      motivo: "",
      tokens: { entrada: 321, saida: 12 },
    });
  });

  test("recusa, resposta incompleta e falta de chave viram erro explícito", async () => {
    const chamar = (resposta: Response) =>
      proximaMensagemPacienteLuna(cenario!, [], {
        chave: "teste",
        fetch: (async () => resposta) as unknown as typeof fetch,
      });
    await expect(
      chamar(
        new Response(
          JSON.stringify({
            status: "completed",
            output: [{ content: [{ type: "refusal", text: "não" }] }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        ),
      ),
    ).rejects.toThrow("recusou");
    await expect(chamar(respostaProvedor("{}", "incomplete"))).rejects.toThrow("não concluiu");
    await expect(chamar(new Response("erro", { status: 429 }))).rejects.toThrow("(429)");
    const chave = process.env["LOVABLE_API_KEY"];
    delete process.env["LOVABLE_API_KEY"];
    try {
      await expect(proximaMensagemPacienteLuna(cenario!, [])).rejects.toThrow("chave do provedor");
    } finally {
      if (chave !== undefined) process.env["LOVABLE_API_KEY"] = chave;
    }
  });

  test("provedor sem resposta é cancelado no prazo", async () => {
    const inicio = Date.now();
    await expect(
      proximaMensagemPacienteLuna(cenario!, [], {
        chave: "teste",
        timeoutMs: 50,
        fetch: ((_url: string, init: RequestInit) =>
          new Promise((_, rejeitar) =>
            init.signal?.addEventListener("abort", () => rejeitar(new Error("abortado"))),
          )) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("tempo limite");
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });
});
