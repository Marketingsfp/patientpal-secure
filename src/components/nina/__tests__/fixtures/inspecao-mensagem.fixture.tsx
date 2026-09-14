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
  "NodeFilter",
  "Element",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act } = React;
let falhar = false;
let vinculoPendente = false;
let chamadas = 0;
let reportes: unknown[] = [];
let detalhes: unknown[] = [];
const clinicaId = "11111111-1111-4111-8111-111111111111";
const conversaId = "22222222-2222-4222-8222-222222222222";
const mensagemId = "33333333-3333-4333-8333-333333333333";
const mensagem = {
  id: mensagemId,
  clinica_id: clinicaId,
  conversa_id: conversaId,
  direction: "out",
  enviada_por: "sistema",
  status: "sent",
  execucao_id: null,
};
const saida = {
  mensagemId,
  clinicaId,
  conversaId,
  inspecionavel: true,
  execucaoId: "e1",
  ambiente: "producao",
  classe: "aviso_operacional",
  explicacao: "Aviso entregue; a candidata bloqueada tem outra avaliação.",
  limitacao: null,
  origem: "Aviso de encaminhamento",
  textoEntregue: "A equipe vai continuar por aqui.",
  textoEntregueHash: "aviso",
  motivoSubstituicao: "Bloqueio da candidata",
  entrega: null,
  encaminhamento: null,
  score: null,
  nivel: null,
  avaliacoes: [
    {
      decisaoId: "d1",
      score: 0,
      nivel: "LOW",
      representacao: "texto_completo",
      textoHash: "candidata",
      criadoEm: null,
      desteTexto: false,
    },
  ],
};
mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
mock.module("@/lib/nina/saida-mensagem.functions", () => ({
  saidasDasMensagens: async ({ data }: { data: { mensagemIds: string[]; clinicaId: string } }) => {
    chamadas++;
    if (falhar) throw new Error("consulta indisponível");
    return data.mensagemIds.map((id) => ({
      ...saida,
      mensagemId: id,
      clinicaId: data.clinicaId,
      ...(vinculoPendente ? { inspecionavel: false, classe: "sem_avaliacao" } : {}),
    }));
  },
  detalhesDaMensagemNina: async ({ data }: { data: unknown }) => {
    detalhes.push(data);
    return { leitura: null, runtimeAtual: "fixture-servidor-atual" };
  },
}));
mock.module("@/lib/nina/feedback-erros.functions", () => ({
  reportarErroRapidoMensagemNina: async ({ data }: { data: unknown }) => {
    reportes.push(data);
    return { duplicado: false };
  },
}));
mock.module("sonner", () => ({ toast: { success: () => {}, info: () => {}, error: () => {} } }));
const { InspecaoMensagemNina } = await import("../../InspecaoMensagemNina");
const { useSaidasDasMensagens } = await import("../../SaidaMensagem");
const { marcadorInternoSistema } = await import("@/lib/nina/inspecao-mensagem");
afterAll(() => dom.window.close());

