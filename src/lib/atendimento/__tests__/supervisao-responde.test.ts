import { describe, expect, it } from "bun:test";
import {
  MSG_ADMIN_NAO_RESPONDE_AQUI,
  adminPodeResponder,
  conversaSemResponsavel,
  ROTULO_PERFIL_SUPERVISAO,
  conversaComAtendente,
  perfilSupervisao,
  rotuloAutorSupervisao,
} from "../perfil-atendimento";
import { criarMensagemOtimista } from "../envio-otimista";

describe("supervisão (admin e gestor) respondendo no chat da atendente", () => {
  it("o perfil exato é gravado: admin tem precedência; atendente comum não tem perfil", () => {
    expect(perfilSupervisao({ admin: true, gestor: true })).toBe("admin");
    expect(perfilSupervisao({ admin: false, gestor: true })).toBe("gestor");
    expect(perfilSupervisao({ admin: false, gestor: false })).toBeNull();
  });

  it("a etiqueta da bolha existe só para admin e gestor, como a da Nina", () => {
    expect(rotuloAutorSupervisao("admin")).toBe("Admin");
    expect(rotuloAutorSupervisao("gestor")).toBe("Gestor");
    expect(rotuloAutorSupervisao("admin", "Quédima")).toBe("Admin Quédima");
    expect(rotuloAutorSupervisao("gestor", "  Maria Silva  ")).toBe("Gestor Maria Silva");
    expect(rotuloAutorSupervisao("admin", " ")).toBe("Admin");
    expect(rotuloAutorSupervisao("telefonia", "Quédima")).toBeNull();
    expect(rotuloAutorSupervisao(null)).toBeNull();
    expect(rotuloAutorSupervisao("telefonia")).toBeNull();
    expect(ROTULO_PERFIL_SUPERVISAO).toEqual({ admin: "Admin", gestor: "Gestor" });
  });

  it("só vale para conversa aberta que está com uma atendente", () => {
    const base = { atribuida_user_id: "ana", owner_type: "HUMAN", status: "active" };
    expect(conversaComAtendente(base)).toBe(true);
    expect(conversaComAtendente({ ...base, status: "waiting" })).toBe(true);
    expect(conversaComAtendente({ ...base, atribuida_user_id: null })).toBe(false); // sem responsável
    expect(conversaComAtendente({ ...base, owner_type: "AI" })).toBe(false); // com a Nina
    expect(conversaComAtendente({ ...base, status: "closed" })).toBe(false);
    expect(conversaComAtendente({ ...base, status: "finished" })).toBe(false);
    expect(MSG_ADMIN_NAO_RESPONDE_AQUI).toContain("sem responsável");
  });

  it("conversa sem responsável (fila global): supervisão responde sem ser atribuída; Nina e fechadas ficam de fora", () => {
    const livre = { atribuida_user_id: null, owner_type: "NONE", status: "waiting" };
    expect(conversaSemResponsavel(livre)).toBe(true);
    expect(conversaSemResponsavel({ ...livre, owner_type: "AI" })).toBe(false);
    expect(conversaSemResponsavel({ ...livre, status: "closed" })).toBe(false);
    expect(conversaSemResponsavel({ ...livre, atribuida_user_id: "ana" })).toBe(false);
  });

  it("o admin responde conversas com atendente ou sem responsável, e só elas", () => {
    expect(
      adminPodeResponder({ atribuida_user_id: "ana", owner_type: "HUMAN", status: "active" }),
    ).toBe(true);
    expect(
      adminPodeResponder({ atribuida_user_id: null, owner_type: "NONE", status: "waiting" }),
    ).toBe(true);
    expect(
      adminPodeResponder({ atribuida_user_id: null, owner_type: "AI", status: "active" }),
    ).toBe(false);
    expect(
      adminPodeResponder({ atribuida_user_id: "ana", owner_type: "HUMAN", status: "closed" }),
    ).toBe(false);
  });

  it("a bolha otimista já carrega quem enviou e o perfil, sem esperar o servidor", () => {
    const comoGestor = criarMensagemOtimista({
      conversaId: "c",
      texto: "oi",
      usuarioId: "u1",
      perfil: "gestor",
    });
    expect(comoGestor.enviada_por).toBe("humano"); // métricas e espera continuam contando como resposta humana
    expect(comoGestor.enviada_por_user_id).toBe("u1");
    expect(comoGestor.enviada_por_perfil).toBe("gestor");
    const comum = criarMensagemOtimista({ conversaId: "c", texto: "oi", usuarioId: "u2" });
    expect(comum.enviada_por_perfil).toBeNull();
  });
});

it("conversa da Nina mostra o aviso próprio de bloqueio; as demais seguem o aviso geral (08/10/2026)", async () => {
  const { motivoAdminNaoResponde, MSG_CONVERSA_DA_NINA, MSG_ADMIN_NAO_RESPONDE_AQUI } = await import("@/lib/atendimento/perfil-atendimento");
  expect(motivoAdminNaoResponde({ owner_type: "AI", status: "active" })).toBe(MSG_CONVERSA_DA_NINA);
  expect(MSG_CONVERSA_DA_NINA).toContain("Conversas atribuídas à Nina são bloqueadas");
  expect(motivoAdminNaoResponde({ owner_type: "AI", status: "closed" })).toBe(MSG_ADMIN_NAO_RESPONDE_AQUI);
  expect(motivoAdminNaoResponde({ owner_type: "HUMAN", status: "finished" })).toBe(MSG_ADMIN_NAO_RESPONDE_AQUI);
});
