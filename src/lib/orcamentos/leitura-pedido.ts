/**
 * Leitura do pedido médico por foto no "Novo orçamento" (regras puras, sem rede).
 *
 * Usa as mesmas regras da leitura de imagem da Nina (só leitura administrativa, nada de
 * opinião clínica, marcação duvidosa e letra ilegível não viram nome) e acrescenta o nome do
 * paciente e do médico solicitante. A IA só sugere: a recepção escolhe o paciente, confere o
 * médico e os exames, e o preço vem sempre do catálogo de serviços.
 */
import {
  PROMPT_LEITURA_IMAGEM,
  interpretarLeituraImagem,
  type LeituraImagem,
} from "@/lib/nina/leitura-imagem";
import { normalizarBusca } from "@/lib/busca/relevancia";

/** Nome sem "Dr."/"Dra." — o cadastro de médicos grava assim. */
const limparPrefixoMedico = (nome: string) => nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();

export const PROMPT_LEITURA_PEDIDO_BALCAO = `${PROMPT_LEITURA_IMAGEM}
Nesta leitura a imagem foi enviada pela recepção da clínica (não pelo WhatsApp). Acrescente sempre ao JSON os campos "paciente_nome" e "medico_nome": o nome do paciente e o nome do médico solicitante exatamente como escritos no pedido (cabeçalho, campo do paciente, carimbo ou assinatura). Use null quando o nome não aparecer ou não estiver legível com segurança. Não complete, não corrija e não adivinhe nomes de pessoas. Não inclua CRM, título ("Dr.", "Dra.") nem especialidade no nome.
Exemplo: {"tipo":"pedido_medico","itens":["Hemograma completo"],"paciente_nome":"Maria da Silva","medico_nome":"João Souza"}`;

export type LeituraPedidoBalcao = {
  leitura: LeituraImagem;
  pacienteNome: string | null;
  medicoNome: string | null;
};

const MAX_CARACTERES_NOME = 120;

function limparNome(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const texto = bruto
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (texto.length < 3 || texto.length > MAX_CARACTERES_NOME) return null;
  // Nome de pessoa tem letras; "null", "-", "???" ou só números não contam.
  if (!/\p{L}{2}/u.test(texto) || /^(null|n\/a|nao informado|não informado)$/i.test(texto))
    return null;
  return texto.toLocaleUpperCase("pt-BR");
}

/** Nomes só valem quando a imagem é de fato um pedido médico. */
export function interpretarLeituraPedidoBalcao(
  bruto: string | null | undefined,
): LeituraPedidoBalcao {
  const leitura = interpretarLeituraImagem(bruto);
  const comNomes = leitura.tipo === "pedido_medico" || leitura.tipo === "marcacao_incerta";
  if (!comNomes) return { leitura, pacienteNome: null, medicoNome: null };
  const texto = String(bruto ?? "");
  let json: { paciente_nome?: unknown; medico_nome?: unknown } = {};
  try {
    json = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
  } catch {
    /* interpretarLeituraImagem já validou o JSON. */
  }
  const medico = limparNome(json.medico_nome);
  return {
    leitura,
    pacienteNome: limparNome(json.paciente_nome),
    medicoNome: medico ? limparPrefixoMedico(medico) || null : null,
  };
}

const chaveNome = (nome: string) =>
  normalizarBusca(limparPrefixoMedico(nome))
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2);

/**
 * Médico do cadastro que corresponde ao nome lido. Todas as palavras lidas (sem "de", "da"…)
 * precisam estar no nome cadastrado; só um médico assim é escolhido sozinho.
 */
export function medicosComNomeLido<T extends { nome: string | null }>(
  nomeLido: string,
  medicos: readonly T[],
): T[] {
  const lidas = chaveNome(nomeLido);
  if (lidas.length === 0) return [];
  return medicos.filter((m) => {
    const cadastro = new Set(chaveNome(m.nome ?? ""));
    return lidas.every((p) => cadastro.has(p));
  });
}
