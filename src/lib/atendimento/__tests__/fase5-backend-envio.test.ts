/**
 * FASE 5 — contexto de acesso único e cache curto da configuração.
 *
 * Os testes garantem que nenhuma verificação foi perdida na consolidação:
 * quem não é da clínica, quem não enxerga a conversa e o administrador
 * continuam bloqueados; e que a configuração não é relida a cada envio.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  carregarContextoEnvio,
  COLUNAS_CONVERSA_ENVIO,
} from "../contexto-envio.server";
import { AcessoConversaNegado } from "../acesso-conversa.server";

const CLINICA = "11111111-1111-1111-1111-111111111111";
const CONVERSA = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";

type Cenario = {
  membro?: boolean;
  gestor?: boolean;
  admin?: boolean;
  conversa?: Record<string, unknown> | null;
};

function fakeSupabase(c: Cenario) {
  const contagem = { rpc: 0, conversas: 0 };
  const supabase: any = {
    rpc: (nome: string) => {
      contagem.rpc++;
      const valor =
        nome === "is_member" ? (c.membro ?? true)
        : nome === "can_manage_clinica" ? (c.gestor ?? false)
        : (c.admin ?? false);
      return Promise.resolve({ data: valor, error: null });
    },
    from: (tabela: string) => {
      if (tabela === "atend_conversas") contagem.conversas++;
      const chain: any = {
        select: (cols: string) => {
          chain.cols = cols;
          return chain;
        },
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              c.conversa === undefined
                ? {
                    id: CONVERSA,
                    atribuida_user_id: USER,
                    owner_type: "HUMAN",
                    status: "active",
                    is_teste: false,
                    contato_telefone: "5511999999999",
                    primeiro_resp_em: null,
                    aguardando_desde: null,
                  }
                : c.conversa,
            error: null,
          }),
      };
      return chain;
    },
  };
  return { supabase, contagem };
}

describe("FASE 5 — contexto único de envio", () => {
  it("lê a conversa uma única vez e devolve o contexto completo", async () => {
    const { supabase, contagem } = fakeSupabase({});
    const ctx = await carregarContextoEnvio(supabase, {
      userId: USER,
      clinicaId: CLINICA,
      conversaId: CONVERSA,
    });
    expect(contagem.conversas).toBe(1);
    expect(contagem.rpc).toBe(3);
    expect(ctx.conversa.contato_telefone).toBe("5511999999999");
    expect(ctx.admin).toBe(false);
  });

  it("traz as colunas que o envio precisa (telefone e SLA)", () => {
    for (const col of ["contato_telefone", "primeiro_resp_em", "aguardando_desde", "status"]) {
      expect(COLUNAS_CONVERSA_ENVIO).toContain(col);
    }
  });

  it("bloqueia quem não pertence à clínica", async () => {
    const { supabase } = fakeSupabase({ membro: false });
    await expect(
      carregarContextoEnvio(supabase, { userId: USER, clinicaId: CLINICA, conversaId: CONVERSA }),
    ).rejects.toThrow("Sem acesso a esta clínica");
  });

  it("conversa inexistente na clínica é negada", async () => {
    const { supabase } = fakeSupabase({ conversa: null });
    await expect(
      carregarContextoEnvio(supabase, { userId: USER, clinicaId: CLINICA, conversaId: CONVERSA }),
    ).rejects.toBeInstanceOf(AcessoConversaNegado);
  });

  it("conversa de outra atendente fica fora do escopo de quem não é gestor", async () => {
    const { supabase } = fakeSupabase({
      conversa: {
        id: CONVERSA,
        atribuida_user_id: "99999999-9999-9999-9999-999999999999",
        owner_type: "HUMAN",
        status: "active",
        is_teste: false,
        contato_telefone: "5511999999999",
        primeiro_resp_em: null,
        aguardando_desde: null,
      },
    });
    await expect(
      carregarContextoEnvio(supabase, { userId: USER, clinicaId: CLINICA, conversaId: CONVERSA }),
    ).rejects.toBeInstanceOf(AcessoConversaNegado);
  });

  it("marca administrador para o envio recusar", async () => {
    const { supabase } = fakeSupabase({ admin: true });
    const ctx = await carregarContextoEnvio(supabase, {
      userId: USER,
      clinicaId: CLINICA,
      conversaId: CONVERSA,
    });
    expect(ctx.admin).toBe(true);
  });
});

describe("FASE 5 — cache curto da configuração de WhatsApp", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("consulta o banco uma vez e reaproveita; invalida ao alterar", async () => {
    let chamadas = 0;
    mock.module("@/lib/whatsapp.server", () => ({
      loadWhatsAppConfig: async () => {
        chamadas++;
        return { clinica_id: CLINICA, phone_number_id: "p", access_token: "t" } as any;
      },
    }));
    const mod = await import(`../config-cache.server?fase5=${Date.now()}`);
    mod.limparCacheConfigWhatsApp();

    await mod.obterConfigWhatsApp(CLINICA);
    await mod.obterConfigWhatsApp(CLINICA);
    expect(chamadas).toBe(1);

    // expiração do TTL
    await mod.obterConfigWhatsApp(CLINICA, Date.now() + 120_000);
    expect(chamadas).toBe(2);

    mod.invalidarConfigWhatsApp(CLINICA);
    await mod.obterConfigWhatsApp(CLINICA);
    expect(chamadas).toBe(3);
  });
});
