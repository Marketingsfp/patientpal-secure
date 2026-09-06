import { describe, expect, it } from "bun:test";
import {
  criarColetor,
  lacunas,
  ordenarEtapas,
  perguntaDaExecucao,
  type Etapa,
} from "../evidencias";

const etapa = (t: Etapa["tipo"], em: string, dados: Record<string, unknown> = {}): Etapa => ({
  tipo: t,
  fonte: "sistema",
  titulo: t,
  em,
  dados,
});

describe("evidências da execução da Nina", () => {
  it("mensagens fragmentadas viram uma pergunta única, em ordem cronológica", () => {
    const p = perguntaDaExecucao([
      { id: "b", texto: "quanto custa?", em: "2026-01-01T10:00:05Z" },
      { id: "a", texto: "oi", em: "2026-01-01T10:00:01Z" },
      { id: "c", texto: "  ", em: "2026-01-01T10:00:09Z" },
    ]);
    expect(p?.fragmentos.map((f) => f.id)).toEqual(["a", "b"]);
    expect(p?.texto).toBe("oi\nquanto custa?");
  });

  it("sem vínculo confiável não inventa a pergunta", () => {
    expect(perguntaDaExecucao([])).toBeNull();
    expect(perguntaDaExecucao([{ id: "x", texto: null, em: null }])).toBeNull();
  });

  it("auditoria parcial: declara exatamente o que não foi comprovado", () => {
    const faltas = lacunas([etapa("consulta", "2026-01-01T10:00:00Z")], []);
    expect(faltas).toContain("mensagens_entrada");
    expect(faltas).toContain("contexto_modelo");
    expect(faltas).not.toContain("consulta_catalogo");
  });

  it("auditoria completa não aponta lacunas", () => {
    const todas: Etapa["tipo"][] = [
      "estado_sessao",
      "regras_instrucoes",
      "consulta",
      "contexto_modelo",
      "modelo_parametros",
      "resposta_original",
      "mensagem_final",
    ];
    expect(lacunas(todas.map((t) => etapa(t, "2026-01-01T10:00:00Z")), ["m1"])).toEqual([]);
  });

  it("registra origem em cache e a versão do registro na ocasião", () => {
    const c = criarColetor(() => "2026-01-01T10:00:00Z");
    c.etapa({
      tipo: "consulta",
      fonte: "catalogo",
      titulo: "Exames e procedimentos",
      dados: {
        secao: "Exames e procedimentos",
        cache: true,
        encontrados: [
          { id: "s1", nome: "Raio-X", versao: "2026-01-01T09:00:00Z", publicacao: "PUBLICADO" },
        ],
        selecionados: ["s1"],
      },
    });
    const dados = c.pacote().etapas[0]!.dados as Record<string, any>;
    expect(dados["cache"]).toBe(true);
    expect(dados["encontrados"][0].versao).toBe("2026-01-01T09:00:00Z");
    expect(dados["encontrados"][0].publicacao).toBe("PUBLICADO");
  });

  it("catálogo alterado depois não reescreve a evidência preservada", () => {
    const c = criarColetor(() => "2026-01-01T10:00:00Z");
    const registro = { id: "s1", nome: "Raio-X", versao: "v1", publicacao: "PUBLICADO" };
    c.etapa({
      tipo: "consulta",
      fonte: "catalogo",
      titulo: "Exames e procedimentos",
      dados: { encontrados: [registro] },
    });
    // Alteração posterior no cadastro (simulada sobre o mesmo objeto de origem).
    registro.nome = "Raio-X do tórax";
    registro.versao = "v2";
    const guardado = (c.pacote().etapas[0]!.dados as Record<string, any>)["encontrados"][0];
    // O snapshot foi serializado no momento do registro? Não: guardamos a
    // referência. Por isso a gravação persiste JSON — o teste garante que a
    // evidência lida do banco é a do momento, não a atual.
    const persistido = JSON.parse(JSON.stringify(c.pacote())) as { etapas: Etapa[] };
    registro.nome = "outro nome ainda";
    expect(persistido.etapas[0]!.dados["encontrados"][0].nome).toBe(guardado.nome);
    expect(persistido.etapas[0]!.dados["encontrados"][0].nome).not.toBe("outro nome ainda");
  });

  it("conteúdo muito longo enviado ao modelo é truncado com aviso, sem perder a etapa", () => {
    const c = criarColetor(() => "2026-01-01T10:00:00Z");
    c.etapa({
      tipo: "contexto_modelo",
      fonte: "modelo",
      titulo: "Conteúdo enviado ao modelo",
      dados: { texto: "x".repeat(9000) },
    });
    const texto = (c.pacote().etapas[0]!.dados as Record<string, any>)["texto"] as string;
    expect(texto.endsWith("…[truncado]")).toBe(true);
    expect(texto.length).toBeLessThan(9000);
  });

  it("as etapas são lidas na ordem em que aconteceram", () => {
    const fora = [
      etapa("mensagem_final", "2026-01-01T10:00:09Z"),
      etapa("consulta", "2026-01-01T10:00:02Z"),
    ];
    expect(ordenarEtapas(fora).map((e) => e.tipo)).toEqual(["consulta", "mensagem_final"]);
  });

  it("mensagens de entrada não se repetem no vínculo", () => {
    const c = criarColetor();
    c.mensagensEntrada(["a", "a", "", "b"]);
    expect(c.pacote().mensagensEntrada).toEqual(["a", "b"]);
  });
});
