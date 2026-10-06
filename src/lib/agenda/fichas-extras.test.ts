import { describe, expect, it } from "bun:test";
import { fichasExistentes, posicoesFichasExtras, type LinhaExistente } from "./fichas-extras";
import { numerarFichas } from "./ficha-numero";

const DIA = "2026-10-07";
const ms = (hhmmss: string) => new Date(`${DIA}T${hhmmss}`).getTime();
// Grade 13:30–17:30 de 10 em 10 → 24 fichas, a última às 17:20.
const grade = (): LinhaExistente[] =>
  Array.from({ length: 24 }, (_, i) => ({ ms: ms("13:30:00") + i * 600000, travada: false }));

describe("posicoesFichasExtras", () => {
  it("entra 1 segundo depois da última ficha do turno e termina no fim do turno", () => {
    const r = posicoesFichasExtras({
      diaIso: DIA,
      fimTurno: "17:30",
      linhas: grade(),
      quantidade: 3,
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.fichas.map((f) => f.inicio.getTime())).toEqual([
      ms("17:20:01"),
      ms("17:20:02"),
      ms("17:20:03"),
    ]);
    expect(r.fichas.every((f) => f.fim.getTime() === ms("17:30:00"))).toBe(true);
    expect(r.naoCouberam).toBe(0);
  });

  it("não muda o número de nenhuma ficha existente e continua a sequência", () => {
    const linhas = grade();
    const r = posicoesFichasExtras({ diaIso: DIA, fimTurno: "17:30", linhas, quantidade: 20 });
    if (!r.ok) throw new Error(r.motivo);
    const todas = [
      ...linhas.map((l, i) => ({
        id: `g${i}`,
        inicio: new Date(l.ms).toISOString(),
        medico_id: "m",
        agenda_id: "a",
      })),
      ...r.fichas.map((f, i) => ({
        id: `e${i}`,
        inicio: f.inicio.toISOString(),
        medico_id: "m",
        agenda_id: "a",
      })),
    ];
    const n = numerarFichas(todas);
    linhas.forEach((_, i) => expect(n.get(`g${i}`)).toBe(i + 1));
    r.fichas.forEach((_, i) => expect(n.get(`e${i}`)).toBe(25 + i));
  });

  it("encaixe depois do fim do turno vai para o fim da sequência", () => {
    const linhas = [...grade(), { ms: ms("19:00:00"), travada: false }];
    const r = posicoesFichasExtras({ diaIso: DIA, fimTurno: "17:30", linhas, quantidade: 2 });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.fichas[0].inicio.getTime()).toBe(ms("17:20:01"));
  });

  it("não mexe quando o paciente de depois do turno já passou pela recepção", () => {
    const linhas = [...grade(), { ms: ms("19:00:00"), travada: true }];
    const r = posicoesFichasExtras({ diaIso: DIA, fimTurno: "17:30", linhas, quantidade: 2 });
    expect(r).toEqual({ ok: false, motivo: "paciente_na_recepcao" });
  });

  it("repetir soma depois das extras que já existem", () => {
    const linhas = [
      ...grade(),
      { ms: ms("17:20:01"), travada: false },
      { ms: ms("17:20:02"), travada: false },
    ];
    const r = posicoesFichasExtras({ diaIso: DIA, fimTurno: "17:30", linhas, quantidade: 1 });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.fichas[0].inicio.getTime()).toBe(ms("17:20:03"));
  });

  it("dia sem fichas no turno pede para gerar a agenda antes", () => {
    const r = posicoesFichasExtras({ diaIso: DIA, fimTurno: "17:30", linhas: [], quantidade: 5 });
    expect(r).toEqual({ ok: false, motivo: "dia_sem_fichas" });
  });

  it("nunca passa do fim do turno", () => {
    const linhas = [{ ms: ms("17:29:58"), travada: false }];
    const r = posicoesFichasExtras({ diaIso: DIA, fimTurno: "17:30", linhas, quantidade: 5 });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.fichas.length).toBe(1);
    expect(r.naoCouberam).toBe(4);
  });

  it("conta encaixe no mesmo instante como uma ficha só", () => {
    expect(
      fichasExistentes([
        { ms: 1, travada: false },
        { ms: 1, travada: false },
        { ms: 2, travada: false },
      ]),
    ).toBe(2);
  });
});
