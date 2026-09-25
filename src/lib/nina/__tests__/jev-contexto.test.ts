/**
 * Jev — contexto enviado junto da mensagem e regressão da sessão 470
 * (pedir consulta → "neuro" → "carlos eduardo" não pode virar encaminhamento).
 */
import { describe, expect, test } from "bun:test";
import {
  autorDaMensagem,
  contextoAtendimentoJev,
  marcoAtendimento,
  montarHistoricoJev,
  opcaoEscolhidaJev,
  opcoesOferecidasJev,
} from "../jev-contexto";
import { contarDuvida, decidirEncaminhamento } from "../jev-encaminhamento";
import { estadoVazio } from "../fluxo-estado-normalizar";
import type { EstadoFluxoNina } from "../fluxo-estado-normalizar";

const OFERTA_NEURO =
  "Temos Neurologia com dois profissionais: Anderson Eloy (presencial, R$ 350) e Carlos Eduardo (presencial ou teleconsulta, R$ 380). Com qual deles você prefere agendar?";

/** Registros como vêm do banco: do mais novo para o mais antigo, `in`/`out`. */
const HISTORICO_BANCO = [
  { id: "m5", direction: "in", body: "carlos eduardo", created_at: "2026-09-25T19:51:54Z", conversa_id: "c1" },
  { id: "m4", direction: "out", body: OFERTA_NEURO, created_at: "2026-09-25T19:51:16Z", conversa_id: "c1" },
  { id: "m3", direction: "in", body: "neuro", created_at: "2026-09-25T19:50:52Z", conversa_id: "c1" },
  { id: "m2", direction: "out", body: "Claro! Qual especialidade ou médico você procura?", created_at: "2026-09-25T19:50:39Z", conversa_id: "c1" },
  { id: "m1", direction: "in", body: "quero marcar uma consulta", created_at: "2026-09-25T19:50:19Z", conversa_id: "c1" },
  { id: "m0", direction: "out", body: "Olá! Sou a Nina (ciclo anterior)", created_at: "2026-09-25T18:00:00Z", conversa_id: "c1" },
];

function estadoComOferta(): EstadoFluxoNina {
  const e = estadoVazio();
  e.session_id = "s1";
  e.session_started_at = "2026-09-25T19:50:00Z";
  e.knowledge_context = {
    versao: 1,
    clinicaId: "cl",
    sessionId: "s1",
    consulta: { termo: "neurologia" },
    referencias: [
      { registro: "cat-anderson", versao: null, procedimento: "Consulta Neurologia", medicoNome: "Anderson Eloy" },
      { registro: "cat-carlos", versao: null, procedimento: "Consulta Neurologia", medicoNome: "Carlos Eduardo Lima" },
    ],
  };
  return e;
}

describe("histórico enviado ao Jev", () => {
  test("reconhece in/inbound como paciente e out/outbound como atendente", () => {
    expect(autorDaMensagem("in")).toBe("paciente");
    expect(autorDaMensagem("inbound")).toBe("paciente");
    expect(autorDaMensagem("out")).toBe("atendente");
    expect(autorDaMensagem("outbound")).toBe("atendente");
    expect(autorDaMensagem("system")).toBeNull();
  });

  test("ordem cronológica, sem a mensagem atual e só do ciclo atual", () => {
    const h = montarHistoricoJev(HISTORICO_BANCO, {
      excluirIds: ["m5"],
      conversaId: "c1",
      desde: "2026-09-25T19:50:00Z",
    });
    expect(h.map((f) => f.texto.slice(0, 12))).toEqual([
      "quero marcar",
      "Claro! Qual ",
      "neuro",
      "Temos Neurol",
    ]);
    expect(h.map((f) => f.de)).toEqual(["paciente", "atendente", "paciente", "atendente"]);
  });

  test("a última pergunta da atendente vai completa; as outras são cortadas", () => {
    const longa = `${"lista ".repeat(150)}Com qual deles você prefere agendar?`;
    const h = montarHistoricoJev(
      [
        { id: "a", direction: "out", body: "x".repeat(900), created_at: "2026-09-25T10:00:00Z" },
        { id: "b", direction: "out", body: longa, created_at: "2026-09-25T10:01:00Z" },
      ],
      {},
    );
    expect(h[0]!.texto.length).toBeLessThanOrEqual(501);
    expect(h[1]!.texto).toContain("Com qual deles você prefere agendar?");
  });

  test("outra conversa não entra", () => {
    const h = montarHistoricoJev([{ id: "x", direction: "in", body: "oi", created_at: "2026-09-25T10:00:00Z", conversa_id: "outra" }], {
      conversaId: "c1",
    });
    expect(h).toEqual([]);
  });
});

