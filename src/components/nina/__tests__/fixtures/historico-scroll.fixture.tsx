import { afterAll, beforeEach, expect, it } from "bun:test";
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const nome of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "WheelEvent",
  "KeyboardEvent",
])
  Object.defineProperty(globalThis, nome, { configurable: true, value: dom.window[nome] });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { useHistoricoAnterior } = await import("@/hooks/use-historico-anterior");
const { act, useState, useRef, useLayoutEffect } = React;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let box: HTMLDivElement;
let trocar: (s: string) => void;
let adicionar: () => void;
let chamadas: string[];
let responder: (ids: string[]) => void;
let falhar: (e: Error) => void;
const lote = (chave: string, inicio: number) =>
  Array.from({ length: 10 }, (_, i) => `${chave}-${inicio + i}`);

function App() {
  const [chave, setChave] = useState("a");
  const [itens, setItens] = useState(lote("a", 11));
  const [temMais, setTemMais] = useState(true);
  const ref = useRef<HTMLDivElement | null>(null);
  trocar = (c) => {
    setChave(c);
    setItens(lote(c, 11));
    setTemMais(true);
  };
  adicionar = () => setItens((prev) => [...prev, `${chave}-21`]);
  useLayoutEffect(() => {
    box = ref.current!;
    Object.defineProperty(box, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(box, "scrollHeight", {
      configurable: true,
      get: () => box.querySelectorAll("[data-historico-id]").length * 40,
    });
    box.getBoundingClientRect = () => ({ top: 0, bottom: 120 }) as DOMRect;
    Array.from(box.querySelectorAll<HTMLElement>("[data-historico-id]")).forEach((el, i) => {
      el.getBoundingClientRect = () =>
        ({ top: i * 40 - box.scrollTop, bottom: (i + 1) * 40 - box.scrollTop }) as DOMRect;
    });
  });
  const h = useHistoricoAnterior({
    chave,
    containerRef: ref,
    ativo: true,
    temMais,
    antesDeCarregar: () => {},
    carregar: () => {
      chamadas.push(chave);
      return new Promise<string[]>((resolve, reject) => {
        responder = resolve;
        falhar = reject;
      });
    },
    aplicar: (ids) => {
      setItens((prev) => [...ids, ...prev]);
      setTemMais(ids.length === 10);
    },
  });
  return (
    <>
      <output>{h.carregando ? "Carregando" : h.erro ? "Erro" : "Pronto"}</output>
      <button onClick={() => void h.carregar()}>Tentar</button>
      <div ref={ref}>
        {itens.map((id) => (
          <div key={id} data-historico-id={id}>
            {id}
          </div>
        ))}
      </div>
    </>
  );
}
async function subir() {
  await act(async () => {
    box.scrollTop = 80;
    box.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
  });
}
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.append(host);
  chamadas = [];
  root = createRoot(host);
  await act(async () => root.render(<App />));
});
afterAll(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

it("abrir não dispara consultas em cascata, mesmo com o topo visível", () => {
  expect(chamadas).toHaveLength(0);
  expect(box.querySelectorAll("[data-historico-id]")).toHaveLength(10);
});
it("subir carrega uma página, mostra loading e bloqueia pedidos concorrentes", async () => {
  await subir();
  await subir();
  expect(chamadas).toEqual(["a"]);
  expect(host.querySelector("output")!.textContent).toBe("Carregando");
  await act(async () => responder(lote("a", 1)));
  expect(box.querySelectorAll("[data-historico-id]")).toHaveLength(20);
  expect(box.scrollTop).toBe(480);
  await act(async () => box.dispatchEvent(new Event("scroll")));
  expect(chamadas).toHaveLength(1);
});
it("preserva a leitura mesmo com mensagem nova e movimento enquanto espera", async () => {
  await subir();
  await act(async () => {
    adicionar();
    box.scrollTop = 45;
  });
  await act(async () => responder(lote("a", 1)));
  expect(box.scrollTop).toBe(445);
  expect(box.lastElementChild!.textContent).toBe("a-21");
});
it("falha mantém o conteúdo e permite tentar novamente", async () => {
  await subir();
  await act(async () => falhar(new Error("rede")));
  expect(host.querySelector("output")!.textContent).toBe("Erro");
  expect(box.children).toHaveLength(10);
  await act(async () => host.querySelector("button")!.click());
  expect(chamadas).toHaveLength(2);
  await act(async () => responder(["a-10"]));
  await subir();
  expect(chamadas).toHaveLength(2);
});
it("resposta atrasada não invade outra conversa, inclusive A → B → A", async () => {
  await subir();
  const antiga = responder;
  await act(async () => trocar("b"));
  await act(async () => trocar("a"));
  await act(async () => antiga(lote("a", 1)));
  expect(box.children).toHaveLength(10);
  expect(box.firstElementChild!.textContent).toBe("a-11");
  expect(host.querySelector("output")!.textContent).toBe("Pronto");
});
it("rolagem para baixo não carrega histórico; teclado para cima carrega", async () => {
  await act(async () => box.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 })));
  expect(chamadas).toHaveLength(0);
  await act(async () => box.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" })));
  expect(chamadas).toHaveLength(1);
  await act(async () => responder([]));
});
