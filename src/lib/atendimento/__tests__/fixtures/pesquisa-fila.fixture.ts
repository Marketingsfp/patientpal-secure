/** Fila da pesquisa (17/10/2026) com banco simulado em memória e Meta falsa. */
import { mock } from "bun:test";
import assert from "node:assert/strict";

mock.module("@/lib/whatsapp.server", () => ({
  loadWhatsAppConfig: async () => null,
  metaSendList: async () => ({ wa_message_id: "nao-usar" }),
  metaSendText: async () => ({ wa_message_id: "nao-usar" }),
}));
const {
  enviarPesquisasNaFila,
  LOTE_FILA_PESQUISA,
  processarRespostaPesquisaSatisfacao,
  registrarPesquisaNaFila,
  TRAVA_ENVIO_PESQUISA,
} = await import("../../pesquisa-satisfacao.server");

type Linha = Record<string, any>;
const pausa = () => new Promise((ok) => setTimeout(ok, 0));

/** Subconjunto do PostgREST usado pelo módulo; cada ida ao banco cede a vez. */
function banco(tabelas: Record<string, Linha[]>) {
  return {
    tabelas,
    from(nome: string) {
      const linhas = (tabelas[nome] ??= []);
      const filtros: ((l: Linha) => boolean)[] = [];
      let acao: { tipo: "select" | "update" | "insert"; valores?: Linha } = { tipo: "select" };
      let devolver = false;
      let ordem: { campo: string; asc: boolean } | null = null;
      let limite = Infinity;
      const casa = (v: unknown, padrao: string) =>
        typeof v === "string" && v.startsWith(padrao.replace(/%$/, ""));
      const executar = async () => {
        await pausa();
        if (acao.tipo === "insert") {
          const nova = {
            id: crypto.randomUUID(),
            solicitada_em: new Date().toISOString(),
            ...acao.valores,
          };
          linhas.push(nova);
          return { data: devolver ? nova : null, error: null };
        }
        let alvo = linhas.filter((l) => filtros.every((f) => f(l)));
        if (ordem) {
          const o = ordem;
          alvo = [...alvo].sort(
            (a, b) => String(a[o.campo]).localeCompare(String(b[o.campo])) * (o.asc ? 1 : -1),
          );
        }
        alvo = alvo.slice(0, limite);
        if (acao.tipo === "update") for (const l of alvo) Object.assign(l, acao.valores);
        return {
          data: acao.tipo === "update" && !devolver ? null : alvo.map((l) => ({ ...l })),
          error: null,
        };
      };
      const q: any = {
        select: () => {
          devolver = true;
          return q;
        },
        update: (valores: Linha) => {
          acao = { tipo: "update", valores };
          return q;
        },
        insert: (valores: Linha) => {
          acao = { tipo: "insert", valores };
          return q;
        },
        eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
        is: (c: string, v: unknown) => (filtros.push((l) => (l[c] ?? null) === v), q),
        like: (c: string, p: string) => (filtros.push((l) => casa(l[c], p)), q),
        lt: (c: string, v: string) => (filtros.push((l) => l[c] < v), q),
        gte: (c: string, v: string) => (filtros.push((l) => l[c] >= v), q),
        in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
        not: (c: string, op: string, v: string) => (
          filtros.push((l) => (op === "is" ? (l[c] ?? null) !== null : !casa(l[c], v))),
          q
        ),
        order: (campo: string, o: { ascending: boolean }) => (
          (ordem = { campo, asc: o.ascending }),
          q
        ),
        limit: (n: number) => ((limite = n), q),
        maybeSingle: async () => {
          const r = await executar();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
        },
        single: async () => executar(),
        then: (ok: any, erro: any) => executar().then(ok, erro),
      };
      return q;
    },
  };
}