describe("contexto do atendimento e escolha de opção", () => {
  test("leva a etapa e as opções oferecidas com os IDs do catálogo", () => {
    const ctx = contextoAtendimentoJev(estadoComOferta());
    expect(ctx.atendimento_pesquisado).toBe("neurologia");
    expect(ctx.opcoes_oferecidas.map((o) => o.id)).toEqual(["cat-anderson", "cat-carlos"]);
  });

  test("opções de outra sessão não valem", () => {
    const e = estadoComOferta();
    e.session_id = "s2";
    expect(opcoesOferecidasJev(e)).toEqual([]);
  });

  test("'carlos eduardo' escolhe a opção oferecida; nome ambíguo ou fora da lista não", () => {
    const opcoes = opcoesOferecidasJev(estadoComOferta());
    expect(opcaoEscolhidaJev("carlos eduardo", opcoes)?.id).toBe("cat-carlos");
    expect(opcaoEscolhidaJev("Dr. Anderson", opcoes)?.id).toBe("cat-anderson");
    expect(opcaoEscolhidaJev("quero o Paulo", opcoes)).toBeNull();
    expect(opcaoEscolhidaJev("consulta", opcoes)).toBeNull();
    expect(opcaoEscolhidaJev("neuro", opcoes)?.atendimento).toBe("Consulta Neurologia");
  });

  test("o marco muda quando o atendimento avança", () => {
    const antes = estadoVazio();
    expect(marcoAtendimento(antes)).not.toBe(marcoAtendimento(estadoComOferta()));
  });
});

describe("regressão da sessão 470", () => {
  test("pedir consulta → neuro → carlos eduardo não encaminha", () => {
    const base = { urgencia: { noul: 0.05 }, pedido_atendente: { noul: 0.05 }, irritacao: { noul: 0.05 } };
    const semOferta = estadoVazio();
    semOferta.session_id = "s1";
    // "quero marcar uma consulta": entendido (1,00).
    const c1 = contarDuvida({ entendimento: { noul: 0.98 }, selecaoValida: false, marco: marcoAtendimento(semOferta), anterior: null });
    expect(decidirEncaminhamento(base, c1)).toBeNull();
    // "neuro" responde "qual especialidade?": a intenção se divide (0,39), mas dá para entender.
    const c2 = contarDuvida({ entendimento: { noul: 0.9 }, selecaoValida: false, marco: marcoAtendimento(semOferta), anterior: c1 });
    expect(c2.falhas).toBe(0);
    // Mesmo que o Jev achasse "neuro" incompreensível, seria só 1 falha.
    expect(contarDuvida({ entendimento: { noul: 0.3 }, selecaoValida: false, marco: marcoAtendimento(semOferta), anterior: c1 }).falhas).toBe(1);
    expect(decidirEncaminhamento(base, c2)).toBeNull();
    // A Nina ofereceu Neurologia; "carlos eduardo" (0,37) escolhe uma opção.
    const comOferta = estadoComOferta();
    const escolha = opcaoEscolhidaJev("carlos eduardo", opcoesOferecidasJev(comOferta));
    const c3 = contarDuvida({
      entendimento: { noul: 0.9 },
      selecaoValida: escolha !== null,
      marco: marcoAtendimento(comOferta),
      anterior: c2,
    });
    expect(escolha?.id).toBe("cat-carlos");
    expect(c3.falhas).toBe(0);
    expect(decidirEncaminhamento(base, c3)).toBeNull();
  });

  test("três respostas realmente incompreensíveis, sem avanço, encaminham (duas não)", () => {
    const base = { urgencia: { noul: 0.05 }, pedido_atendente: { noul: 0.05 }, irritacao: { noul: 0.05 } };
    const e = estadoComOferta();
    const marco = marcoAtendimento(e);
    const c1 = contarDuvida({ entendimento: { noul: 0.1 }, selecaoValida: opcaoEscolhidaJev("asdkj qwe", opcoesOferecidasJev(e)) !== null, marco, anterior: null });
    const c2 = contarDuvida({ entendimento: { noul: 0.12 }, selecaoValida: opcaoEscolhidaJev("zzz ???", opcoesOferecidasJev(e)) !== null, marco, anterior: c1 });
    expect(decidirEncaminhamento(base, c2)).toBeNull();
    const c3 = contarDuvida({ entendimento: { noul: 0.08 }, selecaoValida: opcaoEscolhidaJev("??", opcoesOferecidasJev(e)) !== null, marco, anterior: c2 });
    expect(decidirEncaminhamento(base, c3)?.motivo).toContain("JEV_DUVIDA_REPETIDA");
  });

  test("confirmação curta ('sim') entendida não conta como falha", () => {
    const c = contarDuvida({ entendimento: { noul: 0.92 }, selecaoValida: false, marco: "m", anterior: { falhas: 1, marco: "m", confiancas: [0.4] } });
    expect(c.falhas).toBe(0);
  });
});
