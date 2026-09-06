/**
 * Fase 3 — contratos das ferramentas WebMCP.
 *
 * Os testes usam adaptadores falsos: verificam contrato, permissão, alvo
 * explícito, privacidade e erro explícito, sem tocar em banco ou navegador.
 */
import { describe, expect, test } from "bun:test";
import { montarFerramentasWebmcp, type ApiWebmcp } from "../ferramentas";
import type { AmbienteWebmcp } from "../contexto";

const CLINICA = "11111111-1111-1111-1111-111111111111";
const CONVERSA_TESTE = "22222222-2222-2222-2222-222222222222";
const CONVERSA_REAL = "33333333-3333-3333-3333-333333333333";
const LEAD = "44444444-4444-4444-4444-444444444444";

function apiFalsa(registro: string[]): ApiWebmcp {
  const marca =
    (nome: string, retorno: unknown = { ok: true }) =>
    async (dados: Record<string, unknown>) => {
      registro.push(`${nome}:${JSON.stringify(dados)}`);
      return retorno;
    };
  return {
    listarConversas: marca("listarConversas", { conversas: [] }),
    obterConversa: marca("obterConversa", { id: CONVERSA_TESTE, status: "active" }),
    listarMensagens: marca("listarMensagens", { mensagens: [] }),
    listarEventos: marca("listarEventos", { eventos: [] }),
    listarNotas: marca("listarNotas", { notas: [] }),
    criarNota: marca("criarNota"),
    listarUsuarios: marca("listarUsuarios", []),
    listarPresenca: marca("listarPresenca", []),
    listarDepartamentos: marca("listarDepartamentos", []),
    listarFilaHumana: marca("listarFilaHumana", []),
    transferirConversa: marca("transferirConversa"),
    listarLeadsTeste: marca("listarLeadsTeste", {
      leads: [{ id: LEAD, conversaId: CONVERSA_TESTE }],
    }),
    historicoLeadTeste: marca("historicoLeadTeste", { conversaId: CONVERSA_TESTE, mensagens: [] }),
    enviarMensagemTeste: marca("enviarMensagemTeste", { duplicada: false, reply: "Olá!" }),
    resolverConversaTeste: marca("resolverConversaTeste"),
    listarCatalogo: marca("listarCatalogo", {
      servicos: [
        { id: "s1", nome: "Ultrassom", status: "PUBLICADO", nota_interna: "segredo" },
        { id: "s2", nome: "Raio-X", status: "RASCUNHO" },
      ],
      profissionais: [{ id: "p1", nome: "Dra. Ana", status: "PUBLICADO", nota_interna: "x" }],
    }),
    opcoesCatalogo: marca("opcoesCatalogo", {}),
    salvarServicoCatalogo: marca("salvarServicoCatalogo", { id: "s3" }),
    salvarProfissionalCatalogo: marca("salvarProfissionalCatalogo", { id: "p2" }),
    alterarStatusCatalogo: marca("alterarStatusCatalogo"),
    organizarTextoCatalogoIA: marca("organizarTextoCatalogoIA", { nome: "Ultrassom" }),
  };
}

function montar(opcoes: Partial<{ ambiente: AmbienteWebmcp; clinicaId: string | null; autenticado: boolean }> = {}) {
  const registro: string[] = [];
  const notificados: string[] = [];
  const selecionadas: string[] = [];
  const ferramentas = montarFerramentasWebmcp({
    autenticado: opcoes.autenticado ?? true,
    clinicaId: opcoes.clinicaId === undefined ? CLINICA : opcoes.clinicaId,
    ambiente: opcoes.ambiente ?? "preview",
    api: apiFalsa(registro),
    selecionarConversa: (id) => selecionadas.push(id),
    notificar: (escopo) => notificados.push(escopo),
  });
  const chamar = async (nome: string, entrada: unknown) => {
    const f = ferramentas.find((x) => x.name === nome);
    if (!f) throw new Error(`ferramenta ausente: ${nome}`);
    return JSON.parse(await f.execute(entrada)) as Record<string, unknown>;
  };
  return { ferramentas, chamar, registro, notificados, selecionadas };
}

