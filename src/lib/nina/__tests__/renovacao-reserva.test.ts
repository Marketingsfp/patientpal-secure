import { describe, expect, it } from "bun:test";
import { criarRenovacaoReserva } from "../renovacao-reserva";
const esvaziarFila = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
describe("heartbeat da reserva de um turno Nina", () => {
  it("volta a renovar depois de erro transitório sem liberar a reserva de trabalho vivo", async () => {
    let tick = () => {},
      chamadas = 0,
      cancelamentos = 0;
    const controle = criarRenovacaoReserva(
      async () => {
        chamadas++;
        if (chamadas === 1) throw new Error("DB temporariamente indisponível");
        return true;
      },
      {
        agendar: (cb) => {
          tick = cb;
          return 1;
        },
        cancelar: () => {
          cancelamentos++;
        },
      },
    );
    tick();
    await esvaziarFila();
    expect(controle.valida()).toBe(false);
    tick();
    await esvaziarFila();
    expect(controle.valida()).toBe(true);
    expect(chamadas).toBe(2);
    expect(cancelamentos).toBe(0);
    await controle.parar();
    tick();
    await esvaziarFila();
    expect(chamadas).toBe(2);
    expect(cancelamentos).toBe(1);
  });
  it("liberação aguarda a renovação iniciada e não deixa tick atrasado renovar depois", async () => {
    let tick = () => {},
      liberar = () => {},
      chamadas = 0,
      terminou = false;
    const pendente = new Promise<boolean>((resolve) => {
      liberar = () => resolve(true);
    });
    const controle = criarRenovacaoReserva(
      async () => {
        chamadas++;
        return pendente;
      },
      {
        agendar: (cb) => {
          tick = cb;
          return 1;
        },
        cancelar: () => {},
      },
    );
    tick();
    await esvaziarFila();
    tick();
    const fim = controle.parar().then(() => {
      terminou = true;
    });
    await esvaziarFila();
    expect(terminou).toBe(false);
    expect(chamadas).toBe(1);
    liberar();
    await fim;
    expect(terminou).toBe(true);
    expect(chamadas).toBe(1);
  });
});