const agora = new Date("2026-10-17T15:00:00.000Z");
const antes = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString();
const conversa = (id: string, status = "closed") => ({
  id,
  status,
  contato_telefone: "5521999990000",
  is_teste: false,
});
const pesquisa = (id: string, conversa_id: string, extra: Linha = {}) => ({
  id,
  clinica_id: "clinica",
  conversa_id,
  status: "pendente",
  nota: null,
  solicitacao_wa_message_id: null,
  solicitada_em: antes(1),
  ...extra,
});
function metaFalsa(falhar = false) {
  const chamadas: string[] = [];
  return {
    chamadas,
    enviar: async (_clinica: string, telefone: string) => {
      chamadas.push(telefone);
      await pausa();
      if (falhar) throw new Error("Meta recusou o envio");
      return {
        wa_message_id: `wamid.${chamadas.length}`,
        corpo: "pesquisa",
        tipo: "interactive",
        de: "+5521",
      };
    },
  };
}

// 1) Encerrar só registra: nada vai à Meta.
{
  const db = banco({ atend_avaliacoes: [] });
  const r = await registrarPesquisaNaFila({
    db: db as never,
    clinicaId: "clinica",
    conversaId: "c1",
    atendenteUserId: "ana",
    solicitadaPorUserId: "ana",
    conversa: { contato_telefone: "5521999990000", is_teste: false },
  });
  assert.equal(r.registrada, true);
  assert.equal(db.tabelas.atend_avaliacoes.length, 1);
  assert.equal(db.tabelas.atend_avaliacoes[0].status, "pendente");
  assert.equal(db.tabelas.atend_avaliacoes[0].solicitacao_wa_message_id ?? null, null);
}

// 2) Envia, grava a identificação da Meta e espelha no chat.
{
  const db = banco({
    atend_avaliacoes: [pesquisa("p1", "c1")],
    atend_conversas: [conversa("c1")],
    whatsapp_mensagens: [],
  });
  const meta = metaFalsa();
  const r = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(r.enviadas, 1);
  assert.equal(db.tabelas.atend_avaliacoes[0].solicitacao_wa_message_id, "wamid.1");
  assert.ok(db.tabelas.atend_avaliacoes[0].solicitada_em > antes(1));
  assert.equal(db.tabelas.whatsapp_mensagens[0].enviada_por, "sistema");
  assert.equal(db.tabelas.whatsapp_mensagens[0].wa_message_id, "wamid.1");
}

// 3) Duas rodadas ao mesmo tempo: a trava deixa só uma enviar.
{
  const db = banco({
    atend_avaliacoes: [pesquisa("p1", "c1")],
    atend_conversas: [conversa("c1")],
    whatsapp_mensagens: [],
  });
  const meta = metaFalsa();
  await Promise.all([
    enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar }),
    enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar }),
  ]);
  assert.equal(meta.chamadas.length, 1);
  assert.equal(db.tabelas.whatsapp_mensagens.length, 1);
}

// 4) Conversa reaberta antes do envio: descarta sem enviar.
{
  const db = banco({
    atend_avaliacoes: [pesquisa("p1", "c1")],
    atend_conversas: [conversa("c1", "active")],
  });
  const meta = metaFalsa();
  const r = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(r.expiradas, 1);
  assert.equal(meta.chamadas.length, 0);
  assert.equal(db.tabelas.atend_avaliacoes[0].status, "expirada");
}

// 5) Mais de 2 horas na fila: falha registrada, sem envio.
{
  const db = banco({
    atend_avaliacoes: [pesquisa("p1", "c1", { solicitada_em: antes(121) })],
    atend_conversas: [conversa("c1")],
  });
  const meta = metaFalsa();
  const r = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(r.atrasadas, 1);
  assert.equal(meta.chamadas.length, 0);
  assert.equal(db.tabelas.atend_avaliacoes[0].status, "falha_envio");
  assert.match(db.tabelas.atend_avaliacoes[0].falha_envio, /2 horas/);
}

