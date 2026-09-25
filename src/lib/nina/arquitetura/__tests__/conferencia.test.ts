/**
 * Conferência do mapa da Arquitetura com o código.
 * O aviso do topo só pode ficar verde quando ferramentas e modelo batem.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { CATALOGO_FERRAMENTAS } from "../../tool-broker";
import { MODELO_NINA_ALVO } from "../../modelo-nina";
import { MANIFESTO_ARQUITETURA, NODES_ARQUITETURA, nodePorId, type NodeArquitetura } from "../manifesto";
import { FATOS_DO_CODIGO, conferirMapaComCodigo, statusArquitetura } from "../conferencia";
import { versaoAtual } from "../versoes";

const RAIZ = resolve(__dirname, "../../../../..");
const ler = (arquivo: string) => readFileSync(resolve(RAIZ, arquivo), "utf8");

function clonar(nodes: NodeArquitetura[]): NodeArquitetura[] {
  return nodes.map((n) => ({
    ...n,
    anteriores: [...n.anteriores],
    seguintes: [...n.seguintes],
    ...(n.ferramentas ? { ferramentas: [...n.ferramentas] } : {}),
  }));
}

function arquivosDoAtendimento(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome !== "__tests__") saida.push(...arquivosDoAtendimento(caminho));
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

describe("conferência do mapa com o código", () => {
  test("o mapa atual bate com as ferramentas e o modelo do código", () => {
    expect(conferirMapaComCodigo()).toEqual([]);
  });

  test("aponta ferramenta nova do código sem caixa no mapa", () => {
    const fatos = { ...FATOS_DO_CODIGO, ferramentas: [...FATOS_DO_CODIGO.ferramentas, "remarcar"] };
    const d = conferirMapaComCodigo(fatos);
    expect(d.map((x) => x.tipo)).toEqual(["ferramenta_sem_caixa"]);
    expect(d[0]!.detalhe).toContain("remarcar");
  });

  test("aponta ferramenta do mapa que saiu do código", () => {
    const fatos = {
      ...FATOS_DO_CODIGO,
      ferramentas: FATOS_DO_CODIGO.ferramentas.filter((f) => f !== "agendar"),
    };
    const d = conferirMapaComCodigo(fatos);
    expect(d.map((x) => x.tipo)).toEqual(["ferramenta_fora_do_codigo"]);
    expect(d[0]!.detalhe).toContain("agendar");
  });

  test("aponta ferramenta repetida em duas caixas", () => {
    const nodes = clonar(NODES_ARQUITETURA);
    nodes.find((n) => n.id === "tool.my_appointments")!.ferramentas!.push("agendar");
    const d = conferirMapaComCodigo(FATOS_DO_CODIGO, nodes);
    expect(d.map((x) => x.tipo)).toEqual(["ferramenta_repetida"]);
  });

  test("aponta modelo diferente entre código e mapa", () => {
    const d = conferirMapaComCodigo({ ...FATOS_DO_CODIGO, modelo: "outro/modelo" });
    expect(d.map((x) => x.tipo)).toEqual(["modelo"]);
    expect(d[0]!.detalhe).toContain("outro/modelo");
  });
});

describe("aviso do topo da Arquitetura", () => {
  test("mapa conferido fica verde e mostra a data da última revisão", () => {
    const status = statusArquitetura();
    expect(status.cor).toBe("verde");
    expect(status.titulo).toBe("Mapa conferido com o código");
    expect(status.detalhe).toContain(`${FATOS_DO_CODIGO.ferramentas.length} ferramentas`);
    expect(status.detalhe).toContain("25/09/2026");
  });

  test("qualquer diferença com o código deixa amarelo, nunca verde", () => {
    const divergencias = conferirMapaComCodigo({ ...FATOS_DO_CODIGO, modelo: "outro/modelo" });
    const status = statusArquitetura(NODES_ARQUITETURA, divergencias);
    expect(status.cor).toBe("amarelo");
    expect(status.divergencias).toHaveLength(1);
  });

  test("desenho quebrado fica vermelho", () => {
    const nodes = clonar(NODES_ARQUITETURA);
    nodes[0]!.seguintes.push("componente.que.nao.existe");
    const status = statusArquitetura(nodes);
    expect(status.cor).toBe("vermelho");
    expect(status.problemas.length).toBeGreaterThan(0);
  });
});

describe("as fontes da conferência cobrem o atendimento real", () => {
  test("toda ferramenta oferecida ao modelo está no catálogo do broker", () => {
    const oferecidas = [
      ...ler("src/lib/nina/paciente-tools.server.ts").matchAll(/\bname:\s*"([a-z_]+)"/g),
    ].map((m) => m[1]!);
    const handoff = /NOME_FERRAMENTA_HANDOFF\s*=\s*"([a-z_]+)"/.exec(
      ler("src/lib/nina/handoff-tool.server.ts"),
    )?.[1];
    expect(handoff).toBeDefined();
    expect([...new Set([...oferecidas, handoff!])].sort()).toEqual(
      Object.keys(CATALOGO_FERRAMENTAS).sort(),
    );
  });

  test("toda etapa gravada pelo rastreio do atendimento tem caixa no mapa", () => {
    const etapas = new Set<string>();
    for (const pasta of ["src/lib", "src/routes"])
      for (const arquivo of arquivosDoAtendimento(resolve(RAIZ, pasta)))
        for (const m of readFileSync(arquivo, "utf8").matchAll(
          /rastro\??\.(?:iniciar|concluir|falhar|pular|repetir|cancelar)\(\s*"([a-z_.]+)"/g,
        ))
          etapas.add(m[1]!);
    expect(etapas.size).toBeGreaterThan(5);
    for (const etapa of etapas) expect(nodePorId(etapa), etapa).toBeDefined();
  });

  test("a versão atual do histórico registra o modelo do código", () => {
    expect(MANIFESTO_ARQUITETURA.modelo).toBe(MODELO_NINA_ALVO);
    expect(versaoAtual().modelo).toBe(MODELO_NINA_ALVO);
    expect(MANIFESTO_ARQUITETURA.revisadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
