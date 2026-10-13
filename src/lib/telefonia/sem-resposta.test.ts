import { describe, expect, it } from "bun:test";
import { linkWhatsApp, resumirSemResposta, type ChamadaBasica } from "./sem-resposta";

// Números fictícios.
let n = 0;
function lig(origem: string, inicio: string, atendida: boolean, direcao = "INCOMING"): ChamadaBasica {
  n++;
  return {
    externo_id: `p${n}`,
    inicio,
    direcao,
    situacao: atendida ? "ANSWERED" : "UNKNOWN",
    origem_numero: origem,
    duracao_seg: 30,
  };
}

describe("resumirSemResposta", () => {
  const A = "+5527999990001"; // nunca atendido, 3 tentativas
  const B = "+5527999990002"; // conseguiu na segunda tentativa
  const C = "2733330003"; // 10 dígitos, atendido na primeira
  const dados = [
    lig(A, "2026-10-06T12:00:00Z", false),
    lig(A, "2026-10-06T13:00:00Z", false),
    lig(A, "2026-10-07T12:00:00Z", false),
    lig(B, "2026-10-06T12:10:00Z", false),
    lig(B, "2026-10-06T12:20:00Z", true),
    lig(C, "2026-10-06T15:00:00Z", true),
    lig("1001", "2026-10-06T16:00:00Z", false),
    lig("+5527999990009", "2026-10-06T16:00:00Z", true, "OUTBOUND"),
  ];
  const r = resumirSemResposta(dados);

  it("conta só as recebidas", () => {
    expect(r.recebidas).toBe(7);
    expect(r.atendidas).toBe(2);
    expect(r.naoAtendidas).toBe(5);
  });

  it("quem nunca foi atendido fica em cima, com as tentativas somadas", () => {
    expect(r.grupos[0].e164).toBe(A);
    expect(r.grupos[0].tentativas).toBe(3);
    expect(r.grupos[0].algumaAtendida).toBe(false);
    expect(r.grupos[0].primeira).toBe("2026-10-06T12:00:00Z");
    expect(r.grupos[0].ultima).toBe("2026-10-07T12:00:00Z");
  });

  it("quem conseguiu na segunda tentativa conta como atendido", () => {
    const b = r.grupos.find((g) => g.e164 === B)!;
    expect(b.tentativas).toBe(2);
    expect(b.atendidas).toBe(1);
    expect(b.algumaAtendida).toBe(true);
  });

  it("10 dígitos sem DDI agrupa como número brasileiro", () => {
    expect(r.grupos.find((g) => g.e164 === "+552733330003")?.algumaAtendida).toBe(true);
  });

  it("ramal interno é marcado, não entra em 'nunca falaram' e não tem WhatsApp", () => {
    const ramal = r.grupos.find((g) => g.interno)!;
    expect(ramal.rotulo).toBe("1001");
    expect(linkWhatsApp(ramal)).toBeNull();
    expect(r.nuncaFalaram).toBe(1);
  });

  it("WhatsApp usa só o número", () => {
    expect(linkWhatsApp(r.grupos[0])).toBe("https://wa.me/5527999990001");
  });

  it("hora do dia em São Paulo", () => {
    // 12:00Z = 09h em São Paulo
    expect(r.porHora[9].naoAtendidas).toBe(3);
    expect(r.porHora[9].atendidas).toBe(1);
  });
});
