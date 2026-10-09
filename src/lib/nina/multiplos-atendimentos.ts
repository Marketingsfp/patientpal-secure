import type { PerguntaJev, RespostaJev } from "./jev";

/**
 * Regra confirmada em 06/10/2026: quando a mesma mensagem pede dois ou mais
 * atendimentos diferentes (exames, consultas ou os dois), para informação ou
 * agendamento, a Nina encaminha para a equipe. Vale também para a foto do
 * pedido médico com dois ou mais exames.
 */
export function perguntaMultiplosAtendimentos(): Record<string, PerguntaJev> {
  return { multiplos_atendimentos: { type: "choice", instructions:
    "A mensagem atual do paciente pede, para informação ou agendamento, dois ou mais atendimentos diferentes (exames, consultas ou exame e consulta juntos)? Conte só o que o paciente pede nesta mensagem, não o histórico. Um pacote único (ex.: consulta com preventivo), várias sessões do mesmo atendimento (ex.: 10 sessões de fisioterapia), o mesmo atendimento com vários médicos ou dias, e perguntas sobre o mesmo item (preço, preparo e horário do mesmo exame) contam como um só. Dois exames diferentes do mesmo tipo (ex.: ultrassom de abdome e de tireoide) contam como dois.",
    criteria: {
      varios: "Pede dois ou mais atendimentos diferentes na mesma mensagem: 'cardiologista e dermatologista', 'quanto custa hemograma e TSH', 'ginecologista e um ultrassom', 'tem dentista? e fono?'.",
      um: "Pede um único atendimento, inclusive pacote, várias sessões do mesmo serviço ou várias perguntas sobre o mesmo item.",
      nenhum: "Não pede atendimento: saudação, escolha de horário, dados pessoais, confirmação ou outro assunto.",
    } } };
}

export function multiplosPeloJev(r: RespostaJev | undefined): boolean {
  return typeof r?.confidence === "number" && r.confidence >= 0.8 && r.choice === "varios";
}

const PEDIDO_LIDO = /^Enviei a foto de um pedido médico com: (.+)/;

/** Itens do pedido médico lido da foto (texto gerado pelo sistema, não pelo paciente). */
export function itensDoPedidoLido(mensagem: string): string[] {
  const m = PEDIDO_LIDO.exec(mensagem.trim());
  if (!m) return [];
  // A legenda nova ocupa outra linha. Transcrições anteriores podem tê-la na
  // mesma linha: encerrar na primeira frase, preservando pontos internos de siglas.
  const lista = m[1]!;
  for (const ponto of lista.matchAll(/\.(?=\s|$)/g)) {
    const antes = lista.slice(0, ponto.index);
    if (/(?:^|[\s;])(?:[A-Za-z]\.)+[A-Za-z]$/.test(antes)) continue;
    return antes.split(";").map((i) => i.trim()).filter(Boolean);
  }
  return [];
}

export const MOTIVO_MULTIPLOS = "MULTIPLOS_ATENDIMENTOS";

export function motivoMultiplos(itensFoto: readonly string[]): string {
  return itensFoto.length >= 2
    ? `${MOTIVO_MULTIPLOS}: o paciente enviou pedido médico com ${itensFoto.length} exames (${itensFoto.join("; ").slice(0, 400)}). Pedidos com dois ou mais atendimentos são conduzidos pela equipe.`
    : `${MOTIVO_MULTIPLOS}: o paciente pediu dois ou mais atendimentos na mesma mensagem. Pedidos com dois ou mais atendimentos são conduzidos pela equipe.`;
}
