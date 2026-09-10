import { describe, expect, it } from "bun:test";
import { agendaAceitaTipos, posicionarEncaixe, type LinhaDoDia } from "./encaixe-posicao";
import { numerarFichas } from "./ficha-numero";

// Reproduz o Dr. João Hélio em 11/09/2026: CONSULTAS 09:30–17:00 (15 min) e
// EXAMES 09:40–17:00 (20 min), as duas cheias.
const CONS = "ag-consultas";
const EXAM = "ag-exames";
const iso = (hora: string) => new Date(`2026-09-11T${hora}:00-03:00`).toISOString();
const hh = (s: string) =>
  new Date(s).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

function grade(agenda: string, de: string, ate: string, passoMin: number): LinhaDoDia[] {
  const out: LinhaDoDia[] = [];
  for (
    let t = new Date(iso(de)).getTime();
    t < new Date(iso(ate)).getTime();
    t += passoMin * 60000
  ) {
    out.push({
      inicio: new Date(t).toISOString(),
      fim: new Date(t + passoMin * 60000).toISOString(),
      agenda_id: agenda,
      paciente_nome: "PACIENTE",
    });
  }
  return out;
}

const DIA = [...grade(CONS, "09:30", "17:00", 15), ...grade(EXAM, "09:40", "17:00", 20)];
const AGENDAS = [
  { id: CONS, nome: "CONSULTAS", ativo: true, tipos: ["consulta", "exame", "procedimento"] },
  { id: EXAM, nome: "EXAMES", ativo: true, tipos: ["consulta", "exame", "procedimento"] },
];

const base = {
  linhasDoDia: DIA,
  agendasDoMedico: AGENDAS,
  agendaPreferidaId: null as string | null,
  tiposDosProcedimentos: ["consulta"],
  formatarHora: hh,
};

describe("posicionarEncaixe — depois do fim da grade", () => {
  it("17:15 com a agenda CONSULTAS na tela: entra em CONSULTAS, no fim da fila", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("17:15"),
      fim: iso("17:30"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.agendaId).toBe(CONS);
    expect(r.modo).toBe("fim_da_fila");
    expect(r.inicio).toBe(iso("17:15"));
    expect(hh(r.fimDaAgenda!)).toBe("17:00");
  });

  it("17:00 em ponto (igual ao fim da última ficha) também é fim da fila", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("17:00"),
      fim: iso("17:15"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok && r.modo).toBe("fim_da_fila");
  });

  it("recebe o número seguinte ao último e não mexe em nenhuma ficha existente", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("17:15"),
      fim: iso("17:30"),
      agendaPreferidaId: CONS,
    });
    if (!r.ok) throw new Error(r.erro);
    const linhas = DIA.map((l, i) => ({ id: `l${i}`, medico_id: "m", ...l }));
    const antes = numerarFichas(linhas);
    const depois = numerarFichas([
      ...linhas,
      { id: "novo", medico_id: "m", inicio: r.inicio, agenda_id: r.agendaId, paciente_nome: "X" },
    ]);
    for (const [id, n] of antes) expect(depois.get(id)).toBe(n);
    expect(depois.get("novo")).toBe(31); // CONSULTAS tem 30 fichas (09:30–17:00)
  });

  it("sem agenda na tela e duas agendas mistas no dia: recusa com instrução, nunca grava órfão", () => {
    const r = posicionarEncaixe({ ...base, inicio: iso("17:15"), fim: iso("17:30") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("CONSULTAS, EXAMES");
    expect(r.erro).toContain('filtro "Agenda"');
  });

  it("sem agenda na tela, mas só uma agenda aceita o tipo do serviço: escolhe ela", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("17:15"),
      fim: iso("17:30"),
      agendasDoMedico: [
        { id: CONS, nome: "CONSULTAS", ativo: true, tipos: ["consulta"] },
        { id: EXAM, nome: "EXAMES", ativo: true, tipos: ["exame"] },
      ],
    });
    expect(r.ok && r.agendaId).toBe(CONS);
  });

  it("médico com uma agenda só: usa ela mesmo sem filtro", () => {
    const r = posicionarEncaixe({
      ...base,
      linhasDoDia: grade(CONS, "09:30", "17:00", 15),
      inicio: iso("17:15"),
      fim: iso("17:30"),
    });
    expect(r.ok && r.agendaId).toBe(CONS);
  });

  it("agenda preferida de OUTRO médico é ignorada", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("17:15"),
      fim: iso("17:30"),
      agendaPreferidaId: "agenda-de-outro-medico",
    });
    expect(r.ok).toBe(false);
  });
});

