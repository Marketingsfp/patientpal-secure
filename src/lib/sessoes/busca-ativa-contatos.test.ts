import { describe, expect, it } from "bun:test";
import {
  contatosDoPaciente,
  ehResultadoContato,
  formatarCpf,
  formatarTelefone,
  linkWhatsapp,
  mensagemDeRetorno,
  referenciaDaPosicao,
  telefoneParaWhatsapp,
  ultimoContatoPorPaciente,
  type ContatoBuscaAtiva,
} from "./busca-ativa-contatos";

const contato = (over: Partial<ContatoBuscaAtiva>): ContatoBuscaAtiva => ({
  id: "c1",
  paciente_id: "p1",
  origem: "ciclo",
  procedimento: "MANUTENCAO",
  resultado: "nao_atende",
  observacao: "",
  registrado_por_nome: "Lu",
  criado_em: "2026-09-05T13:00:00Z",
  ...over,
});

describe("referenciaDaPosicao", () => {
  it("não deixa o atraso ser medido por uma data futura", () => {
    // O relatório abre no mês corrente: no dia 05 o período vai até o dia 30.
    // Sem o corte, quem foi visto em julho aparecia com 25 dias a mais.
    expect(referenciaDaPosicao("2026-09-30", "2026-09-05")).toBe("2026-09-05");
  });

  it("respeita a consulta a uma data passada", () => {
    // "Como estava a lista no fim de agosto" continua respondendo agosto.
    expect(referenciaDaPosicao("2026-08-31", "2026-09-05")).toBe("2026-08-31");
  });

  it("aceita o próprio dia de hoje", () => {
    expect(referenciaDaPosicao("2026-09-05", "2026-09-05")).toBe("2026-09-05");
  });
});

describe("telefoneParaWhatsapp", () => {
  it("acrescenta o código do Brasil", () => {
    expect(telefoneParaWhatsapp("(21) 98471-8970")).toBe("5521984718970");
  });

  it("não duplica o 55 de quem já veio com ele", () => {
    expect(telefoneParaWhatsapp("5521984718970")).toBe("5521984718970");
  });

  it("recusa número curto demais para ser telefone", () => {
    expect(telefoneParaWhatsapp("2699")).toBeNull();
    expect(telefoneParaWhatsapp("")).toBeNull();
    expect(telefoneParaWhatsapp(null)).toBeNull();
  });
});

describe("linkWhatsapp", () => {
  it("monta o endereço que abre o aplicativo e o WhatsApp Web", () => {
    expect(linkWhatsapp("(21) 98471-8970")).toBe(
      "https://api.whatsapp.com/send?phone=5521984718970",
    );
  });

  it("leva a mensagem já escrita", () => {
    const url = linkWhatsapp("21984718970", "Olá, Ana!");
    expect(url).toContain("api.whatsapp.com/send?phone=5521984718970");
    expect(url).toContain("text=Ol%C3%A1%2C%20Ana!");
  });

  it("devolve nulo sem telefone, para o botão nascer desabilitado", () => {
    expect(linkWhatsapp(null)).toBeNull();
  });
});

describe("mensagemDeRetorno", () => {
  const msg = mensagemDeRetorno("ANA MARIA DE SOUZA", "Policlínica Menino Jesus");

  it("chama a pessoa pelo primeiro nome", () => {
    expect(msg.startsWith("Olá, ANA!")).toBe(true);
  });

  it("identifica a clínica", () => {
    expect(msg).toContain("Policlínica Menino Jesus");
  });

  it("não cita procedimento, exame nem médico", () => {
    // A mensagem cai num celular que outra pessoa pode ler. Dado de saúde não
    // sai do sistema — mesma regra do painel de senhas.
    for (const proibido of ["manuten", "aparelho", "consulta", "exame", "dr.", "dra."]) {
      expect(msg.toLowerCase()).not.toContain(proibido);
    }
  });
});

describe("ultimoContatoPorPaciente", () => {
  it("guarda o mais recente de cada paciente", () => {
    // A lista chega do banco do mais novo para o mais velho.
    const mapa = ultimoContatoPorPaciente([
      contato({ id: "novo", paciente_id: "p1", criado_em: "2026-09-05T13:00:00Z" }),
      contato({ id: "velho", paciente_id: "p1", criado_em: "2026-08-20T13:00:00Z" }),
      contato({ id: "outro", paciente_id: "p2" }),
    ]);
    expect(mapa.get("p1")?.id).toBe("novo");
    expect(mapa.get("p2")?.id).toBe("outro");
    expect(mapa.size).toBe(2);
  });
});

describe("contatosDoPaciente", () => {
  it("mantém a ordem em que vieram", () => {
    const lista = contatosDoPaciente(
      [
        contato({ id: "a", paciente_id: "p1" }),
        contato({ id: "b", paciente_id: "p2" }),
        contato({ id: "c", paciente_id: "p1" }),
      ],
      "p1",
    );
    expect(lista.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("ehResultadoContato", () => {
  it("aceita os desfechos do balcão", () => {
    expect(ehResultadoContato("reagendado")).toBe(true);
    expect(ehResultadoContato("desistiu")).toBe(true);
  });

  it("recusa valor desconhecido, para a tela cair em 'Outro'", () => {
    expect(ehResultadoContato("resolvido")).toBe(false);
    expect(ehResultadoContato(null)).toBe(false);
  });
});

describe("formatação de contato", () => {
  it("escreve o telefone como a recepção lê", () => {
    expect(formatarTelefone("21984718970")).toBe("(21) 98471-8970");
    expect(formatarTelefone("2126991990")).toBe("(21) 2699-1990");
    expect(formatarTelefone("5521984718970")).toBe("(21) 98471-8970");
  });

  it("devolve o que veio quando não é telefone reconhecível", () => {
    expect(formatarTelefone("ramal 12")).toBe("ramal 12");
    expect(formatarTelefone(null)).toBe("");
  });

  it("pontua o CPF", () => {
    expect(formatarCpf("12345678909")).toBe("123.456.789-09");
    expect(formatarCpf("123")).toBe("123");
    expect(formatarCpf(null)).toBe("");
  });
});
