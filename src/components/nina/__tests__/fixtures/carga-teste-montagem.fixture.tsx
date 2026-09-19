/** DOM e efeitos React reais; somente clínica e integrações remotas são simuladas. */
import { afterAll, expect, it, mock } from "bun:test";
import { createRequire } from "node:module";

// jsdom já integra as dependências de isomorphic-dompurify no projeto.
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
for (const nome of [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLButtonElement",
  "NodeFilter",
  "KeyboardEvent",
  "FocusEvent",
  "Event",
  "MouseEvent",
  "MutationObserver",
  "DocumentFragment",
  "CustomEvent",
])
  Object.defineProperty(globalThis, nome, { configurable: true, value: dom.window[nome] });
Object.defineProperty(globalThis, "getComputedStyle", {
  configurable: true,
  value: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: dom.window.requestAnimationFrame.bind(dom.window),
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: dom.window.cancelAnimationFrame.bind(dom.window),
});

let clinica = "clinica-a";
let usuario = "usuario-a";
const chamadas: { nome: string; clinicaId?: string }[] = [];
const proibida = async () => {
  throw new Error("Montagem não pode disparar mensagens, IA ou reset.");
};
mock.module("@/hooks/use-clinica", () => ({
  useClinica: () => ({ clinicaAtual: { clinica_id: clinica } }),
}));
mock.module("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: usuario } }) }));
const pedidoSalvo =
  "Quero uma simulação com mamografia e ortopedista.\nPerguntar preço e primeira data.";
mock.module("@/lib/nina/carga-prompts.functions", () => ({
  listarPromptsCarga: async ({ data }: { data: { clinicaId: string } }) => {
    chamadas.push({ nome: "prompts", clinicaId: data.clinicaId });
    return {
      prompts: [
        {
          id: "prompt-a",
          pedido: pedidoSalvo,
          created_at: "2026-09-19T10:00:00Z",
          ultimo_usado_em: "2026-09-19T10:00:00Z",
        },
      ],
      temMais: false,
    };
  },
}));
mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
mock.module("@/lib/nina/carga.functions", () => ({
  criarTesteCarga: proibida,
  executarLoteCarga: proibida,
  pararTesteCarga: proibida,
  prepararLeadsTesteCarga: proibida,
  listarTestesCarga: async ({ data }: { data: { clinicaId: string } }) => {
    chamadas.push({ nome: "listar", clinicaId: data.clinicaId });
    return { testes: [], versaoExecutor: "fixture-sem-rede" };
  },
  detalheTesteCarga: proibida,
}));
mock.module("@/lib/nina/carga-planejamento.functions", () => ({ planejarTesteCarga: proibida }));
mock.module("@/lib/traduzir-erro", () => ({
  mostrarErro: (e: unknown) => {
    throw e;
  },
}));
mock.module("sonner", () => ({ toast: { success: () => {}, info: () => {} } }));

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { CargaTeste } = await import("../../CargaTeste");
const { act, StrictMode } = React;

afterAll(() => {
  dom.window.close();
});

it("efeitos de CargaTeste retornam somente cleanup válido em montagem, re-render, troca de clínica e desmontagem", async () => {
  const elemento = document.createElement("div");
  document.body.append(elemento);
  const erros: unknown[] = [];
  const raiz = createRoot(elemento, { onUncaughtError: (e) => erros.push(e) });
  const renderizar = () =>
    raiz.render(
      <StrictMode>
        <CargaTeste />
      </StrictMode>,
    );
  try {
    await act(async () => {
      renderizar();
    });
    expect(elemento.textContent).toContain("Descreva como deseja testar");
    expect(chamadas.some((c) => c.clinicaId === "clinica-a")).toBe(true);

    // Novo callback guardar do pai exige executar o cleanup do efeito anterior.
    await act(async () => {
      renderizar();
    });
    expect(elemento.textContent).toContain("Disparar teste de carga");

    const campo = elemento.querySelector<HTMLTextAreaElement>("#carga-pedido")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(
        campo,
        "Testar cardiologia em duas etapas",
      );
      campo.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    expect(campo.value).toBe("Testar cardiologia em duas etapas");

    clinica = "clinica-b";
    await act(async () => {
      renderizar();
    });
    expect(chamadas.some((c) => c.clinicaId === "clinica-b")).toBe(true);
    expect(elemento.querySelector<HTMLTextAreaElement>("#carga-pedido")!.value).toBe("");
    clinica = "clinica-a";
    await act(async () => {
      renderizar();
    });
    expect(elemento.querySelector<HTMLTextAreaElement>("#carga-pedido")!.value).toBe(
      "Testar cardiologia em duas etapas",
    );
    expect(erros).toEqual([]);
  } finally {
    await act(async () => {
      raiz.unmount();
    });
    elemento.remove();
  }
  expect(erros).toEqual([]);
});

it("o mesmo harness realmente detecta quando um efeito devolve Map como cleanup", async () => {
  const elemento = document.createElement("div");
  document.body.append(elemento);
  const erros: unknown[] = [];
  const raiz = createRoot(elemento, { onUncaughtError: (e) => erros.push(e) });
  const erroConsole = console.error;
  const avisos: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    avisos.push(args);
  };
  function RetornoInvalido() {
    // Reproduz o defeito JavaScript que o tipo () => void não impedia.
    const guardar: () => void = () => new Map().set("rascunho", true);
    React.useEffect(() => guardar(), []);
    return <p>Controle negativo</p>;
  }
  let falhou = false;
  try {
    try {
      await act(async () => {
        raiz.render(
          <StrictMode>
            <RetornoInvalido />
          </StrictMode>,
        );
      });
      await act(async () => {
        raiz.unmount();
      });
    } catch {
      falhou = true;
    }
    expect(falhou || erros.length > 0).toBe(true);
    expect(avisos.flat().map(String).join(" ")).toMatch(/useEffect|function|cleanup/);
  } finally {
    try {
      await act(async () => {
        raiz.unmount();
      });
    } catch {
      /* cleanup inválido do controle negativo */
    }
    console.error = erroConsole;
    elemento.remove();
  }
});