describe("posicionarEncaixe — em cima de uma ficha", () => {
  it("16:45 (última ficha, ocupada): divide a ficha", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("16:45"),
      fim: iso("17:00"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok && r.modo).toBe("sobre_ficha");
    expect(r.ok && r.inicio).toBe(iso("16:45"));
  });

  it("10:05, dentro da ficha das 10:00: grava às 10:00 para dividir o número", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("10:05"),
      fim: iso("10:20"),
      agendaPreferidaId: CONS,
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.modo).toBe("sobre_ficha");
    expect(r.inicio).toBe(iso("10:00"));
    expect(r.fim).toBe(iso("10:15"));
  });

  it("sem filtro, usa a agenda da ficha sobreposta (comportamento anterior)", () => {
    // 10:00 só existe como início de ficha em EXAMES (09:40 + 20 min); em
    // CONSULTAS cai dentro da ficha das 09:45. A primeira linha que cobre decide.
    const r = posicionarEncaixe({ ...base, inicio: iso("09:40"), fim: iso("10:00") });
    expect(r.ok && r.modo).toBe("sobre_ficha");
    expect(r.ok && r.agendaId).not.toBeNull();
  });
});

describe("posicionarEncaixe — horários que renumerariam fichas entregues", () => {
  it("09:00, antes do início da grade (09:30): recusa e diz a partir de quando pode", () => {
    const r = posicionarEncaixe({
      ...base,
      inicio: iso("09:00"),
      fim: iso("09:15"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("começa às 09:30");
    expect(r.erro).toContain("a partir das 17:00");
  });

  it("vão entre duas fichas (almoço): recusa", () => {
    const linhas = [...grade(CONS, "08:00", "12:00", 15), ...grade(CONS, "13:00", "17:00", 15)];
    const r = posicionarEncaixe({
      ...base,
      linhasDoDia: linhas,
      inicio: iso("12:30"),
      fim: iso("12:45"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("intervalo entre fichas");
  });

  it("segundo encaixe do fim do dia ANTES do primeiro (17:05 com um já às 17:15): recusa", () => {
    const linhas = [
      ...DIA,
      { inicio: iso("17:15"), fim: iso("17:30"), agenda_id: CONS, paciente_nome: "ENCAIXE" },
    ];
    const r = posicionarEncaixe({
      ...base,
      linhasDoDia: linhas,
      inicio: iso("17:05"),
      fim: iso("17:20"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok).toBe(false);
  });

  it("agenda sem nenhuma linha no dia: aceita no horário pedido", () => {
    const r = posicionarEncaixe({
      ...base,
      linhasDoDia: grade(EXAM, "09:40", "17:00", 20),
      inicio: iso("09:00"),
      fim: iso("09:15"),
      agendaPreferidaId: CONS,
    });
    expect(r.ok && r.agendaId).toBe(CONS);
    expect(r.ok && r.modo).toBe("fim_da_fila");
  });
});

describe("agendaAceitaTipos", () => {
  it("segue a regra 4b", () => {
    expect(agendaAceitaTipos(["consulta"], ["consulta"])).toBe(true);
    expect(agendaAceitaTipos(["consulta"], ["exame"])).toBe(false);
    expect(agendaAceitaTipos(["exame", "procedimento"], ["consulta"])).toBe(false);
    expect(agendaAceitaTipos(["exame", "procedimento"], ["exame"])).toBe(true);
    expect(agendaAceitaTipos(["consulta", "exame"], ["exame"])).toBe(true);
    expect(agendaAceitaTipos([], ["consulta"])).toBe(true);
  });
});
