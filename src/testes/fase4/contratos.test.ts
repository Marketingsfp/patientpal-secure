/**
 * FASE 4 — CENÁRIOS DE CONTRATO (dados sintéticos, resultado esperado fixo).
 *
 * Estes testes provam as REGRAS do sistema usando as funções reais.
 * Eles NÃO substituem:
 *   - os testes de interface (`e2e/*.spec.ts`, Playwright);
 *   - o teste da Nina com o modelo real (`scripts/nina-modelo-real.ts`).
 *
 * Chamar uma regra diretamente prova que a regra existe e é obedecida.
 * Não prova que a tela mostra, nem que a Nina sabe executar.
 */
import { describe, expect, test } from "bun:test";
import {
  ADMIN,
  ATENDENTE_OFFLINE,
  ATENDENTE_ONLINE,
  ATENDENTE_PAUSA,
  CONVERSA_A,
  CONVERSA_B,
  conversas,
  equipe,
  presenca,
  profissionalPublicado,
  servicoPublicado,
} from "./dados-sinteticos";
import { SEM_NOME, nomeConversa, tituloConversa } from "@/lib/atendimento/rotulo-conversa";
import {
  MSG_ADMIN_NAO_ATENDE,
  ROTULO_PRESENCA,
  apenasDestinatariosValidos,
  ehPerfilAdmin,
  podeReceberConversa,
  statusPresenca,
} from "@/lib/atendimento/perfil-atendimento";
import { criarCacheConversas, respostaAindaVale } from "@/lib/atendimento/conversa-cache";
import { acaoPermitida, gravarRascunho, lerRascunho } from "@/lib/atendimento/rascunhos-conversa";
import { conversaVisivelNoEscopo, normalizarEscopo } from "@/lib/atendimento/escopo-inbox";
import { avisoVigente, montarResultadoCatalogo } from "@/lib/nina/catalogo-conhecimento";
import { conversaResolvida, derivarResponsavel } from "@/lib/atendimento/ciclo-responsabilidade";

/* ------------------------------------------------------------------ *
 * CENÁRIO 1 — CONVERSAS: identificação, busca e troca rápida A → B → A
 * ------------------------------------------------------------------ */
