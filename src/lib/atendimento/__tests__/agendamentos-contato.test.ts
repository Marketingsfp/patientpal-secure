import { describe, expect, it } from "bun:test";
import { filtrarAgendamentosContato } from "../agendamentos-contato";
import { dataClinicaDe, janelaDiaClinica } from "@/lib/date-utils";
import { classificarEvento } from "../realtime-roteador";

const ag = (id: string, inicio: string | null, status = "agendado") => ({ id, inicio, status });
const ids = (linhas: { id: string }[]) => linhas.map((a) => a.id);

describe("agendamentos atuais no painel de contato", () => {
  it("em 19/09 oculta 18/09 e cancelados, conservando hoje inteiro e datas futuras", () => {
    const linhas = [
      ag("ontem", "2026-09-18T08:00:00-03:00"),
      ag("hoje cedo", "2026-09-19T08:00:00-03:00"),
      ag("amanha", "2026-09-20T11:00:00-03:00", "confirmado"),
      ag("cancelado hoje", "2026-09-19T11:00:00-03:00", "cancelado"),
      ag("cancelado futuro", "2026-10-20T11:00:00-03:00", "cancelado"),
    ];
    expect(ids(filtrarAgendamentosContato(linhas, "2026-09-19"))).toEqual(["hoje cedo", "amanha"]);
    expect(linhas).toHaveLength(5); // Não remove nem altera o histórico original.
    expect(linhas[3].status).toBe("cancelado");
  });

  it("a data muda à meia-noite da clínica, não à meia-noite UTC", () => {
    const linhas = [ag("fim 18", "2026-09-19T02:59:59Z"), ag("inicio 19", "2026-09-19T03:00:00Z")];
    expect(ids(filtrarAgendamentosContato(linhas, dataClinicaDe("2026-09-19T02:59:59Z")!))).toEqual(
      ["fim 18", "inicio 19"],
    );
    expect(ids(filtrarAgendamentosContato(linhas, dataClinicaDe("2026-09-19T03:00:00Z")!))).toEqual(
      ["inicio 19"],
    );
    expect(janelaDiaClinica("2026-09-19").inicio).toBe("2026-09-19T03:00:00.000Z");
  });

  it("recusa datas ausentes ou inválidas e aceita lista vazia", () => {
    expect(
      filtrarAgendamentosContato([ag("sem data", null), ag("invalido", "invalido")], "2026-09-19"),
    ).toEqual([]);
    expect(filtrarAgendamentosContato([], "2026-09-19")).toEqual([]);
  });

  it("cancelamento do contato aberto atualiza só o painel, sem trocar nem recarregar o chat", () => {
    const ctx = { clinicaId: "clinica", conversaAberta: "chat", pacienteAberto: "paciente" };
    const ev = {
      table: "agendamentos",
      eventType: "UPDATE",
      new: { clinica_id: "clinica", paciente_id: "paciente", status: "cancelado" },
    };
    expect(classificarEvento(ev, ctx)).toEqual(["contato"]);
    expect(classificarEvento({ ...ev, new: { ...ev.new, paciente_id: "outro" } }, ctx)).toEqual([]);
    expect(classificarEvento({ ...ev, new: { ...ev.new, clinica_id: "outra" } }, ctx)).toEqual([]);
    expect(classificarEvento(ev, { ...ctx, pacienteAberto: null })).toEqual([]);
    expect(classificarEvento(ev, { ...ctx, conversaAberta: null })).toEqual([]);
  });

  it("exclusão e mudança de paciente revalidam um agendamento já exibido", () => {
    const ctx = {
      clinicaId: "clinica",
      conversaAberta: "chat",
      pacienteAberto: "paciente",
      agendamentosAbertos: ["ag-1"],
    };
    expect(
      classificarEvento({ table: "agendamentos", eventType: "DELETE", old: { id: "ag-1" } }, ctx),
    ).toEqual(["contato"]);
    expect(
      classificarEvento(
        { table: "agendamentos", eventType: "UPDATE", new: { id: "ag-1", paciente_id: "outro" } },
        ctx,
      ),
    ).toEqual(["contato"]);
  });
});
