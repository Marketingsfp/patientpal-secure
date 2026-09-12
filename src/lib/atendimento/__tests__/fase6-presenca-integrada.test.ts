/**
 * FASE 6 — testes integrados de presença manual do OS ZAP.
 *
 * Cada cenário percorre a cadeia completa em memória:
 *   controle da tela → gravação no "servidor" (com versão, autoria e escopo)
 *   → sincronização entre abas → elegibilidade usada pela distribuição.
 *
 * O servidor aqui é um substituto em memória que reproduz as regras já
 * aplicadas no banco (versão otimista, dono do registro, escopo por clínica).
 * NÃO é o banco real: cenários com banco, WhatsApp e conversas reais seguem
 * como pendentes no relatório.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  CONTROLE_INICIAL,
  aoCarregar,
  aoConfirmar,
  aoFalhar,
  aoIniciarGravacao,
  opcaoDesabilitada,
  opcaoSelecionada,
  precisaEscolher,
  recebeNovasConversas,
  textoSituacao,
  type ControlePresenca,
} from "../controle-presenca";
import {
  SINCRONIA_INICIAL,
  aplicarAtualizacao,
  precisaRelerOficial,
  type EstadoSincronizado,
} from "../presenca-sync";
import {
  ConflitoPresencaError,
  precisaEscolherPresenca,
  versaoAceita,
  type EstadoManualPresenca,
} from "../presenca-manual";
import { poolElegivel, verificarElegibilidade } from "@/lib/nina/telefonia-elegibilidade";

/* ------------------------------------------------------------------ *
 * Servidor em memória (mesmas regras do banco)                        *
 * ------------------------------------------------------------------ */

type Registro = {
  estadoManual: EstadoManualPresenca | null;
  versao: number;
  por: string | null;
  vistoEm: number;
};

type Conversa = { id: string; responsavel: string | null };

class ServidorPresenca {
  private dados = new Map<string, Registro>();
  conversas: Conversa[] = [];
  falharProxima = false;

  private chave(clinicaId: string, userId: string) {
    return `${clinicaId}:${userId}`;
  }

  semear(clinicaId: string, userId: string, r: Partial<Registro>) {
    this.dados.set(this.chave(clinicaId, userId), {
      estadoManual: null,
      versao: 0,
      por: null,
      vistoEm: Date.now(),
      ...r,
    });
  }

  ler(clinicaId: string, userId: string): Registro {
    return (
      this.dados.get(this.chave(clinicaId, userId)) ?? {
        estadoManual: null,
        versao: 0,
        por: null,
        vistoEm: 0,
      }
    );
  }

  /** Único caminho que muda a escolha: ação explícita do próprio atendente. */
  definir(args: {
    clinicaId: string;
    userId: string;
    autor: string;
    estado: EstadoManualPresenca;
    versaoLida?: number | null;
  }): Registro {
    if (this.falharProxima) {
      this.falharProxima = false;
      throw new Error("Falha de rede ao salvar a presença.");
    }
    if (args.autor !== args.userId) {
      throw new Error("Não é possível alterar a presença de outro atendente.");
    }
    const atual = this.ler(args.clinicaId, args.userId);
    if (!versaoAceita(atual.versao, args.versaoLida)) {
      throw new ConflitoPresencaError(atual.versao);
    }
    const novo: Registro = {
      estadoManual: args.estado,
      versao: atual.versao + 1,
      por: args.autor,
      vistoEm: Date.now(),
    };
    this.dados.set(this.chave(args.clinicaId, args.userId), novo);
    return novo;
  }

  /** Sinal de vida: nunca toca na escolha. */
  heartbeat(clinicaId: string, userId: string) {
    const atual = this.ler(clinicaId, userId);
    this.dados.set(this.chave(clinicaId, userId), { ...atual, vistoEm: Date.now() });
  }

  /** Distribuição: só entra quem escolheu Online e cumpre os demais requisitos. */
  atribuir(clinicaId: string, conversaId: string, candidatos: string[]): string | null {
    const elegiveis = candidatos.filter(
      (u) =>
        verificarElegibilidade({
          userId: u,
          temTelefonia: true,
          status: this.ler(clinicaId, u).estadoManual,
        }).eligible_for_nina_handoff,
    );
    const escolhido = elegiveis[0] ?? null;
    const conversa = this.conversas.find((c) => c.id === conversaId);
    if (conversa && escolhido) conversa.responsavel = escolhido;
    return escolhido;
  }
}