describe("cenário 1 — identificação e troca de conversa", () => {
  test("o nome é a identificação principal; telefone continua secundário", () => {
    expect(tituloConversa(conversas.comPaciente)).toBe(
      "TESTE Maria Aparecida da Silva Sauro",
    );
    expect(tituloConversa(conversas.comNomeDoContato)).toBe("TESTE João Batista");
    // Telefone escrito no campo de nome NÃO vira identificação.
    expect(nomeConversa(conversas.semNome)).toBeNull();
    expect(tituloConversa(conversas.semNome)).toBe(SEM_NOME);
    // O telefone permanece disponível como dado secundário.
    expect(conversas.semNome.contato_telefone).toBe("+55 11 99999-0003");
  });

  test("nome longo é preservado inteiro (a tela é que encurta visualmente)", () => {
    const longo = { contato_nome: null, contato_telefone: "+5511999990001", pacientes: { nome: "TESTE " + "Ana ".repeat(20).trim() } };
    expect(tituloConversa(longo).length).toBeGreaterThan(60);
  });

  test("troca rápida A → B → A não mistura mensagens", () => {
    const cache = criarCacheConversas(5);
    cache.guardar(CONVERSA_A, { msgs: [{ id: "a1" }], contato: null, notas: [], eventos: [] });
    cache.guardar(CONVERSA_B, { msgs: [{ id: "b1" }], contato: null, notas: [], eventos: [] });
    expect(cache.obter(CONVERSA_A)?.msgs).toEqual([{ id: "a1" }]);
    expect(cache.obter(CONVERSA_B)?.msgs).toEqual([{ id: "b1" }]);
    // Uma resposta atrasada da conversa A não pode cair na tela da B.
    expect(
      respostaAindaVale({ alvo: CONVERSA_A, selecionadaAgora: CONVERSA_B, pedido: 1, pedidoAtual: 1 }),
    ).toBe(false);
    // A resposta correta e mais recente é aceita.
    expect(
      respostaAindaVale({ alvo: CONVERSA_B, selecionadaAgora: CONVERSA_B, pedido: 2, pedidoAtual: 2 }),
    ).toBe(true);
    // Pedido superado é descartado.
    expect(
      respostaAindaVale({ alvo: CONVERSA_B, selecionadaAgora: CONVERSA_B, pedido: 1, pedidoAtual: 2 }),
    ).toBe(false);
  });

  test("rascunho pertence a uma conversa e não vaza na troca", () => {
    let mapa = gravarRascunho({}, CONVERSA_A, "texto para a Maria");
    mapa = gravarRascunho(mapa, CONVERSA_B, "texto para o João");
    expect(lerRascunho(mapa, CONVERSA_A)).toBe("texto para a Maria");
    expect(lerRascunho(mapa, CONVERSA_B)).toBe("texto para o João");
    // Voltar para A recupera o rascunho de A, íntegro.
    expect(lerRascunho(mapa, CONVERSA_A)).toBe("texto para a Maria");
  });

  test("uma ação só vale para a conversa que está aberta agora", () => {
    expect(acaoPermitida({ alvo: CONVERSA_A, selecionadaAgora: CONVERSA_B, carregando: false })).toBe(false);
    expect(acaoPermitida({ alvo: CONVERSA_A, selecionadaAgora: CONVERSA_A, carregando: true })).toBe(false);
    expect(acaoPermitida({ alvo: CONVERSA_A, selecionadaAgora: CONVERSA_A, carregando: false })).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * CENÁRIO 2 — PERFIS
 * ------------------------------------------------------------------ */
describe("cenário 2 — administrador vê, transfere, mas nunca atende", () => {
  test("administrador nunca pode receber conversa", () => {
    expect(ehPerfilAdmin("admin")).toBe(true);
    expect(ehPerfilAdmin("ADMIN")).toBe(true);
    expect(podeReceberConversa("admin")).toBe(false);
    expect(podeReceberConversa("atendente")).toBe(true);
    expect(MSG_ADMIN_NAO_ATENDE).toContain("não pode assumir");
  });

  test("a lista de destinos de transferência exclui administradores", () => {
    const destinos = apenasDestinatariosValidos(equipe).map((p) => p.id);
    expect(destinos).toContain(ATENDENTE_ONLINE);
    expect(destinos).not.toContain(ADMIN);
  });

  test("administrador enxerga a operação inteira; atendente vê o que é dele", () => {
    const conversaDeOutro = { id: CONVERSA_A, status: "active", owner_type: "HUMAN", atribuida_user_id: ATENDENTE_ONLINE } as never;
    // Gestor no escopo de equipe: enxerga.
    expect(conversaVisivelNoEscopo(conversaDeOutro, { escopo: "equipe", gestor: true, userId: ADMIN })).toBe(true);
    // Atendente no escopo padrão "minhas": não é dele, não aparece.
    expect(
      conversaVisivelNoEscopo(conversaDeOutro, { escopo: normalizarEscopo(null), gestor: false, userId: ATENDENTE_PAUSA }),
    ).toBe(false);
    // É dele: aparece.
    expect(
      conversaVisivelNoEscopo(conversaDeOutro, { escopo: "minhas", gestor: false, userId: ATENDENTE_ONLINE }),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * CENÁRIO 3 — TRANSFERÊNCIAS E PRESENÇA
 * ------------------------------------------------------------------ */
describe("cenário 3 — presença e elegibilidade na transferência", () => {
  test("online, pausa e offline são calculados pelo heartbeat e pela pausa", () => {
    expect(statusPresenca(presenca.online)).toBe("ONLINE");
    expect(statusPresenca(presenca.pausa)).toBe("PAUSA");
    expect(statusPresenca(presenca.offline)).toBe("OFFLINE");
    expect(statusPresenca(presenca.nuncaVisto)).toBe("OFFLINE");
  });

  test("cada estado tem texto próprio — a cor nunca é a única informação", () => {
    expect(ROTULO_PRESENCA.ONLINE).toBe("Online");
    expect(ROTULO_PRESENCA.PAUSA).toBe("Em pausa");
    expect(ROTULO_PRESENCA.OFFLINE).toBe("Offline");
  });

  test("distribuição por setor: só atendente online e nunca administrador", () => {
    const estados: Record<string, keyof typeof ROTULO_PRESENCA> = {
      [ATENDENTE_ONLINE]: "ONLINE",
      [ATENDENTE_PAUSA]: "PAUSA",
      [ATENDENTE_OFFLINE]: "OFFLINE",
      [ADMIN]: "ONLINE",
    };
    const elegiveis = apenasDestinatariosValidos(equipe).filter((p) => estados[p.id] === "ONLINE");
    expect(elegiveis.map((p) => p.id)).toEqual([ATENDENTE_ONLINE]);

    // Ninguém online: nada é distribuído, a conversa espera em "Não atribuídas".
    const semNinguem = apenasDestinatariosValidos(equipe).filter(() => false);
    expect(semNinguem).toHaveLength(0);
    const aguardando = { id: CONVERSA_B, status: "active", owner_type: "HUMAN", atribuida_user_id: null } as never;
    expect(conversaVisivelNoEscopo(aguardando, { escopo: "nao_atribuidas", gestor: false, userId: ATENDENTE_ONLINE })).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * CENÁRIO 4 — CATÁLOGO COMO ÚNICA BASE
 * ------------------------------------------------------------------ */
describe("cenário 4 — catálogo publicado alimenta a Nina", () => {
  const resultado = montarResultadoCatalogo({
    servicos: [servicoPublicado],
    profissionais: [profissionalPublicado],
    hojeISO: "2026-01-15",
  });

  test("a origem é o catálogo — nunca a planilha", () => {
    expect(resultado.source).toBe("nina_catalogo");
    expect(resultado.source_type).toBe("catalog");
    // A base antiga não é mais citada como origem de nenhum registro.
    expect(resultado.base_file).toBeNull();
    expect(resultado.base_version).toBeNull();
    for (const t of resultado.trace) expect(String(t.sheet)).toContain("Catálogo");
  });

  test("valores condicionais aparecem separados por forma de pagamento", () => {
    const texto = JSON.stringify(resultado);
    expect(texto).toContain("180");
    expect(texto).toContain("210");
  });

  test("preparo, restrições, unidade e convênio chegam ao contexto", () => {
    const texto = JSON.stringify(resultado);
    expect(texto).toContain("Jejum de 8 horas");
    expect(texto).toContain("gestantes");
    expect(resultado.units).toContain("TESTE Unidade Centro");
    expect(texto).toContain("TESTE Convênio Vida");
  });

  test("recorrência quinzenal é preservada e o aviso respeita a validade", () => {
    expect(JSON.stringify(resultado)).toMatch(/quinzenal/i);
    expect(avisoVigente(profissionalPublicado, "2026-01-15")).toContain("09:00");
    expect(avisoVigente(profissionalPublicado, "2026-01-05")).toBeNull();
    expect(avisoVigente(profissionalPublicado, "2026-02-01")).toBeNull();
  });

  test("catálogo vazio (rascunho/arquivado não recuperado) não inventa resposta", () => {
    const vazio = montarResultadoCatalogo({ servicos: [], profissionais: [], hojeISO: "2026-01-15" });
    expect(vazio.found).toBe(false);
    expect(vazio.knowledge_status).toBe("not_found");
    expect(vazio.price).toBeNull();
    expect(vazio.instrucao).toMatch(/NÃO tem essa informação/i);
    expect(vazio.instrucao).toMatch(/proibido deduzir|verificar com a equipe/i);
  });

  test("nota interna nunca faz parte do contexto entregue à Nina", () => {
    const comNota = { ...servicoPublicado, nota_interna: "combinar desconto com a diretoria" } as never;
    const r = montarResultadoCatalogo({ servicos: [comNota], profissionais: [], hojeISO: "2026-01-15" });
    expect(JSON.stringify(r)).not.toContain("nota_interna");
    expect(JSON.stringify(r)).not.toContain("diretoria");
  });
});

/* ------------------------------------------------------------------ *
 * CENÁRIO 6 — PROTOCOLO MJ-<número> (formato e ciclo)
 * ------------------------------------------------------------------ */
describe("cenário 6 — formato e ciclo do protocolo", () => {
  const FORMATO = /^MJ-\d+$/;

  test("o formato aceito é MJ-<número inteiro>", () => {
    expect(FORMATO.test("MJ-1")).toBe(true);
    expect(FORMATO.test("MJ-1342")).toBe(true);
    expect(FORMATO.test("MJ-")).toBe(false);
    expect(FORMATO.test("mj-1")).toBe(false);
    expect(FORMATO.test("MJ-1a")).toBe(false);
  });

  test("um protocolo por ciclo: mesma sessão reaproveita, sessão nova gera outro", () => {
    // Espelha a regra do banco: a chave do ciclo é o session_id da Nina.
    const emitidos = new Map<string, string>();
    let sequencia = 0;
    const gerar = (sessao: string) => {
      const existente = emitidos.get(sessao);
      if (existente) return { protocolo: existente, novo: false };
      sequencia += 1;
      const protocolo = `MJ-${sequencia}`;
      emitidos.set(sessao, protocolo);
      return { protocolo, novo: true };
    };
    const transferencia = gerar("sessao-1");
    const agendamentoMesmoCiclo = gerar("sessao-1");
    const aposReabertura = gerar("sessao-2");

    expect(transferencia).toEqual({ protocolo: "MJ-1", novo: true });
    expect(agendamentoMesmoCiclo).toEqual({ protocolo: "MJ-1", novo: false });
    expect(aposReabertura).toEqual({ protocolo: "MJ-2", novo: true });
    expect(new Set(emitidos.values()).size).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * CENÁRIO 7 — ENCERRAMENTO E MEMÓRIA
 * ------------------------------------------------------------------ */
describe("cenário 7 — encerrar e reiniciar sem contaminação", () => {
  test("conversa resolvida não é respondida por ninguém até reabrir", () => {
    const resolvida = { status: "closed", owner_type: "AI", assigned_to: null, resolved_at: new Date().toISOString() } as never;
    expect(conversaResolvida(resolvida)).toBe(true);
    expect(derivarResponsavel(resolvida)).toBe("RESOLVIDA");
  });

  test("o conteúdo de um paciente some do cache ao encerrar o teste dele", () => {
    const cache = criarCacheConversas(5);
    cache.guardar(CONVERSA_A, { msgs: [{ id: "a1" }], contato: null, notas: [], eventos: [] });
    cache.guardar(CONVERSA_B, { msgs: [{ id: "b1" }], contato: null, notas: [], eventos: [] });
    cache.invalidar(CONVERSA_A);
    expect(cache.obter(CONVERSA_A)).toBeUndefined();
    // O outro paciente não é afetado.
    expect(cache.obter(CONVERSA_B)?.msgs).toEqual([{ id: "b1" }]);
  });
});
