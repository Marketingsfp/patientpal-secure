/**
 * FASE 5 — TEMPLATES DAS MENSAGENS DETERMINÍSTICAS (módulo puro).
 *
 * São as mensagens que a Nina envia SEM passar pelo modelo: pedido de dados,
 * aviso de erro, confirmação de agendamento, transferência para atendente,
 * mídia não suportada e despedida.
 *
 * Publicações anteriores continuam valendo: quando não existe template
 * publicado para uma chave, o padrão daqui é usado. A confirmação de
 * agendamento recebe também o bloco próprio de aviso e despedida.
 *
 * Cada chave declara as variáveis permitidas. Um template publicado com
 * variável desconhecida é recusado na validação e o padrão assume — nunca
 * enviamos texto com `{algo}` cru para o paciente.
 */

import { omitirNomeGenerico } from "../regras-catalogo";
import { removerEmojisNina } from "./sem-emojis";

export const ESCOPO_TEMPLATES = "whatsapp" as const;
export const CHAVES_CONFIRMACAO_AGENDAMENTO = new Set([
  "fluxo.agendamento.confirmado", "fluxo.agendamento.confirmado_pre_agendamento",
  "fluxo.agendamento.confirmado_ficha", "fluxo.agendamento.confirmado_ficha_pendente",
]);

export type CategoriaTemplate =
  /** Coleta de dados e confirmação do agendamento (regra técnica protegida). */
  | "fluxo"
  /** Mensagem automática de transferência para atendimento humano. */
  | "handoff"
  /** Mensagem automática de falha. */
  | "erro"
  /** Mensagem automática para áudio/imagem/documento. */
  | "midia"
  /** Despedida do atendimento. */
  | "encerramento";

export type DefinicaoTemplate = {
  chave: string;
  categoria: CategoriaTemplate;
  descricao: string;
  variaveis: readonly string[];
  padrao: string;
};

const D = (t: DefinicaoTemplate) => t;