describe("contrato das ferramentas", () => {
  test("toda ferramenta tem nome, descrição, entrada e anotações coerentes", () => {
    const { ferramentas } = montar();
    expect(ferramentas.length).toBeGreaterThan(10);
    for (const f of ferramentas) {
      expect(f.name).toMatch(/^[a-z_]+$/);
      expect(f.description.length).toBeGreaterThan(30);
      expect(f.description).toContain("Permissão exigida:");
      expect(f.inputSchema["type"]).toBe("object");
      expect(f.inputSchema["additionalProperties"]).toBe(false);
      expect(typeof f.annotations.readOnlyHint).toBe("boolean");
      expect(f.annotations.consequentialHint).toBe(!f.annotations.readOnlyHint);
    }
  });

  test("não existe ferramenta genérica de SQL, script ou requisição livre", () => {
    const { ferramentas } = montar();
    const nomes = ferramentas.map((f) => f.name).join(" ");
    expect(nomes).not.toMatch(/sql|query|eval|script|fetch|http|executar_/);
  });
});

describe("segurança e ciclo de vida", () => {
  test("sessão expirada devolve erro explícito e não chama o backend", async () => {
    const { chamar, registro } = montar({ autenticado: false });
    const r = await chamar("atendimento_listar_conversas", {});
    expect(r["ok"]).toBe(false);
    expect(r["codigo"]).toBe("sessao_expirada");
    expect(registro).toHaveLength(0);
  });

  test("produção bloqueia alteração e mantém leitura", async () => {
    const { chamar, registro } = montar({ ambiente: "producao" });
    const bloqueada = await chamar("atendimento_criar_nota", {
      conversaId: CONVERSA_TESTE,
      conteudo: "teste",
    });
    expect(bloqueada["ok"]).toBe(false);
    expect(bloqueada["codigo"]).toBe("ambiente_somente_leitura");
    expect(registro).toHaveLength(0);

    const leitura = await chamar("atendimento_listar_conversas", {});
    expect(leitura["ok"]).toBe(true);
  });

  test("alteração em conversa que não é de homologação é negada", async () => {
    const { chamar, registro } = montar();
    const r = await chamar("atendimento_transferir_conversa", {
      conversaId: CONVERSA_REAL,
      paraUserId: LEAD,
    });
    expect(r["ok"]).toBe(false);
    expect(r["codigo"]).toBe("conversa_nao_autorizada");
    expect(registro.join(" ")).not.toContain("transferirConversa");
  });

  test("entrada inválida é recusada antes de qualquer chamada", async () => {
    const { chamar, registro } = montar();
    const r = await chamar("atendimento_detalhar_conversa", { conversaId: "não-é-id" });
    expect(r["ok"]).toBe(false);
    expect(r["codigo"]).toBe("entrada_invalida");
    expect(registro).toHaveLength(0);
  });

  test("transferência sem destino é recusada", async () => {
    const { chamar } = montar();
    const r = await chamar("atendimento_transferir_conversa", { conversaId: CONVERSA_TESTE });
    expect(r["ok"]).toBe(false);
    expect(r["codigo"]).toBe("entrada_invalida");
  });
});

describe("alvo explícito e troca de conversa", () => {
  test("a ferramenta age sobre o id informado, não sobre a seleção da tela", async () => {
    const { chamar, registro } = montar();
    await chamar("atendimento_criar_nota", { conversaId: CONVERSA_TESTE, conteudo: "ok" });
    expect(registro.join(" ")).toContain(CONVERSA_TESTE);
    expect(registro.join(" ")).not.toContain(CONVERSA_REAL);
  });

  test("abrir conversa revalida no backend e usa a seleção interna da Inbox", async () => {
    const { chamar, selecionadas, notificados } = montar();
    const r = await chamar("atendimento_abrir_conversa", { conversaId: CONVERSA_TESTE });
    expect(r["ok"]).toBe(true);
    expect(selecionadas).toEqual([CONVERSA_TESTE]);
    expect(notificados).toContain("atendimento");
  });
});