// 6) Envio interrompido (trava com mais de 5 min): falha, sem reenviar;
//    trava recente fica quieta (outra rodada ainda pode estar enviando).
{
  const db = banco({
    atend_avaliacoes: [
      pesquisa("velha", "c1", {
        solicitacao_wa_message_id: `${TRAVA_ENVIO_PESQUISA}${agora.getTime() - 6 * 60_000}:x`,
      }),
      pesquisa("recente", "c2", {
        solicitacao_wa_message_id: `${TRAVA_ENVIO_PESQUISA}${agora.getTime() - 60_000}:y`,
      }),
    ],
    atend_conversas: [conversa("c1"), conversa("c2")],
  });
  const meta = metaFalsa();
  const r = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(r.interrompidas, 1);
  assert.equal(meta.chamadas.length, 0);
  const [velha, recente] = db.tabelas.atend_avaliacoes;
  assert.equal(velha.status, "falha_envio");
  assert.match(velha.falha_envio, /interrompido/);
  assert.equal(recente.status, "pendente");
}

// 7) Meta recusa: falha registrada com o motivo.
{
  const db = banco({
    atend_avaliacoes: [pesquisa("p1", "c1")],
    atend_conversas: [conversa("c1")],
    whatsapp_mensagens: [],
  });
  const meta = metaFalsa(true);
  const r = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(r.falhas, 1);
  assert.equal(db.tabelas.atend_avaliacoes[0].status, "falha_envio");
  assert.equal(db.tabelas.atend_avaliacoes[0].falha_envio, "Meta recusou o envio");
  assert.equal(db.tabelas.whatsapp_mensagens.length, 0);
}

// 8) Nota só vale depois do envio: "5" com a pesquisa na fila não conta.
{
  const recente = new Date().toISOString();
  const db = banco({
    atend_avaliacoes: [pesquisa("p1", "c1", { solicitada_em: recente })],
    whatsapp_mensagens: [{ id: "m1", clinica_id: "clinica" }],
  });
  const resposta = {
    db: db as never,
    clinicaId: "clinica",
    conversaId: "c1",
    texto: "5",
    mensagemId: "m1",
    waMessageId: "wamid.resposta",
  };
  const naFila = await processarRespostaPesquisaSatisfacao(resposta);
  assert.equal(naFila.tratada, false);
  assert.equal(db.tabelas.atend_avaliacoes[0].status, "pendente");
  db.tabelas.atend_avaliacoes[0].solicitacao_wa_message_id = `${TRAVA_ENVIO_PESQUISA}1:z`;
  const enviando = await processarRespostaPesquisaSatisfacao(resposta);
  assert.equal(enviando.tratada, false);
  db.tabelas.atend_avaliacoes[0].solicitacao_wa_message_id = "wamid.pesquisa";
  const enviada = await processarRespostaPesquisaSatisfacao(resposta);
  assert.equal(enviada.tratada, true);
  assert.equal(db.tabelas.atend_avaliacoes[0].status, "respondida");
  assert.equal(db.tabelas.atend_avaliacoes[0].nota, 5);
}

// 9) Até 20 por rodada; o resto sai na rodada seguinte.
{
  assert.equal(LOTE_FILA_PESQUISA, 20);
  const ids = Array.from({ length: 25 }, (_, i) => `c${i}`);
  const db = banco({
    atend_avaliacoes: ids.map((c, i) => pesquisa(`p${i}`, c)),
    atend_conversas: ids.map((c) => conversa(c)),
    whatsapp_mensagens: [],
  });
  const meta = metaFalsa();
  const primeira = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(primeira.enviadas, 20);
  const segunda = await enviarPesquisasNaFila({ db: db as never, agora, enviar: meta.enviar });
  assert.equal(segunda.enviadas, 5);
  assert.equal(meta.chamadas.length, 25);
}

console.log("Fila da pesquisa validada com banco simulado.");
