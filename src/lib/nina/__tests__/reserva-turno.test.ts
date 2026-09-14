import { describe, expect, it } from "bun:test";
import { criarGuardiaoReservaTurno, ErroReservaTurnoPerdida } from "../reserva-turno";

describe("guarda comum do núcleo contra perda da reserva do turno", () => {
  it("confere cada operação e finalização, sem executar o efeito quando a reserva foi perdida", async () => {
    let valido = true;
    let leituras = 0;
    let efeitos = 0;
    const conferir = criarGuardiaoReservaTurno(async () => {
      leituras++;
      return valido;
    });
    const executar = async () => {
      await conferir();
      efeitos++;
    };
    await executar();
    valido = false;
    await expect(executar()).rejects.toBeInstanceOf(ErroReservaTurnoPerdida);
    expect(efeitos).toBe(1);
    expect(leituras).toBe(2);
  });

  it("catch da ferramenta não autoriza enviar fallback nem recuperar o mesmo turno depois", async () => {
    let leituras = 0;
    let envios = 0;
    const conferir = criarGuardiaoReservaTurno(async () => ++leituras !== 1);
    try {
      await conferir();
    } catch {
      /* simula catch que produziria fallback */
    }
    await expect(
      (async () => {
        await conferir();
        envios++;
      })(),
    ).rejects.toHaveProperty("codigo", "NINA_RESERVA_TURNO_PERDIDA");
    expect(envios).toBe(0);
    expect(leituras).toBe(1);
  });

  it("falha de rede na validação interrompe e permanece interrompida", async () => {
    let chamadas = 0;
    const conferir = criarGuardiaoReservaTurno(async () => {
      chamadas++;
      throw new Error("leitura indisponível");
    });
    await expect(conferir()).rejects.toBeInstanceOf(ErroReservaTurnoPerdida);
    await expect(conferir()).rejects.toBeInstanceOf(ErroReservaTurnoPerdida);
    expect(chamadas).toBe(1);
  });

  it("não interfere em chamadores internos sem contrato de lote", async () => {
    expect(await criarGuardiaoReservaTurno()()).toBe(true);
  });

  it("validação concorrente positiva não desfaz perda já confirmada", async () => {
    let concluir!: (valor: boolean) => void;
    let chamadas = 0;
    const conferir = criarGuardiaoReservaTurno(async () => {
      if (++chamadas === 1)
        return new Promise<boolean>((resolve) => {
          concluir = resolve;
        });
      return false;
    });
    const primeira = conferir();
    await expect(conferir()).rejects.toBeInstanceOf(ErroReservaTurnoPerdida);
    concluir(true);
    await expect(primeira).rejects.toBeInstanceOf(ErroReservaTurnoPerdida);
  });
});