/** Uma aba aberta: tela + sincronização, sem estado global compartilhado. */
class Aba {
  controle: ControlePresenca = CONTROLE_INICIAL;
  sincronia: EstadoSincronizado = SINCRONIA_INICIAL;
  private seq = 0;

  constructor(
    private srv: ServidorPresenca,
    readonly clinicaId: string,
    readonly userId: string,
  ) {}

  /** Abrir/recarregar/reconectar: relê o oficial. Não é escolha nova. */
  carregar() {
    const r = this.srv.ler(this.clinicaId, this.userId);
    this.receber({
      clinicaId: this.clinicaId,
      userId: this.userId,
      estado: r.estadoManual,
      versao: r.versao,
      seq: ++this.seq,
    });
    this.controle = aoCarregar(this.controle, this.sincronia.estado);
    return this.controle;
  }

  /** Clique explícito no controle manual. */
  escolher(estado: EstadoManualPresenca, autor = this.userId) {
    this.controle = aoIniciarGravacao(this.controle, estado);
    try {
      const r = this.srv.definir({
        clinicaId: this.clinicaId,
        userId: this.userId,
        autor,
        estado,
        versaoLida: this.sincronia.versao < 0 ? null : this.sincronia.versao,
      });
      this.receber({
        clinicaId: this.clinicaId,
        userId: this.userId,
        estado: r.estadoManual,
        versao: r.versao,
        seq: ++this.seq,
      });
      this.controle = aoConfirmar(this.controle, estado);
      return { ok: true as const, versao: r.versao };
    } catch (e) {
      const conflito = e instanceof ConflitoPresencaError;
      this.controle = aoFalhar(this.controle, (e as Error).message);
      if (precisaRelerOficial(conflito)) this.carregar();
      return { ok: false as const, conflito, erro: (e as Error).message };
    }
  }

  /** Qualquer informação chegando: realtime, outra aba, resposta atrasada. */
  receber(a: {
    clinicaId: string;
    userId: string;
    estado: EstadoManualPresenca | null;
    versao: number;
    seq?: number;
  }) {
    const res = aplicarAtualizacao(this.sincronia, { clinicaId: this.clinicaId, userId: this.userId }, a);
    this.sincronia = res.estado;
    if (res.aceita && this.controle.carregado) {
      this.controle = { ...this.controle, confirmado: res.estado.estado, salvando: null };
    }
    return res;
  }

  /** Eventos técnicos que a aba sofre. Nenhum deles grava presença. */
  inatividade() {}
  trocarDeAba() {}
  recuperarFoco() {}
  moverMouse() {}
  heartbeat() {
    this.srv.heartbeat(this.clinicaId, this.userId);
  }
  perderConexao() {}
  reconectar() {
    this.carregar();
  }
}

const CLINICA = "clinica-teste";
const OUTRA_CLINICA = "outra-clinica";
const ANA = "atendente-ana";
const BRUNO = "atendente-bruno";

let srv: ServidorPresenca;

beforeEach(() => {
  srv = new ServidorPresenca();
  srv.semear(CLINICA, ANA, {});
  srv.semear(CLINICA, BRUNO, {});
});