it("seleciona um prompt salvo completo sem gerar IA e sem herdar o rascunho de outro usuário", async () => {
  clinica = "clinica-a";
  usuario = "usuario-a";
  const elemento = document.createElement("div");
  document.body.append(elemento);
  const raiz = createRoot(elemento);
  const botao = (nome: string) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === nome)!;
  try {
    await act(async () => {
      raiz.render(<CargaTeste />);
    });
    await act(async () => {
      botao("Meus prompts").click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.body.textContent).toContain("Meus prompts de simulação");
    expect(document.body.textContent).toContain(pedidoSalvo);
    await act(async () => {
      botao("Usar prompt").click();
    });
    expect(elemento.querySelector<HTMLTextAreaElement>("#carga-pedido")!.value).toBe(pedidoSalvo);
    expect(chamadas.some((c) => c.nome === "prompts" && c.clinicaId === "clinica-a")).toBe(true);

    usuario = "usuario-b";
    await act(async () => {
      raiz.render(<CargaTeste />);
    });
    expect(elemento.querySelector<HTMLTextAreaElement>("#carga-pedido")!.value).toBe("");
    // Fechar e reabrir a página carrega de novo a biblioteca persistida.
    await act(async () => {
      raiz.unmount();
    });
    const novaRaiz = createRoot(elemento);
    try {
      await act(async () => {
        novaRaiz.render(<CargaTeste />);
      });
      await act(async () => {
        botao("Meus prompts").click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(document.body.textContent).toContain(pedidoSalvo);
    } finally {
      await act(async () => {
        novaRaiz.unmount();
      });
    }
  } finally {
    await act(async () => {
      raiz.unmount();
    });
    elemento.remove();
  }
});