export const TEMPLATES_PADRAO: readonly DefinicaoTemplate[] = [
  D({
    chave: "fluxo.agendamento.revisar_pre_agendamento", categoria: "fluxo",
    descricao: "Resumo antes do aceite de horário em ordem de chegada com pré-agendamento.",
    variaveis: ["profissional", "procedimento", "data", "horario", "unidade"],
    padrao: "Confira os dados do pré-agendamento:\n\n*Atendimento:* {procedimento}\n*Profissional:* {profissional}\n*Data:* {data}\n*Horário do pré-agendamento:* {horario}\n*Clínica:* {unidade}\n\nO atendimento é por ordem de chegada entre os pacientes daquele horário: quem chegar primeiro será atendido primeiro. O horário do pré-agendamento não garante o horário exato da consulta.\n\nVocê confirma esse pré-agendamento?",
  }),
  D({
    chave: "fluxo.agendamento.revisar_ficha", categoria: "fluxo",
    descricao: "Resumo do atendimento por ficha, sem prometer hora da consulta.",
    variaveis: ["profissional", "procedimento", "data", "horario", "unidade"],
    padrao: "Confira os dados do atendimento por ficha:\n\n*Atendimento:* {procedimento}\n*Profissional:* {profissional}\n*Data:* {data}\n*Horário de comparecimento:* {horario}\n*Clínica:* {unidade}\n\nO atendimento segue a numeração das fichas. Chegue com 15 minutos de antecedência para realizar o check-in na Recepção Principal. O horário informado não é garantia da hora da consulta.\n\nVocê confirma esse agendamento?",
  }),
  D({
    chave: "fluxo.agendamento.sem_pre_agendamento", categoria: "fluxo",
    descricao: "Orientação sem reserva, sem horário individual e sem antecedência obrigatória.",
    variaveis: ["profissional", "unidade"],
    padrao: "O atendimento com {profissional} é por ordem de chegada, sem pré-agendamento. Não é necessário marcar horário: basta comparecer à {unidade} nos dias e períodos de atendimento desse profissional. Quem chegar primeiro será atendido primeiro.",
  }),
  D({
    chave: "fluxo.agendamento.confirmado_pre_agendamento", categoria: "fluxo",
    descricao: "Confirmação da reserva por ordem de chegada, sem exigir 15 minutos.",
    variaveis: ["profissional", "data", "horario"],
    padrao: "Seu pré-agendamento foi realizado!\n\n*Profissional:* {profissional}\n*Data:* {data}\n*Horário pré-agendado:* {horario}\n\nO atendimento é por ordem de chegada entre os pacientes daquele horário: quem chegar primeiro será atendido primeiro. O horário pré-agendado não garante o horário exato da consulta.",
  }),
  D({
    chave: "fluxo.agendamento.confirmado_ficha", categoria: "fluxo",
    descricao: "Confirmação por ficha calculada pela mesma fonte da Agenda.",
    variaveis: ["profissional", "data", "horario", "ficha"],
    padrao: "Seu agendamento foi realizado!\n\n*Profissional:* {profissional}\n*Data:* {data}\n*Sua ficha:* {ficha}\n*Horário de comparecimento:* {horario}\n\nO atendimento é por numeração, seguindo a ordem das fichas. Chegue com 15 minutos de antecedência para realizar o check-in na Recepção Principal. O horário informado não é garantia da hora da consulta.",
  }),
  D({
    chave: "fluxo.agendamento.confirmado_ficha_pendente", categoria: "fluxo",
    descricao: "Reserva comprovada por ficha, quando a leitura da numeração falhou.",
    variaveis: ["profissional", "data", "horario"],
    padrao: "Seu agendamento foi realizado!\n\n*Profissional:* {profissional}\n*Data:* {data}\n*Horário de comparecimento:* {horario}\n\nO atendimento é por numeração de ficha. Não consegui consultar seu número neste momento; a recepção poderá informá-lo. Chegue com 15 minutos de antecedência para realizar o check-in na Recepção Principal. O horário informado não é garantia da hora da consulta.",
  }),
  ...(["pre_agendamento", "ficha"] as const).map((tipo) => D({
    chave: `fluxo.agendamento.despedida_${tipo}`, categoria: "fluxo",
    descricao: "Aviso de presença e despedida com referência ao horário de chegada, sem prometer hora da consulta.",
    variaveis: ["unidade"],
    padrao: `Uma hora antes do horário ${tipo === "ficha" ? "de comparecimento" : "pré-agendado"}, entraremos em contato para confirmar se você poderá comparecer.\n\nA {unidade} agradece a sua confiança! Será um prazer receber você!`,
  })),
  D({
    chave: "fluxo.agendamento.revisar", categoria: "fluxo",
    descricao: "Resumo da vaga escolhida e revalidada, antes do aceite final do paciente.",
    variaveis: ["profissional", "procedimento", "data", "horario", "unidade"],
    padrao: "Confira os dados antes de confirmar seu agendamento:\n\n" +
      "*Atendimento:* {procedimento}\n*Profissional:* {profissional}\n*Data:* {data}\n*Horário:* {horario}\n*Clínica:* {unidade}\n\n" +
      "Você confirma o agendamento com esse profissional, nessa data e nesse horário?",
  }),
  D({
    chave: "fluxo.agendamento.escolher", categoria: "fluxo",
    descricao: "Pede escolha explícita quando não existe uma vaga única validada.", variaveis: [],
    padrao: "Para confirmar a vaga correta, informe o horário e a data que você prefere entre as opções apresentadas. Se houver mais de um profissional, diga também o nome dele.",
  }),
  D({
    chave: "fluxo.cadastro.obrigatorios",
    categoria: "fluxo",
    descricao: "Pede apenas campos obrigatórios faltantes após verificar o cadastro no Clínica OS.",
    variaveis: ["lista", "exemplo"],
    padrao: "Para conferir seu cadastro e concluir o agendamento, preciso de {lista}.\n\nExemplo: {exemplo}.",
  }),
  D({
    chave: "fluxo.coleta.completa",
    categoria: "fluxo",
    descricao: "Pedido dos três dados após o paciente aceitar a vaga.",
    variaveis: [],
    padrao:
      "Perfeito! Para prosseguir com o agendamento, por favor, me informe:\n\n" +
      "• Nome completo\n• CPF\n• Data de nascimento (DD/MM/AAAA)",
  }),
  D({
    chave: "fluxo.coleta.faltando",
    categoria: "fluxo",
    descricao: "Cobrança apenas do que ainda falta na coleta.",
    variaveis: ["lista"],
    padrao: "Obrigada! Só falta {lista} para eu concluir o agendamento.",
  }),
  D({
    chave: "fluxo.coleta.cpf_invalido",
    categoria: "fluxo",
    descricao: "CPF digitado não passa na validação.",
    variaveis: [],
    padrao: "O CPF informado não confere. Pode conferir e me mandar de novo, por favor?",
  }),
  D({
    chave: "fluxo.identificacao.divergencia",
    categoria: "fluxo",
    descricao: "Os dados informados não bateram com o cadastro.",
    variaveis: ["mensagem"],
    padrao:
      "{mensagem}\n\nPode me mandar novamente nome completo, CPF e data de nascimento (DD/MM/AAAA)?",
  }),
  D({
    chave: "fluxo.identificacao.instabilidade",
    categoria: "erro",
    descricao: "Falha técnica ao consultar o cadastro durante a coleta.",
    variaveis: [],
    padrao:
      "Não consegui concluir a consulta ao cadastro neste momento. Seus dados já informados foram mantidos; por favor, tente novamente em instantes.",
  }),
  D({
    chave: "fluxo.agendamento.confirmado",
    categoria: "fluxo",
    descricao:
      "Confirmação do agendamento. Só é usada com evidência real de gravação (appointment_id).",
    variaveis: ["profissional", "data", "horario"],
    padrao:
      "Prontinho! Seu agendamento foi realizado com sucesso.\n\n" +
      "*Profissional:* {profissional}\n*Data:* {data}\n*Horário:* {horario}\n\n" +
      "O atendimento será no horário marcado. Chegue com 15 minutos de antecedência para realizar o check-in na Recepção Principal e traga um documento com foto.",
  }),
  D({
    chave: "fluxo.agendamento.despedida",
    categoria: "fluxo",
    descricao:
      "Aviso de confirmação de presença e despedida, acrescentados após o agendamento concluído.",
    variaveis: ["unidade"],
    padrao:
      "Uma hora antes da sua consulta, entraremos em contato para confirmar se você poderá comparecer.\n\n" +
      "A {unidade} agradece a sua confiança! Foi um prazer ajudar com seu agendamento. Até breve!",
  }),
  D({
    chave: "fluxo.agendamento.duplicado",
    categoria: "fluxo",
    descricao: "O mesmo horário já estava reservado para o paciente.",
    variaveis: [],
    padrao: "Esse horário já está reservado para você — não precisa marcar de novo.",
  }),
  D({
    chave: "handoff.aviso",
    categoria: "handoff",
    descricao: "Aviso de transferência para atendimento humano.",
    variaveis: [],
    padrao: "Claro! Vou encaminhar seu atendimento para nossa equipe.",
  }),
  D({
    chave: "erro.tecnico",
    categoria: "erro",
    descricao: "Falha genérica na geração da resposta.",
    variaveis: [],
    padrao:
      "Tive uma instabilidade aqui agora. Pode me mandar sua mensagem de novo em instantes?",
  }),
  D({
    chave: "midia.audio_falhou",
    categoria: "midia",
    descricao: "Não foi possível transcrever o áudio recebido.",
    variaveis: [],
    padrao: "Não consegui ouvir seu áudio direito. Pode me escrever por texto, por favor?",
  }),
  D({
    chave: "midia.imagem",
    categoria: "midia",
    descricao: "Imagem recebida.",
    variaveis: [],
    padrao:
      "Recebi sua imagem. No momento não consigo analisar imagens por aqui — um atendente vai olhar e responder. Se puder, me descreva por texto o que precisa.",
  }),
  D({
    chave: "midia.documento",
    categoria: "midia",
    descricao: "Documento recebido.",
    variaveis: [],
    padrao:
      "Recebi seu documento. Um atendente vai conferir e responder. Se puder, me diga por texto do que se trata.",
  }),
  D({
    chave: "midia.figurinha",
    categoria: "midia",
    descricao: "Figurinha recebida.",
    variaveis: [],
    padrao: "Recebi. Como posso te ajudar?",
  }),
  D({
    chave: "midia.outro",
    categoria: "midia",
    descricao: "Outros tipos de mídia.",
    variaveis: [],
    padrao:
      "Recebi sua mensagem. Um atendente vai olhar e responder em breve. Se preferir, me escreva por texto o que precisa.",
  }),
  D({
    chave: "encerramento.despedida",
    categoria: "encerramento",
    descricao: "Mensagem final quando o paciente confirma que não precisa de mais nada.",
    variaveis: ["unidade"],
    padrao:
      "Foi um prazer ajudar! A {unidade} agradece o contato. Seu atendimento foi encerrado. Se precisar de algo mais, é só nos enviar uma nova mensagem. Até breve!",
  }),
];