function montar(children: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    container,
    client,
    root,
    render: async (novo = children) => {
      await act(async () =>
        root.render(<QueryClientProvider client={client}>{novo}</QueryClientProvider>),
      );
    },
    fechar: async () => {
      await act(async () => root.unmount());
      client.clear();
      container.remove();
    },
  };
}
async function aguardar(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
function controles(parcial: Partial<typeof saida> = {}, msg = mensagem) {
  const props = {
    clinicaId,
    conversaId,
    mensagem: msg,
    saida: { ...saida, ...parcial },
  } as React.ComponentProps<typeof InspecaoMensagemNina>;
  return (
    <>
      <InspecaoMensagemNina {...props} parte="reporte" />
      <InspecaoMensagemNina {...props} parte="detalhes" />
    </>
  );
}

it("real e homologação exibem o mesmo aviso, reporte e detalhes sem atribuir LOW 0 à bolha", async () => {
  for (const ambiente of ["producao", "homologacao"]) {
    reportes = [];
    detalhes = [];
    const ui = montar(controles({ ambiente }));
    await ui.render();
    expect(ui.container.textContent).toContain("Aviso do sistema");
    expect(ui.container.textContent).not.toContain("0/100");
    const botoes = Array.from(ui.container.querySelectorAll("button"));
    const reporte = botoes.find((b) => b.getAttribute("aria-label")?.includes("Reportar"));
    expect(reporte).toBeDefined();
    await act(async () => reporte!.click());
    expect(reportes).toEqual([{ clinicaId, conversaId, mensagemId }]);
    await act(async () => botoes.find((b) => b.textContent === "Detalhes técnicos")!.click());
    expect(detalhes).toEqual([{ clinicaId, conversaId, mensagemId }]);
    expect(document.body.textContent).toContain("Núcleo atual do servidor: fixture-servidor-atual");
    await ui.fechar();
  }
});

it("mensagem externa ou evento interno não recebe os controles de Nina", async () => {
  expect(marcadorInternoSistema({ ...mensagem, status: "system" })).toBe(true);
  expect(marcadorInternoSistema(mensagem)).toBe(false);
  for (const [parcial, msg] of [
    [{}, { ...mensagem, status: "system" }],
    [{}, { ...mensagem, direction: "in" }],
    [{}, { ...mensagem, enviada_por: "humano" }],
    [{ inspecionavel: false }, mensagem],
    [{ clinicaId: "outra-clinica" }, mensagem],
    [{ conversaId: "outra-conversa" }, mensagem],
  ] as [Partial<typeof saida>, typeof mensagem][]) {
    const ui = montar(controles(parcial, msg));
    await ui.render();
    expect(ui.container.querySelectorAll("button")).toHaveLength(0);
    await ui.fechar();
  }
});

it("falha de leitura mostra Falha e Tentar novamente, então recupera a inspeção", async () => {
  chamadas = 0;
  falhar = true;
  function Tela() {
    const mapa = useSaidasDasMensagens(clinicaId, conversaId, [mensagemId]);
    return (
      <InspecaoMensagemNina
        clinicaId={clinicaId}
        conversaId={conversaId}
        mensagem={mensagem}
        saida={mapa[mensagemId]}
        parte="detalhes"
      />
    );
  }
  const ui = montar(<Tela />);
  await ui.render();
  await aguardar();
  expect(ui.container.textContent).toContain("Falha ao carregar");
  expect(ui.container.textContent).not.toContain("Não avaliada");
  await aguardar(1600);
  expect(chamadas).toBe(1); // Falha não dispara reconsulta automática.
  falhar = false;
  await act(async () =>
    Array.from(ui.container.querySelectorAll("button"))
      .find((b) => b.textContent === "Tentar novamente")!
      .click(),
  );
  await aguardar();
  expect(chamadas).toBe(2);
  expect(ui.container.textContent).toContain("Aviso do sistema");
  expect(ui.container.textContent).toContain("Detalhes técnicos");
  await ui.fechar();
});

it("leitura com mais de 200 mensagens consulta todos os lotes sem preencher o restante como Não avaliada", async () => {
  chamadas = 0;
  const ids = Array.from(
    { length: 201 },
    (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
  );
  function Tela() {
    const mapa = useSaidasDasMensagens(clinicaId, conversaId, ids);
    return <span>{Object.keys(mapa).length}</span>;
  }
  const ui = montar(<Tela />);
  await ui.render();
  await aguardar();
  expect(chamadas).toBe(2);
  expect(ui.container.textContent).toBe("201");
  await ui.fechar();
});

it("execução recebida depois da bolha refaz a inspeção sem esperar outra mensagem", async () => {
  chamadas = 0;
  const { revisaoInspecaoMensagens } = await import("@/lib/nina/inspecao-mensagem");
  function Tela({ execucaoId }: { execucaoId: string | null }) {
    const mapa = useSaidasDasMensagens(
      clinicaId,
      conversaId,
      [mensagemId],
      revisaoInspecaoMensagens([{ ...mensagem, execucao_id: execucaoId }]),
    );
    return <span>{Object.keys(mapa).length}</span>;
  }
  const ui = montar(<Tela execucaoId={null} />);
  await ui.render();
  await aguardar();
  expect(chamadas).toBe(1);
  await ui.render(<Tela execucaoId="execucao-tardia" />);
  await aguardar();
  expect(chamadas).toBe(2);
  await ui.fechar();
});

it("vínculo do aviso chega sem alterar mensagem, execução ou status e libera os controles", async () => {
  chamadas = 0;
  vinculoPendente = true;
  function Tela() {
    const mapa = useSaidasDasMensagens(clinicaId, conversaId, [mensagemId], "mesma-revisao");
    return (
      <>
        <InspecaoMensagemNina
          clinicaId={clinicaId}
          conversaId={conversaId}
          mensagem={mensagem}
          saida={mapa[mensagemId]}
          parte="reporte"
        />
        <InspecaoMensagemNina
          clinicaId={clinicaId}
          conversaId={conversaId}
          mensagem={mensagem}
          saida={mapa[mensagemId]}
          parte="detalhes"
        />
      </>
    );
  }
  const ui = montar(<Tela />);
  await ui.render();
  await aguardar();
  expect(chamadas).toBe(1);
  expect(ui.container.querySelectorAll("button")).toHaveLength(0);
  vinculoPendente = false; // Apenas a API muda; nenhuma prop ou mensagem é alterada.
  await aguardar(1600);
  expect(chamadas).toBe(2);
  expect(ui.container.textContent).toContain("Aviso do sistema");
  expect(ui.container.textContent).toContain("Detalhes técnicos");
  expect(ui.container.querySelector('button[aria-label*="Reportar"]')).not.toBeNull();
  await aguardar(1600);
  expect(chamadas).toBe(2); // Vínculo comprovado encerra a reconsulta.
  await ui.fechar();
}, 10000);

it("registro que permanece incompleto para após quatro consultas", async () => {
  chamadas = 0;
  vinculoPendente = true;
  function Tela() {
    const mapa = useSaidasDasMensagens(clinicaId, conversaId, [mensagemId]);
    return <span>{Object.keys(mapa).length}</span>;
  }
  const ui = montar(<Tela />);
  await ui.render();
  await aguardar(4650);
  expect(chamadas).toBe(4);
  await aguardar(1600);
  expect(chamadas).toBe(4);
  await ui.fechar();
  vinculoPendente = false;
}, 10000);
