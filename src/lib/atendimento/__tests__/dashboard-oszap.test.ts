import { describe, expect, it } from "bun:test";
import {
  periodoDashboard,
  resumirMensagensHumanas,
  resumirEncerramentosHumanos,
  resumirPrimeiraRespostaHumanas,
  type MensagemHumanaDashboard,
} from "../dashboard-oszap";
import {
  carregarResumoDashboardOsZap,
  carregarFilaHumanaDashboard,
} from "../dashboard-oszap.server";

const mensagem = (patch: Partial<MensagemHumanaDashboard> = {}): MensagemHumanaDashboard => ({
  created_at: "2026-10-03T03:00:00Z",
  conversa_id: "real",
  enviada_por_user_id: "ana",
  enviada_por: "humano",
  status: "sent",
  ...patch,
});
describe("Dashboard de atendimento humano", () => {
  it("recorta dias civis com virada de mês/ano", () => {
    expect(periodoDashboard(7, "2026-01-03")).toEqual({ de: "2025-12-28", ate: "2026-01-03" });
    expect(periodoDashboard(30, "2026-10-03").de).toBe("2026-09-04");
  });
  it("exclui IA e avisos automáticos, distingue envio de falha e preserva autoria", () => {
    const r = resumirMensagensHumanas([
      mensagem(),
      mensagem({ status: "read" }),
      mensagem({ status: "failed" }),
      mensagem({ status: "pending" }),
      mensagem({ enviada_por: "nina", status: "sent" }),
      mensagem({ enviada_por: "sistema" }),
      mensagem({ status: "system" }),
      mensagem({ enviada_por_user_id: null, enviada_por: "humano" }),
    ]);
    expect(r.enviadas).toBe(3);
    expect(r.falhas).toBe(1);
    expect(r.outrosEstados).toBe(1);
    expect(r.porPessoa).toEqual([{ id: "ana", total: 2 }]);
    expect(r.semAutora).toBe(1);
    expect(r.conversasRespondidas).toBe(1);
    expect(r.porHora[0]).toBe(3);
  });
  it("usa o dia de Brasília ao agrupar mensagens próximas à meia-noite UTC", () => {
    const r = resumirMensagensHumanas([mensagem({ created_at: "2026-10-03T01:00:00Z" })]);
    expect(r.porDia).toEqual([{ dia: "2026-10-02", total: 1 }]);
    expect(r.porHora[22]).toBe(1);
  });
  it("contabiliza quem encerrou, incluindo supervisor, sem atribuir autoria ausente", () => {
    const r = resumirEncerramentosHumanos([
      {
        resolved_by: "supervisor",
        resolved_at: "2026-10-03T04:00:00Z",
        handoff_em: "2026-10-03T03:00:00Z",
        assigned_at: null,
      },
      {
        resolved_by: null,
        resolved_at: "2026-10-03T04:00:00Z",
        handoff_em: null,
        assigned_at: null,
      },
    ]);
    expect(r.total).toBe(2);
    expect(r.porPessoa).toEqual([{ id: "supervisor", total: 1 }]);
    expect(r.semAutoria).toBe(1);
    expect(r.duracoesMedidas).toBe(1);
    expect(r.duracaoMediaSeg).toBe(3600);
  });
  it("ausência de medição não vira tempo zero", () => {
    expect(resumirPrimeiraRespostaHumanas([null, -1, NaN])).toEqual({ mediaSeg: null, medidas: 0 });
    expect(resumirPrimeiraRespostaHumanas([0, 20, null])).toEqual({ mediaSeg: 10, medidas: 2 });
    expect(resumirEncerramentosHumanos([]).duracaoMediaSeg).toBeNull();
  });
  it("barra acesso sem gestão antes de ler qualquer tabela", async () => {
    let leituras = 0;
    const db = {
      rpc: async () => ({ data: false, error: null }),
      from() {
        leituras++;
        throw Error("leitura indevida");
      },
    };
    await expect(
      carregarResumoDashboardOsZap(db as any, "telefonia", "clinica", 7),
    ).rejects.toThrow("administração e supervisão");
    expect(leituras).toBe(0);
  });
  it("backend isola a clínica/testes, pagina mensagens e mantém erro parcial indisponível", async () => {
    const consultas: {
      tabela: string;
      campos: string;
      filtros: [string, unknown][];
      de: number;
    }[] = [];
    const db = {
      rpc: async () => ({ data: true, error: null }),
      from(tabela: string) {
        const c = { tabela, campos: "", filtros: [] as [string, unknown][], de: 0 };
        consultas.push(c);
        let head = false;
        const q: any = {
          select(campos: string, opts?: { head?: boolean }) {
            c.campos = campos;
            head = !!opts?.head;
            return q;
          },
          eq(k: string, v: unknown) {
            c.filtros.push([k, v]);
            return q;
          },
          in(k: string, v: unknown) {
            c.filtros.push([k, v]);
            return q;
          },
          or(v: string) {
            c.filtros.push(["or", v]);
            return q;
          },
          neq() {
            return q;
          },
          not() {
            return q;
          },
          gte() {
            return q;
          },
          lt() {
            return q;
          },
          order() {
            return q;
          },
          range(de: number) {
            c.de = de;
            return q;
          },
          then(resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) {
            if (tabela === "atend_transferencias")
              return Promise.resolve({ data: null, error: { message: "indisponível" } }).then(
                resolve,
                reject,
              );
            let data: unknown = [];
            if (tabela === "whatsapp_mensagens")
              data =
                c.de === 0
                  ? Array.from({ length: 1000 }, () => mensagem())
                  : [mensagem({ enviada_por_user_id: "bia" })];
            if (tabela === "atend_conversas" && c.campos.includes("resolved_by"))
              data = [
                {
                  resolved_by: "supervisor",
                  resolved_at: "2026-10-03T04:00:00Z",
                  handoff_em: "2026-10-03T03:00:00Z",
                  assigned_at: null,
                },
              ];
            if (tabela === "profiles")
              data = [
                { id: "ana", nome: "Ana" },
                { id: "bia", nome: "Bia" },
                { id: "supervisor", nome: "Supervisor" },
              ];
            return Promise.resolve({ data, error: null, count: head ? 24 : null }).then(
              resolve,
              reject,
            );
          },
        };
        return q;
      },
    };
    const r = await carregarResumoDashboardOsZap(db as any, "gestor", "clinica", 7);
    expect(r.mensagens?.enviadas).toBe(1001);
    expect(r.mensagens?.parcial).toBe(false);
    expect(r.transferencias).toBeNull();
    expect(r.avisos).toContain("Transferências manuais: não foi possível consultar.");
    expect(r.pessoas?.find((p) => p.id === "supervisor")?.encerradas).toBe(1);
    for (const c of consultas) {
      expect(c.tabela).not.toMatch(/^nina_/);
      expect(c.campos).not.toMatch(/body|conteudo|token|telefone|contato_nome/);
      if (c.tabela !== "profiles") expect(c.filtros).toContainEqual(["clinica_id", "clinica"]);
      if (["atend_conversas", "whatsapp_mensagens"].includes(c.tabela))
        expect(c.filtros).toContainEqual(["is_teste", false]);
    }
    expect(consultas.find((c) => c.tabela === "whatsapp_mensagens")?.filtros).toContainEqual([
      "direction",
      "out",
    ]);
  });
  it("fila conta apenas encerramentos com autor humano e não herda totais automáticos da TV", async () => {
    let falharEncerramentos = false;
    const consultas: { tabela: string; campos: string; filtros: [string, unknown][] }[] = [];
    const db = {
      rpc: async (nome: string) => ({
        data: nome === "can_manage_clinica" ? true : [],
        error: null,
      }),
      from(tabela: string) {
        const c = { tabela, campos: "", filtros: [] as [string, unknown][] };
        consultas.push(c);
        const q: any = {
          select(campos: string) {
            c.campos = campos;
            return q;
          },
          eq(k: string, v: unknown) {
            c.filtros.push([k, v]);
            return q;
          },
          not(k: string, op: string, v: unknown) {
            c.filtros.push([k, [op, v]]);
            return q;
          },
          in() {
            return q;
          },
          neq() {
            return q;
          },
          gte() {
            return q;
          },
          lt() {
            return q;
          },
          gt() {
            return q;
          },
          order() {
            return q;
          },
          range() {
            return q;
          },
          limit() {
            return q;
          },
          then(resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) {
            let data: unknown[] = [];
            let error: { message: string } | null = null;
            if (tabela === "clinica_memberships") data = [{ user_id: "ana", role: "telefonia" }];
            if (tabela === "atend_agente_presenca")
              data = [{ user_id: "ana", estado_manual: "ONLINE", estado_manual_versao: 1 }];
            if (tabela === "profiles") data = [{ id: "ana", nome: "Ana" }];
            if (tabela === "atend_conversas") {
              if (c.campos === "id, atribuida_user_id, owner_type")
                data = [{ id: "real", atribuida_user_id: "ana", owner_type: "HUMAN" }];
              else if (c.campos === "resolved_by")
                data = [{ resolved_by: "ana" }, { resolved_by: null }];
              else if (c.campos.includes("resolved_at")) {
                data = [
                  {
                    resolved_by: "ana",
                    resolved_at: "2026-10-03T12:00:00Z",
                    handoff_em: null,
                    assigned_at: null,
                  },
                ];
                if (falharEncerramentos) error = { message: "indisponível" };
              } else if (c.campos === "departamento_id, atribuida_user_id")
                data = [{ departamento_id: null, atribuida_user_id: "ana" }];
            }
            return Promise.resolve({ data, error, count: 0 }).then(resolve, reject);
          },
        };
        return q;
      },
    };
    const r = await carregarFilaHumanaDashboard(db as any, db as any, "gestor", "clinica");
    expect(r.emAndamento).toBe(1);
    expect(r.resolvidasHoje).toBe(1);
    expect(r.atendentes[0].resolvidasHoje).toBe(1);
    expect(r).not.toHaveProperty("respostasHumanasHoje");
    expect(r).not.toHaveProperty("comNina");
    const encerramentos = consultas.find((c) => c.campos.includes("resolved_at"))!;
    expect(encerramentos.filtros).toContainEqual(["clinica_id", "clinica"]);
    expect(encerramentos.filtros).toContainEqual(["is_teste", false]);
    expect(encerramentos.filtros).toContainEqual(["resolved_by", ["is", null]]);
    falharEncerramentos = true;
    const falha = await carregarFilaHumanaDashboard(db as any, db as any, "gestor", "clinica");
    expect(falha.emAndamento).toBe(1);
    expect(falha.resolvidasHoje).toBeNull();
    expect(falha.atendentes[0].resolvidasHoje).toBeNull();
  });
});
