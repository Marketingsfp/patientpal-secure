/**
 * Busca ativa — histórico de contato (regras puras).
 *
 * A tela Sessões e Manutenções lista quem sumiu; este módulo cuida da outra
 * metade do trabalho: o que a recepção já tentou com cada um. Tudo aqui é puro
 * e coberto por teste. O acesso ao banco mora em `./carregar-contatos`.
 *
 * Duas decisões que valem explicação:
 *
 *  - "Paciente desistiu" NÃO tira a linha do relatório nem encerra tratamento.
 *    É anotação de recepção. Encerrar um pacote é ato de quem tem alçada, e
 *    fazer isso por um clique de balcão apagaria dinheiro já contratado.
 *  - O texto sugerido do WhatsApp nunca cita procedimento, exame ou médico. Ele
 *    sai do celular da clínica para o do paciente, e mensagem de aplicativo é
 *    superfície que qualquer pessoa que pegue o aparelho lê.
 */

/** Os quatro desfechos do balcão, mais a saída para o que não couber neles. */
export type ResultadoContato =
  | "reagendado"
  | "nao_atende"
  | "mensagem_enviada"
  | "desistiu"
  | "outro";

/** Ordem em que aparecem no seletor: do desfecho melhor para o pior. */
export const RESULTADOS_CONTATO: ResultadoContato[] = [
  "reagendado",
  "mensagem_enviada",
  "nao_atende",
  "desistiu",
  "outro",
];

export const ROTULO_RESULTADO: Record<ResultadoContato, string> = {
  reagendado: "Contato realizado — Reagendado",
  nao_atende: "Não atende / Caixa postal",
  mensagem_enviada: "Mensagem enviada",
  desistiu: "Paciente desistiu",
  outro: "Outro",
};

/** Rótulo curto, para caber na coluna da tabela sem quebrar a linha. */
export const ROTULO_RESULTADO_CURTO: Record<ResultadoContato, string> = {
  reagendado: "Reagendado",
  nao_atende: "Não atende",
  mensagem_enviada: "Mensagem enviada",
  desistiu: "Desistiu",
  outro: "Outro",
};

/**
 * Cor da etiqueta na tabela. Verde só para "Reagendado": é o único desfecho em
 * que o paciente voltou para a agenda — os outros continuam sendo trabalho em
 * aberto, e pintá-los de verde faria a lista parecer resolvida.
 */
export const COR_RESULTADO: Record<ResultadoContato, string> = {
  reagendado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  mensagem_enviada: "border-sky-200 bg-sky-50 text-sky-700",
  nao_atende: "border-amber-200 bg-amber-50 text-amber-700",
  desistiu: "border-rose-200 bg-rose-50 text-rose-700",
  outro: "border-slate-200 bg-slate-50 text-slate-700",
};

export function ehResultadoContato(v: unknown): v is ResultadoContato {
  return typeof v === "string" && v in ROTULO_RESULTADO;
}

/** Um registro de contato, como sai do banco. */
export interface ContatoBuscaAtiva {
  id: string;
  paciente_id: string;
  origem: "pacote" | "ciclo";
  procedimento: string;
  resultado: ResultadoContato;
  observacao: string;
  registrado_por_nome: string;
  criado_em: string;
}

/**
 * O contato mais recente de cada paciente, indexado pelo id do paciente.
 *
 * A tabela mostra UM contato por linha — o último —, porque a recepção precisa
 * responder "já mexeram nele hoje?" batendo o olho. O histórico completo fica
 * no painel do paciente, que abre com um clique.
 *
 * A lista chega do banco ordenada do mais novo para o mais velho, então o
 * primeiro de cada paciente já é o mais recente; guardar só o primeiro evita
 * comparar datas em string.
 */
