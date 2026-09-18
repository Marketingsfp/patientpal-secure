import { describe, expect, it } from "bun:test";
import { criarRelogioPausa } from "../relogio-pausa";
import { formatarTempoPausa } from "../cronometro-pausa";

describe("relógio compartilhado da pausa", () => {
  it("sidebar e Central mostram o mesmo segundo mesmo abrindo a Central depois", () => {
    const inicio = "2026-09-17T16:00:00Z";
    let agora = Date.parse(inicio) + 66_000;
    let tick = () => {};
    let iniciados = 0;
    const relogio = criarRelogioPausa({
      agora: () => agora,
      iniciar: (cb) => {
        tick = cb;
        iniciados++;
        return () => {};
      },
    });
    let sidebar = "";
    let central = "";
    const tirarSidebar = relogio.assinar(() => {
      sidebar = formatarTempoPausa(inicio, relogio.ler());
    });
    agora += 600;
    const tirarCentral = relogio.assinar(() => {
      central = formatarTempoPausa(inicio, relogio.ler());
    });
    central = formatarTempoPausa(inicio, relogio.ler());
    expect(central).toBe(sidebar);
    expect(central).toBe("00:01:06");
    agora += 1000;
    tick();
    expect(central).toBe("00:01:07");
    expect(sidebar).toBe(central);
    // Retorno após aba suspensa: calcula o tempo real, sem contar ticks perdidos.
    agora += 3_600_000;
    tick();
    expect(central).toBe("01:01:07");
    expect(sidebar).toBe(central);
    expect(iniciados).toBe(1);
    tirarCentral();
    tirarSidebar();
  });

  it("fechar a Central mantém o relógio da sidebar e desmontar o último remove o intervalo", () => {
    let agora = 1000;
    let parados = 0;
    let iniciados = 0;
    const relogio = criarRelogioPausa({
      agora: () => agora,
      iniciar: () => {
        iniciados++;
        return () => {
          parados++;
        };
      },
    });
    const tirarSidebar = relogio.assinar(() => {});
    const tirarCentral = relogio.assinar(() => {});
    tirarCentral();
    expect(parados).toBe(0);
    tirarSidebar();
    expect(parados).toBe(1);
    agora = 99_000;
    const tirarReaberto = relogio.assinar(() => {});
    expect(relogio.ler()).toBe(99_000);
    expect(iniciados).toBe(2);
    tirarReaberto();
    expect(parados).toBe(2);
  });
});