export const MAPA_TEMPLATES: Record<string, DefinicaoTemplate> = Object.fromEntries(
  TEMPLATES_PADRAO.map((t) => [t.chave, t]),
);

export type ChaveTemplate = string;

/** Substitui `{variavel}` pelos valores informados. */
export function renderizarTemplate(
  texto: string,
  valores: Record<string, string>,
): { ok: true; texto: string } | { ok: false; restante: string[] } {
  const faltando: string[] = [];
  const saida = texto.replace(/\{([a-z_]+)\}/gi, (_m, nome: string) => {
    const v = valores[nome];
    if (v === undefined) {
      faltando.push(nome);
      return `{${nome}}`;
    }
    return v;
  });
  return faltando.length ? { ok: false, restante: faltando } : { ok: true, texto: saida };
}

/** Um template publicado só vale se usar exclusivamente as variáveis da chave. */
export function validarTemplatePublicado(
  chave: string,
  texto: string,
): { ok: true } | { ok: false; motivo: string } {
  const def = MAPA_TEMPLATES[chave];
  if (!def) return { ok: false, motivo: "chave desconhecida" };
  const limpo = (texto ?? "").trim();
  if (!limpo) return { ok: false, motivo: "texto vazio" };
  const usadas = [...limpo.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1]!);
  const invalidas = usadas.filter((v) => !def.variaveis.includes(v));
  if (invalidas.length) return { ok: false, motivo: `variável não permitida: ${invalidas[0]}` };
  const faltando = def.variaveis.filter((v) => !usadas.includes(v));
  if (faltando.length) return { ok: false, motivo: `variável obrigatória ausente: ${faltando[0]}` };
  return { ok: true };
}