describe("homologação da Nina", () => {
  test("envio exige chave de idempotência e devolve a resposta produzida", async () => {
    const { chamar, registro, notificados } = montar();
    const semChave = await chamar("nina_teste_enviar_mensagem", {
      leadId: LEAD,
      texto: "Bom dia",
    });
    expect(semChave["ok"]).toBe(false);

    const r = await chamar("nina_teste_enviar_mensagem", {
      leadId: LEAD,
      texto: "Bom dia",
      chave: "chave-001",
    });
    expect(r["ok"]).toBe(true);
    expect(r["efeito"]).toBe("operacao_concluida");
    expect(r["resposta_da_nina"]).toBe("Olá!");
    expect(registro.join(" ")).toContain("enviarMensagemTeste");
    expect(notificados).toContain("teste-nina");
  });

  test("chamada repetida reaproveita a proteção existente de duplicidade", async () => {
    const registro: string[] = [];
    const api = apiFalsa(registro);
    let chamadas = 0;
    api.enviarMensagemTeste = async () => {
      chamadas += 1;
      return { duplicada: chamadas > 1, reply: chamadas > 1 ? null : "Olá!" };
    };
    const [ferramenta] = montarFerramentasWebmcp({
      autenticado: true,
      clinicaId: CLINICA,
      ambiente: "preview",
      api,
      selecionarConversa: () => {},
      notificar: () => {},
    }).filter((f) => f.name === "nina_teste_enviar_mensagem");
    const entrada = { leadId: LEAD, texto: "oi", chave: "chave-002" };
    await ferramenta!.execute(entrada);
    const segunda = JSON.parse(await ferramenta!.execute(entrada)) as Record<string, unknown>;
    expect(segunda["duplicada"]).toBe(true);
  });

  test("encerrar teste só aceita a conversa de homologação do lead", async () => {
    const { chamar } = montar();
    const negado = await chamar("nina_teste_encerrar", {
      leadId: LEAD,
      conversaId: CONVERSA_REAL,
    });
    expect(negado["codigo"]).toBe("conversa_nao_autorizada");

    const ok = await chamar("nina_teste_encerrar", { leadId: LEAD, conversaId: CONVERSA_TESTE });
    expect(ok["ok"]).toBe(true);
  });
});

describe("catálogo", () => {
  test("busca filtra por nome e status e nunca devolve nota interna", async () => {
    const { chamar } = montar();
    const r = await chamar("catalogo_buscar", { termo: "ultra", status: "PUBLICADO" });
    const servicos = r["servicos"] as Record<string, unknown>[];
    expect(servicos).toHaveLength(1);
    expect(servicos[0]!["nome"]).toBe("Ultrassom");
    expect(JSON.stringify(r)).not.toContain("nota_interna");
    expect(JSON.stringify(r)).not.toContain("segredo");
  });

  test("organizar com IA devolve rascunho e não grava nada", async () => {
    const { chamar, registro } = montar();
    const r = await chamar("catalogo_organizar_ia", { tipo: "servico", texto: "Ultrassom 200" });
    expect(r["gravado"]).toBe(false);
    expect(r["efeito"]).toBe("operacao_iniciada");
    expect(registro.join(" ")).not.toContain("salvarServicoCatalogo");
  });

  test("publicação usa o fluxo existente e avisa a tela", async () => {
    const { chamar, registro, notificados } = montar();
    const r = await chamar("catalogo_alterar_status", {
      tipo: "servico",
      id: CONVERSA_TESTE,
      status: "PUBLICADO",
    });
    expect(r["ok"]).toBe(true);
    expect(registro.join(" ")).toContain("alterarStatusCatalogo");
    expect(notificados).toContain("catalogo");
  });
});