export function ultimoContatoPorPaciente(
  contatos: ContatoBuscaAtiva[],
): Map<string, ContatoBuscaAtiva> {
  const mapa = new Map<string, ContatoBuscaAtiva>();
  for (const c of contatos) {
    if (!mapa.has(c.paciente_id)) mapa.set(c.paciente_id, c);
  }
  return mapa;
}

/** Só os contatos de um paciente, na ordem em que vieram (mais novo primeiro). */
export function contatosDoPaciente(
  contatos: ContatoBuscaAtiva[],
  pacienteId: string,
): ContatoBuscaAtiva[] {
  return contatos.filter((c) => c.paciente_id === pacienteId);
}

/**
 * Só dígitos, com o 55 do Brasil na frente.
 *
 * Devolve `null` quando não sobra número de telefone plausível — 8 dígitos é o
 * fixo antigo sem DDD, e abrir o WhatsApp com menos que isso só produz a tela
 * de "número inválido" no meio do atendimento.
 */
export function telefoneParaWhatsapp(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  return `55${d}`;
}

/**
 * Link do WhatsApp com a mensagem já escrita.
 *
 * `api.whatsapp.com/send` é o endereço que abre tanto o aplicativo instalado
 * quanto o WhatsApp Web do computador da recepção — que é onde a Lu trabalha.
 */
export function linkWhatsapp(
  telefone: string | null | undefined,
  mensagem?: string,
): string | null {
  const numero = telefoneParaWhatsapp(telefone);
  if (!numero) return null;
  const base = `https://api.whatsapp.com/send?phone=${numero}`;
  return mensagem ? `${base}&text=${encodeURIComponent(mensagem)}` : base;
}

/**
 * Texto sugerido da mensagem.
 *
 * Só o primeiro nome do paciente e o nome da clínica. Nada de procedimento,
 * especialidade ou nome de médico: a mensagem cai num celular que pode ser lido
 * por qualquer um, e dado de saúde não sai daqui.
 */
export function mensagemDeRetorno(pacienteNome: string, clinicaNome: string): string {
  const primeiro = pacienteNome.trim().split(/\s+/)[0] ?? "";
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  return (
    `${saudacao} Aqui é da ${clinicaNome}. ` +
    "Notamos que faz um tempo desde o seu último atendimento e queremos continuar acompanhando você. " +
    "Podemos marcar o seu retorno? É só responder por aqui com o melhor dia e horário."
  );
}

/** Telefone em (00) 00000-0000, como a recepção lê e dita ao telefone. */
export function formatarTelefone(telefone: string | null | undefined): string {
  const bruto = String(telefone ?? "").trim();
  if (!bruto) return "";
  const d = bruto.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto;
}

/** CPF em 000.000.000-00. Deixa passar o que não tiver 11 dígitos. */
export function formatarCpf(cpf: string | null | undefined): string {
  const bruto = String(cpf ?? "").trim();
  const d = bruto.replace(/\D/g, "");
  if (d.length !== 11) return bruto;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Data de referência da coluna "Dias parado" e da pergunta "tem data marcada?".
 *
 * O relatório abre no mês corrente, cujo fim é uma data FUTURA: no dia 05 o
 * período vai até o dia 30. Passando o dia 30 como referência, um paciente
 * visto pela última vez em 09/07 aparecia com 83 dias parado quando o atraso
 * real era 58 — e um paciente já remarcado para o dia 20 aparecia como "sem
 * agendamento", porque o banco só conta como próxima data o que cai depois da
 * referência.
 *
 * Na visão de posição, portanto, a referência é a menor entre o fim do período
 * escolhido e hoje. Quem consulta uma data passada de propósito ("como estava
 * a lista no fim de agosto") continua sendo atendido: aí o fim do período é o
 * menor dos dois e é ele que vale.
 *
 * No modo movimento nada disso se aplica — lá a data é janela fechada de
 * produção e tem que ser respeitada como foi digitada.
 */
export function referenciaDaPosicao(ate: string, hoje: string): string {
  return ate < hoje ? ate : hoje;
}