export type TextosTemplates = Record<string, string>;

/**
 * Resolve o texto de uma chave: template publicado quando válido, senão o
 * padrão do código. Nunca devolve texto com variável não substituída.
 */
export function textoDaChave(
  chave: string,
  valores: Record<string, string>,
  publicados?: TextosTemplates | null,
): { texto: string; origemTemplate: "publicado" | "padrao"; motivo: string | null } {
  const resultado = resolverTextoDaChave(chave, valores, publicados);
  resultado.texto = removerEmojisNina(omitirNomeGenerico(resultado.texto));
  if (!CHAVES_CONFIRMACAO_AGENDAMENTO.has(chave) || !resultado.texto) return resultado;
  // Inclui o atendimento também nos templates já publicados, preservando
  // suas orientações e despedida. Não exige republicar textos no banco.
  if (valores.procedimento?.trim() && !resultado.texto.includes(valores.procedimento.trim()))
    resultado.texto = `${resultado.texto}\n\n*Atendimento:* ${valores.procedimento.trim()}`;
  const modalidade = chave.includes("pre_agendamento") ? "chegada_com_pre_agendamento"
    : chave.includes("ficha") ? "ficha" : "hora_marcada";
  const despedida = acrescentarDespedidaAgendamento(resultado.texto, valores.unidade, publicados, modalidade);
  return {
    ...despedida,
    origemTemplate:
      resultado.origemTemplate === "publicado" || despedida.origemTemplate === "publicado"
        ? "publicado"
        : "padrao",
    motivo: resultado.motivo ?? despedida.motivo,
  };
}

export function acrescentarDespedidaAgendamento(
  texto: string,
  unidade?: string,
  publicados?: TextosTemplates | null,
  modalidade?: string | null,
): { texto: string; origemTemplate: "publicado" | "padrao"; motivo: string | null } {
  // Bloco próprio: preserva a confirmação publicada e acompanha também a
  // renderização final compartilhada pelo WhatsApp e pela homologação.
  const despedida = resolverTextoDaChave(
    modalidade === "chegada_com_pre_agendamento" ? "fluxo.agendamento.despedida_pre_agendamento"
      : modalidade === "ficha" ? "fluxo.agendamento.despedida_ficha" : "fluxo.agendamento.despedida",
    { unidade: unidade?.trim() || "nossa clínica" },
    publicados,
  );
  const corpo = removerEmojisNina(texto).trim();
  despedida.texto = removerEmojisNina(despedida.texto);
  return {
    ...despedida,
    texto: corpo.endsWith(despedida.texto)
      ? corpo
      : `${corpo}\n\n${despedida.texto}`,
  };
}

function resolverTextoDaChave(
  chave: string,
  valores: Record<string, string>,
  publicados?: TextosTemplates | null,
): { texto: string; origemTemplate: "publicado" | "padrao"; motivo: string | null } {
  const def = MAPA_TEMPLATES[chave];
  if (!def) return { texto: "", origemTemplate: "padrao", motivo: "chave desconhecida" };
  const publicado = publicados?.[chave];
  if (publicado) {
    const v = validarTemplatePublicado(chave, publicado);
    if (v.ok) {
      const r = renderizarTemplate(publicado, valores);
      if (r.ok) return { texto: r.texto, origemTemplate: "publicado", motivo: null };
      return {
        texto: renderizarPadrao(def, valores),
        origemTemplate: "padrao",
        motivo: `variável sem valor: ${r.restante[0]}`,
      };
    }
    return { texto: renderizarPadrao(def, valores), origemTemplate: "padrao", motivo: v.motivo };
  }
  return { texto: renderizarPadrao(def, valores), origemTemplate: "padrao", motivo: null };
}

function renderizarPadrao(def: DefinicaoTemplate, valores: Record<string, string>): string {
  const r = renderizarTemplate(def.padrao, valores);
  return r.ok ? r.texto : def.padrao.replace(/\{([a-z_]+)\}/gi, "-");
}
