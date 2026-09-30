import { describe, expect, it } from "bun:test";
import {
  MSG_ADMIN_SO_COM_ATENDENTE,
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
    expect(MSG_ADMIN_SO_COM_ATENDENTE).toContain("atendente");
  });

  it("a bolha otimista já carrega quem enviou e o perfil, sem esperar o servidor", () => {
    const comoGestor = criarMensagemOtimista({ conversaId: "c", texto: "oi", usuarioId: "u1", perfil: "gestor" });
    expect(comoGestor.enviada_por).toBe("humano"); // métricas e espera continuam contando como resposta humana
    expect(comoGestor.enviada_por_user_id).toBe("u1");
    expect(comoGestor.enviada_por_perfil).toBe("gestor");
    const comum = criarMensagemOtimista({ conversaId: "c", texto: "oi", usuarioId: "u2" });
    expect(comum.enviada_por_perfil).toBeNull();
  });
});
