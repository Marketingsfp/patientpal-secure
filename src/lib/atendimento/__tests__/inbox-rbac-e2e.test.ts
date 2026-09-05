import { describe, it, expect } from "bun:test";
import {
  conversaVisivelNoEscopo,
  escopoEfetivo,
  normalizarEscopo,
  type EscopoInbox,
} from "../escopo-inbox";

const JEAN = "jean";
const MARIA = "maria";

type Conv = {
  id: string;
  atribuida_user_id: string | null;
  owner_type: string;
  status: string;
};

function cenario(): Conv[] {
  const lista: Conv[] = [];
  const add = (n: number, pref: string, over: Partial<Conv>) => {
    for (let i = 1; i <= n; i++) {
      lista.push({
        id: `${pref}${i}`,
        atribuida_user_id: null,
        owner_type: "HUMAN",
        status: "active",
        ...over,
      });
    }
  };
  add(5, "j", { atribuida_user_id: JEAN }); // Jean = 5
  add(4, "m", { atribuida_user_id: MARIA }); // Maria = 4
  add(10, "n", { owner_type: "AI" }); // Nina = 10
  add(3, "f", {}); // Não atribuídas = 3
  return lista;
}

const conta = (
  lista: Conv[],
  escopo: EscopoInbox,
  userId: string,
  gestor = false,
): number => lista.filter((c) => conversaVisivelNoEscopo(c, { escopo, userId, gestor })).length;

describe("FASE 5 — RBAC e cenário completo da Inbox individual", () => {
  it("cada conta tem a sua Inbox: Jean não vê as conversas de Maria", () => {
    const l = cenario();
    expect(conta(l, "minhas", JEAN)).toBe(5);
    expect(conta(l, "minhas", MARIA)).toBe(4);
    expect(l.filter((c) => conversaVisivelNoEscopo(c, { escopo: "minhas", userId: JEAN, gestor: false }))
      .every((c) => c.atribuida_user_id === JEAN)).toBe(true);
  });

  it("Nina e Não atribuídas ficam em visões separadas", () => {
    const l = cenario();
    expect(conta(l, "nina", JEAN)).toBe(10);
    expect(conta(l, "nao_atribuidas", JEAN)).toBe(3);
    // Nenhuma conversa da Nina aparece na Inbox pessoal.
    expect(conta(l, "minhas", JEAN)).toBe(5);
  });

  it("transferência Jean → Maria move o número entre as duas Inboxes", () => {
    const l = cenario();
    l[0]!.atribuida_user_id = MARIA;
    expect(conta(l, "minhas", JEAN)).toBe(4);
    expect(conta(l, "minhas", MARIA)).toBe(5);
  });

  it("handoff Nina → Jean tira da Nina e soma em Minhas conversas", () => {
    const l = cenario();
    const nina1 = l.find((c) => c.id === "n1")!;
    nina1.owner_type = "HUMAN";
    nina1.atribuida_user_id = JEAN;
    expect(conta(l, "nina", JEAN)).toBe(9);
    expect(conta(l, "minhas", JEAN)).toBe(6);
  });

  it("resolver sai da Inbox ativa e entra em Fechadas", () => {
    const l = cenario();
    l[0]!.status = "closed";
    expect(conta(l, "minhas", JEAN)).toBe(4);
    expect(conta(l, "fechadas", JEAN)).toBe(1);
  });

  it("nova mensagem após resolução reabre com a Nina, não com o último humano", () => {
    const l = cenario();
    const c = l[0]!;
    c.status = "closed";
    // Reabertura: nova sessão sob responsabilidade da IA.
    c.status = "active";
    c.owner_type = "AI";
    c.atribuida_user_id = null;
    expect(conta(l, "minhas", JEAN)).toBe(4);
    expect(conta(l, "fechadas", JEAN)).toBe(0);
    expect(conta(l, "nina", JEAN)).toBe(11);
  });

  it("Equipe é visão de supervisão: exige permissão e não se mistura com Minhas", () => {
    const l = cenario();
    // Atendente comum pedindo "equipe" volta para a própria Inbox.
    expect(escopoEfetivo("equipe", false)).toBe("minhas");
    expect(conta(l, "equipe", JEAN, false)).toBe(5);
    // Supervisor vê a operação inteira apenas no filtro Equipe.
    expect(conta(l, "equipe", JEAN, true)).toBe(22);
    expect(conta(l, "minhas", JEAN, true)).toBe(5);
  });

  it("Equipe mostra só conversas em andamento; o histórico fica em Fechadas", () => {
    const l = cenario();
    l[0]!.status = "closed";
    expect(conta(l, "equipe", JEAN, true)).toBe(21);
    expect(conta(l, "fechadas", JEAN, true)).toBe(1);
  });

  it("nome antigo do filtro continua sendo aceito", () => {
    expect(normalizarEscopo("todas")).toBe("equipe");
    expect(normalizarEscopo("minhas")).toBe("minhas");
    expect(normalizarEscopo("inexistente")).toBe("minhas");
  });
});
