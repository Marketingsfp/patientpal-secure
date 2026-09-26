/**
 * 25/09/2026 — o aviso "Ciclo iniciado" era gravado sem canal e sem marca de
 * teste. O trigger `atend_ensure_conversa` (reproduzido abaixo) escolhe a
 * conversa pelo telefone e pelo canal da mensagem e criava uma conversa "real"
 * de WhatsApp para o número virtual. A Nina, que escolhia a conversa mais
 * recente do telefone, gravava o 1º turno nela e perdia a memória no 2º.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

type Linha = Record<string, any>;
const CLINICA = "11111111-1111-4111-8111-111111111111";
const TELEFONE = "55000100473";
let conversas: Linha[];
let mensagens: Linha[];
let relogio = 0;
const agora = () => new Date(Date.UTC(2026, 8, 26, 1, 45, 0, relogio++)).toISOString();
const digitos = (t: unknown) => String(t ?? "").replace(/\D/g, "");

/** Mesma regra do trigger `atend_ensure_conversa` no banco. */
function gatilhoConversa(msg: Linha) {
  const tel = digitos(msg.direction === "in" ? msg.from_number : msg.to_number);
  if (tel.length < 5) return;
  const canal = msg.canal ?? "whatsapp";
  let conv = conversas
    .filter((c) => c.clinica_id === msg.clinica_id && c.canal === canal && digitos(c.contato_telefone) === tel)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const momento = agora();
  if (!conv) {
    conv = { id: `criada-${conversas.length}`, clinica_id: msg.clinica_id, canal, contato_telefone: tel,
      is_teste: false, created_at: momento, ultima_msg_em: momento, nina_fluxo_estado: null };
    conversas.push(conv);
  } else conv.ultima_msg_em = momento;
  msg.conversa_id = conv.id;
}

function consulta(tabela: string) {
  const filtros: Array<(r: Linha) => boolean> = [];
  let ordem: { campo: string; asc: boolean } | null = null;
  const linhas = () => {
    const base = (tabela === "atend_conversas" ? conversas : mensagens).filter((r) => filtros.every((f) => f(r)));
    if (ordem) {
      const { campo, asc } = ordem;
      base.sort((a, b) => (asc ? 1 : -1) * String(a[campo] ?? "").localeCompare(String(b[campo] ?? "")));
    }
    return base;
  };
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => (filtros.push((r) => r[k] === v), q),
    in: (k: string, v: unknown[]) => (filtros.push((r) => v.includes(r[k])), q),
    order: (campo: string, o?: { ascending?: boolean }) => ((ordem = { campo, asc: o?.ascending !== false }), q),
    limit: () => q,
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    insert: (row: Linha) => {
      if (tabela === "whatsapp_mensagens") {
        const msg = { ...row };
        gatilhoConversa(msg);
        mensagens.push(msg);
        return Promise.resolve({ error: null });
      }
      const nova = { id: `inserida-${conversas.length}`, created_at: agora(), ...row };
      conversas.push(nova);
      return { select: () => ({ maybeSingle: async () => ({ data: nova, error: null }) }) };
    },
  };
  return q;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (tabela: string) => consulta(tabela) },
}));

// Outros arquivos da suíte substituem estes módulos por versões falsas; o
// sufixo carrega uma instância própria, ligada ao banco simulado acima.
const SUFIXO = "?conversa-teste-unica";
const { registrarMarcadorSistema } = (await import(`../handoff.server.ts${SUFIXO}`)) as typeof import("../handoff.server");
const { carregarEstadoIdentidade } = (await import(`../../whatsapp.server.ts${SUFIXO}`)) as typeof import("../../whatsapp.server");

beforeEach(() => {
  relogio = 0;
  mensagens = [];
  const criada = agora();
  conversas = [{ id: "conversa-teste", clinica_id: CLINICA, canal: "test-console", is_teste: true,
    contato_telefone: TELEFONE, created_at: criada, ultima_msg_em: criada,
    nina_fluxo_estado: { greeting_completed: true, knowledge_context: { consulta: { termo: "cardiologia" } } } }];
});

describe("aviso interno fica na conversa de teste", () => {
  test("início de ciclo não cria conversa de WhatsApp para o número virtual", async () => {
    await registrarMarcadorSistema({ clinicaId: CLINICA, conversaId: "conversa-teste", texto: "Ciclo 473 iniciado" });
    expect(conversas).toHaveLength(1);
    expect(mensagens[0]).toMatchObject({ conversa_id: "conversa-teste", canal: "test-console", is_teste: true });
  });

  test("conversa real de WhatsApp recebe o aviso como antes", async () => {
    conversas = [{ id: "conversa-real", clinica_id: CLINICA, canal: "whatsapp", is_teste: false,
      contato_telefone: "5521999990000", created_at: agora(), ultima_msg_em: agora() }];
    await registrarMarcadorSistema({ clinicaId: CLINICA, conversaId: "conversa-real", texto: "Handoff realizado" });
    expect(conversas).toHaveLength(1);
    expect(mensagens[0]).toMatchObject({ conversa_id: "conversa-real", canal: "whatsapp" });
    expect(mensagens[0]!.is_teste).toBeUndefined();
  });

  test("depois do aviso, o turno pelo telefone continua na conversa de teste", async () => {
    await registrarMarcadorSistema({ clinicaId: CLINICA, conversaId: "conversa-teste", texto: "Ciclo 473 iniciado" });
    const turno = await carregarEstadoIdentidade(CLINICA, TELEFONE);
    expect(turno.conversaId).toBe("conversa-teste");
  });
});

describe("a Nina usa a conversa informada pelo teste", () => {
  function comConversaFantasma() {
    // Situação criada pelo defeito antigo: outra conversa mais recente no mesmo número.
    const depois = agora();
    conversas.push({ id: "conversa-fantasma", clinica_id: CLINICA, canal: "whatsapp", is_teste: false,
      contato_telefone: TELEFONE, created_at: depois, ultima_msg_em: depois, nina_fluxo_estado: null });
  }

  test("1º e 2º turno leem a mesma memória, mesmo com outra conversa no número", async () => {
    comConversaFantasma();
    const primeiro = await carregarEstadoIdentidade(CLINICA, TELEFONE, "conversa-teste");
    const segundo = await carregarEstadoIdentidade(CLINICA, TELEFONE, "conversa-teste");
    expect(primeiro.conversaId).toBe("conversa-teste");
    expect(segundo.conversaId).toBe("conversa-teste");
    expect(segundo.fluxoEstadoBruto).toMatchObject({ greeting_completed: true });
  });

  test("sem conversa informada (WhatsApp real), segue a mais recente do telefone", async () => {
    comConversaFantasma();
    const turno = await carregarEstadoIdentidade(CLINICA, TELEFONE);
    expect(turno.conversaId).toBe("conversa-fantasma");
  });

  test("conversa informada inexistente volta à busca pelo telefone", async () => {
    const turno = await carregarEstadoIdentidade(CLINICA, TELEFONE, "nao-existe");
    expect(turno.conversaId).toBe("conversa-teste");
  });
});