describe("FASE 6 — cenários integrados de presença manual", () => {
  test("1) Online + ficar inativo: continua Online e continua recebendo", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("ONLINE");
    for (let i = 0; i < 20; i++) {
      aba.inatividade();
      aba.heartbeat();
    }
    aba.carregar();
    expect(srv.ler(CLINICA, ANA).estadoManual).toBe("ONLINE");
    expect(recebeNovasConversas(aba.controle)).toBe(true);
    expect(srv.atribuir(CLINICA, "c1", [ANA])).toBe(ANA);
  });

  test("2) Online + trocar de aba: nada muda", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("ONLINE");
    aba.trocarDeAba();
    aba.heartbeat();
    expect(aba.controle.confirmado).toBe("ONLINE");
    expect(srv.ler(CLINICA, ANA).estadoManual).toBe("ONLINE");
  });

  test("3) Online, fechar a página e abrir de novo: volta Online", () => {
    const antes = new Aba(srv, CLINICA, ANA);
    antes.carregar();
    antes.escolher("ONLINE");
    // fechar = simplesmente descartar a aba; nada é gravado no fechamento
    const depois = new Aba(srv, CLINICA, ANA);
    depois.carregar();
    expect(depois.controle.confirmado).toBe("ONLINE");
    expect(precisaEscolher(depois.controle)).toBe(false);
  });

  test("4) Offline + mexer no mouse/teclado: continua Offline e não recebe", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("OFFLINE");
    aba.moverMouse();
    aba.recuperarFoco();
    aba.heartbeat();
    expect(srv.ler(CLINICA, ANA).estadoManual).toBe("OFFLINE");
    expect(recebeNovasConversas(aba.controle)).toBe(false);
    expect(srv.atribuir(CLINICA, "c1", [ANA])).toBeNull();
  });

  test("5) Pausa + recuperar o foco: continua Em pausa", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("PAUSA");
    aba.recuperarFoco();
    aba.heartbeat();
    expect(srv.ler(CLINICA, ANA).estadoManual).toBe("PAUSA");
    expect(textoSituacao(aba.controle)).toBe("Você está Em pausa");
    expect(srv.atribuir(CLINICA, "c1", [ANA])).toBeNull();
  });

  test("6) Recarregar em cada um dos três estados preserva a escolha", () => {
    for (const estado of ["ONLINE", "OFFLINE", "PAUSA"] as EstadoManualPresenca[]) {
      const aba = new Aba(srv, CLINICA, ANA);
      aba.carregar();
      aba.escolher(estado);
      const recarregada = new Aba(srv, CLINICA, ANA);
      recarregada.carregar();
      expect(recarregada.controle.confirmado).toBe(estado);
      expect(opcaoSelecionada(recarregada.controle, estado)).toBe(true);
    }
  });

  test("7) Perder conexão e reconectar em cada estado preserva a escolha", () => {
    for (const estado of ["ONLINE", "OFFLINE", "PAUSA"] as EstadoManualPresenca[]) {
      const aba = new Aba(srv, CLINICA, ANA);
      aba.carregar();
      aba.escolher(estado);
      aba.perderConexao();
      aba.reconectar();
      expect(aba.controle.confirmado).toBe(estado);
      expect(srv.ler(CLINICA, ANA).estadoManual).toBe(estado);
      // reconectar não é escolha: a versão não avança
      expect(aba.sincronia.versao).toBe(srv.ler(CLINICA, ANA).versao);
    }
  });

  test("8) Duas abas: Pausa numa passa a valer na outra", () => {
    const a1 = new Aba(srv, CLINICA, ANA);
    const a2 = new Aba(srv, CLINICA, ANA);
    a1.carregar();
    a2.carregar();
    a1.escolher("ONLINE");
    a2.receber({ clinicaId: CLINICA, userId: ANA, estado: "ONLINE", versao: 1 });
    const r = a1.escolher("PAUSA");
    a2.receber({ clinicaId: CLINICA, userId: ANA, estado: "PAUSA", versao: r.ok ? r.versao : 0 });
    expect(a2.controle.confirmado).toBe("PAUSA");
    expect(recebeNovasConversas(a2.controle)).toBe(false);
  });

  test("9) Heartbeat e resposta de consulta atrasados não restauram Online", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("ONLINE"); // versão 1
    aba.escolher("PAUSA"); // versão 2
    aba.heartbeat();
    const atrasada = aba.receber({ clinicaId: CLINICA, userId: ANA, estado: "ONLINE", versao: 1 });
    expect(atrasada.aceita).toBe(false);
    expect(aba.controle.confirmado).toBe("PAUSA");
    expect(srv.ler(CLINICA, ANA).estadoManual).toBe("PAUSA");
  });

  test("10) Falha ao salvar preserva o estado confirmado e permite tentar de novo", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("ONLINE");
    srv.falharProxima = true;
    const falhou = aba.escolher("PAUSA");
    expect(falhou.ok).toBe(false);
    expect(aba.controle.confirmado).toBe("ONLINE");
    expect(aba.controle.erro).toContain("Falha de rede");
    expect(opcaoDesabilitada(aba.controle)).toBe(false);
    const retry = aba.escolher("PAUSA");
    expect(retry.ok).toBe(true);
    expect(aba.controle.confirmado).toBe("PAUSA");
  });

  test("11) Não é possível alterar a presença de outro atendente", () => {
    const abaBruno = new Aba(srv, CLINICA, BRUNO);
    abaBruno.carregar();
    abaBruno.escolher("ONLINE");
    expect(() =>
      srv.definir({ clinicaId: CLINICA, userId: BRUNO, autor: ANA, estado: "OFFLINE" }),
    ).toThrow("outro atendente");
    expect(srv.ler(CLINICA, BRUNO).estadoManual).toBe("ONLINE");
    expect(srv.ler(CLINICA, BRUNO).por).toBe(BRUNO);
  });

  test("12) Distribuição: Online recebe; Offline e Pausa não", () => {
    const ana = new Aba(srv, CLINICA, ANA);
    const bruno = new Aba(srv, CLINICA, BRUNO);
    ana.carregar();
    bruno.carregar();
    ana.escolher("ONLINE");
    bruno.escolher("PAUSA");
    srv.conversas = [{ id: "c1", responsavel: null }];
    expect(srv.atribuir(CLINICA, "c1", [BRUNO, ANA])).toBe(ANA);
    ana.escolher("OFFLINE");
    srv.conversas.push({ id: "c2", responsavel: null });
    expect(srv.atribuir(CLINICA, "c2", [ANA, BRUNO])).toBeNull();
    expect(srv.conversas.find((c) => c.id === "c2")?.responsavel).toBeNull();
  });

  test("13) Disputa entre mudança de presença e atribuição: decisão usa o estado final", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("ONLINE");
    srv.conversas = [{ id: "c1", responsavel: null }];
    // a presença muda ANTES da atribuição efetivar (a atribuição revalida)
    aba.escolher("PAUSA");
    expect(srv.atribuir(CLINICA, "c1", [ANA])).toBeNull();
    // e o caminho inverso: voltar a Online torna elegível de novo
    aba.escolher("ONLINE");
    expect(srv.atribuir(CLINICA, "c1", [ANA])).toBe(ANA);
  });

  test("14) Mudar de presença preserva as conversas em andamento", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("ONLINE");
    srv.conversas = [
      { id: "c1", responsavel: ANA },
      { id: "c2", responsavel: ANA },
    ];
    aba.escolher("PAUSA");
    aba.escolher("OFFLINE");
    expect(srv.conversas.map((c) => c.responsavel)).toEqual([ANA, ANA]);
    expect(srv.conversas.length).toBe(2);
  });

  test("15) Registro antigo sem escolha manual: pede escolha e não recebe", () => {
    srv.semear(CLINICA, ANA, { estadoManual: null, versao: 7, por: null });
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    expect(precisaEscolherPresenca(srv.ler(CLINICA, ANA).estadoManual)).toBe(true);
    expect(precisaEscolher(aba.controle)).toBe(true);
    expect(textoSituacao(aba.controle)).toBe("Escolha sua disponibilidade");
    expect(recebeNovasConversas(aba.controle)).toBe(false);
    expect(srv.atribuir(CLINICA, "c1", [ANA])).toBeNull();
    // e o heartbeat não transforma isso em Online
    aba.heartbeat();
    aba.carregar();
    expect(precisaEscolher(aba.controle)).toBe(true);
  });

  test("escopo: presença de outra clínica não contamina a tela atual", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    aba.escolher("PAUSA");
    const res = aba.receber({
      clinicaId: OUTRA_CLINICA,
      userId: ANA,
      estado: "ONLINE",
      versao: 99,
    });
    expect(res.aceita).toBe(false);
    expect(aba.controle.confirmado).toBe("PAUSA");
  });

  test("coerência: tela, servidor e distribuição contam a mesma história", () => {
    const aba = new Aba(srv, CLINICA, ANA);
    aba.carregar();
    for (const estado of ["ONLINE", "PAUSA", "OFFLINE", "ONLINE"] as EstadoManualPresenca[]) {
      aba.escolher(estado);
      const persistido = srv.ler(CLINICA, ANA).estadoManual;
      const elegivel = poolElegivel([
        { userId: ANA, temTelefonia: true, status: persistido },
      ]).length;
      expect(aba.controle.confirmado).toBe(estado);
      expect(persistido).toBe(estado);
      expect(elegivel === 1).toBe(estado === "ONLINE");
    }
  });
});
