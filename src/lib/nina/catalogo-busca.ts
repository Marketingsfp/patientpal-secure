/** Interpretação de escrita para buscar fatos publicados; nunca cria um atendimento. */
import { normalizarBuscaCatalogo, termosItemCatalogo } from "./catalogo-sem-registro";

// Equivalências de busca, não equivalências de preço, preparo ou modalidade.
// Qualificadores (órgão, total/superior, infantil etc.) continuam obrigatórios.
const GRUPOS = [
  ["ultrassonografia", "ultra", "usg", "ultrassom", "ultrassons"],
  ["radiografia", "rx", "raio"],
  ["eletrocardiograma", "ecg"],
  ["eletroencefalograma", "eeg"],
  ["cardiologia", "cardio", "cardiologista"],
  ["dermatologia", "dermato", "dermatologista"],
  ["ginecologia", "gineco", "ginecologista"],
  ["oftalmologia", "oftalmo", "oftalmologista"],
  ["otorrinolaringologia", "otorrino", "otorrinolaringologista"],
  ["ortopedia", "ortopedista"],
  ["pediatria", "pediatra"],
  ["neurologia", "neuro", "neurologista"],
  ["pneumologia", "pneumo", "pneumologista"],
  ["urologia", "uro", "urologista"],
  ["endocrinologia", "endocrino", "endocrinologista"],
] as const;
const ALIASES = new Map<string, string>(
  GRUPOS.flatMap(([nome, ...aliases]) => [nome, ...aliases].map((alias) => [alias, nome] as const)),
);

function escrita(texto: string): string {
  return normalizarBuscaCatalogo(texto)
    .replace(/\bultra[ -]+som\b/g, "ultrassonografia")
    .replace(/\braio[s]?[ -]*x\b/g, "radiografia");
}
function canonico(termo: string): string {
  return (
    ALIASES.get(termo) ??
    ALIASES.get(termo.replace(/s$/, "")) ??
    termo.replace(/ologistas?$/, "ologia")
  );
}
function palavras(texto: string): string[] {
  return escrita(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(canonico);
}

/** Distância com transposição adjacente, limitada a pequenos erros de escrita. */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}
export function escritaProxima(a: string, b: string, minimo = 5): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < minimo || a[0] !== b[0]) return false;
  const limite = Math.min(a.length, b.length) >= 10 && a.slice(0, 3) === b.slice(0, 3) ? 2 : 1;
  return Math.abs(a.length - b.length) <= limite && distancia(a, b) <= limite;
}
function corresponde(termo: string, palavra: string): boolean {
  return (
    termo === palavra ||
    `${termo}s` === palavra ||
    termo === `${palavra}s` ||
    (termo.length >= 4 && palavra.startsWith(termo))
  );
}

export function prepararBuscaCatalogo(query: string, textosPublicados: string[]) {
  const qualificadores = [
    ...escrita(query).matchAll(/\b(com|sem)\s+(doppler|contraste|sedacao)\b/g),
  ].map((m) => m[0]);
  const linguagemPedido = [
    "gostaria",
    "consulta",
    "procedimento",
    "informacoes",
    "agendar",
    "profissional",
    "horario",
  ];
  const pergunta = escrita(query).replace(
    /\b[a-z]{5,}\b/g,
    (t) =>
      linguagemPedido.find((p) => Math.abs(t.length - p.length) <= 1 && distancia(t, p) <= 1) ?? t,
  );
  const tokens = termosItemCatalogo(
    pergunta.replace(/\b(rx|ecg|eeg|usg)\b/g, (termo) => ALIASES.get(termo)!),
  ).map(canonico);
  // Siglas de duas letras precisam sobreviver ao filtro de palavras comuns.
  const curtas = (escrita(query).match(/\b[a-z]{2}\b/g) ?? [])
    .filter(
      (t) =>
        ![
          "dr",
          "de",
          "da",
          "do",
          "no",
          "na",
          "um",
          "em",
          "os",
          "as",
          "ao",
          "ou",
          "se",
          "eu",
          "me",
          "te",
          "ta",
          "ja",
          "so",
          "oi",
          "la",
          "ha",
        ].includes(t),
    )
    .map(canonico);
  const termos = [...new Set([...tokens, ...curtas])];
  const vocabulario = [...new Set(textosPublicados.flatMap(palavras))];
  const grafias = [
    ...new Set([...vocabulario, ...GRUPOS.filter(([nome]) => vocabulario.includes(nome)).flat()]),
  ];
  const ajustes: { original: string; candidatos: string[] }[] = [];
  const opcoes = termos.map((termo) => {
    if (vocabulario.some((p) => corresponde(termo, p))) return [termo];
    const candidatos = [...new Set(grafias.filter((p) => escritaProxima(termo, p)).map(canonico))];
    if (candidatos.length) ajustes.push({ original: termo, candidatos });
    return candidatos.length ? candidatos : [termo];
  });
  const siglasDesconhecidas = termos.filter(
    (t) =>
      t.length <= 3 &&
      t !== "sem" &&
      !ALIASES.has(t) &&
      !vocabulario.some((p) => corresponde(t, p)),
  );
  return {
    termos,
    ajustes,
    siglasDesconhecidas,
    pontuar(nome: string, secundario: string): number {
      if (!termos.length) return 0;
      const original = escrita(`${nome} ${secundario}`);
      if (qualificadores.some((q) => !original.includes(q))) return 0;
      const principal = palavras(nome),
        apoio = palavras(secundario);
      let score = 0;
      for (const vs of opcoes) {
        if (vs.some((t) => principal.some((p) => corresponde(t, p)))) score += 2;
        else if (vs.some((t) => apoio.some((p) => corresponde(t, p)))) score += 1;
        else return 0; // Parte da pergunta não comprova o procedimento inteiro.
      }
      return score;
    },
  };
}

export function tokensNomeProfissional(nome: string): string[] {
  return normalizarBuscaCatalogo(nome)
    .replace(/\b(?:dra?|doutor|doutora)\b\.?\s*/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t && !["de", "da", "do", "dos", "das", "e"].includes(t));
}

/** Ajuda a busca preventiva de nomes curtos com erro; nunca interpreta uma recusa como escolha. */
export function nomeProfissionalNaPergunta(query: string): string | null {
  const q = normalizarBuscaCatalogo(query);
  if (/\b(?:nao|nem|ou)\b/.test(q)) return null;
  const nome = /\b(?:dra?|doutor|doutora)\b\.?\s+([a-z][a-z\s]*)/
    .exec(q)?.[1]
    ?.split(
      /\b(?:atende|atendimento|consulta|hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|para|pra|quero|gostaria|tem|horario|valor|preco|da unidade|na unidade)\b/,
    )[0]
    ?.trim();
  return nome || null;
}
/** Aproximação sugere um nome; somente a confirmação do paciente o seleciona. */
export function compararNomeProfissional(
  pedido: string,
  nome: string,
): "exato" | "aproximado" | null {
  const termos = tokensNomeProfissional(pedido),
    completos = tokensNomeProfissional(nome);
  if (!termos.length) return null;
  if (termos.every((t) => completos.includes(t))) return "exato";
  const usados = new Set<number>();
  for (const t of termos) {
    const indice = completos.findIndex((p, i) => !usados.has(i) && escritaProxima(t, p, 4));
    if (indice < 0) return null;
    usados.add(indice);
  }
  return "aproximado";
}

export function perguntaIdentificacaoProfissional(
  opcoes: Array<{ nome: string; especialidade?: string; unidade?: string | null }>,
): string {
  const rotulos = opcoes.map((p) =>
    [p.nome, p.especialidade, p.unidade].filter(Boolean).join(" — "),
  );
  if (new Set(rotulos.map(normalizarBuscaCatalogo)).size < rotulos.length)
    return "Há profissionais com o mesmo nome e os dados disponíveis ainda não permitem distingui-los. Você sabe a especialidade ou a unidade em que deseja atendimento? Se não souber, nossa equipe poderá ajudar a identificar.";
  return `${opcoes.length === 1 ? "Você se refere a este profissional?" : "Qual destes profissionais você deseja?"}\n${rotulos.join("\n")}`;
}

export const REGRA_INTERPRETACAO_CATALOGO = `INTERPRETAÇÃO DO PEDIDO E IDENTIDADE
- Separe o tipo de atendimento do assunto e do objetivo: consulta com cardiologista = tipo consulta, termo cardiologia, objetivo agendamento quando o paciente quer marcar. Exames e procedimentos usam tipo exame_procedimento. Sintomas não mudam consulta para exame. Pesquise cada atendimento separadamente e mantenha a categoria nas continuações; não peça pedido médico nem ofereça exames para esclarecer um pedido explícito de consulta.
- Entenda a mensagem com o histórico atual: abreviações, siglas, erros de escrita e respostas curtas podem retomar um atendimento já identificado. Consulte a base com o atendimento e os qualificadores informados; nunca invente órgão, modalidade, profissional ou equivalência para uma sigla desconhecida.
- A busca aceita equivalências de escrita, como ultra/ultrassom/USG, e pequenos erros. Isso só localiza candidatos publicados; não autoriza escolher um exame parecido. Preserve total/superior, órgão, infantil/adulto e demais diferenças do pedido.
- Quando o retorno trouxer esclarecimento, faça a pergunta indicada, usando as opções publicadas. Não informe preço, preparo nem consulte agenda como se o item ou profissional já estivesse escolhido. Sigla desconhecida: peça o nome por extenso ou como está no pedido. Após esclarecer, consulte novamente a base.
- Peça esclarecimento UMA ÚNICA VEZ. Se a resposta do paciente ainda não permitir identificar o atendimento ou o profissional, encaminhe para a equipe humana, registrando internamente o pedido, a pergunta feita e a dúvida restante. Não repita a pergunta nem abra novas rodadas de tentativa.
- Nomes iguais ou parecidos: apresente nome completo, especialidade e unidade disponíveis no próprio registro. Se esses dados não distinguirem os profissionais, peça outra informação de identificação e encaminhe à equipe se a dúvida persistir. Nunca escolha pelo primeiro resultado, preço ou disponibilidade sem a preferência do paciente.
- Confirme com o paciente um nome de médico encontrado por escrita aproximada. Depois da escolha inequívoca, use o identificador do registro e o vínculo oficial da agenda; não reúna pessoas diferentes só por terem o mesmo nome.
- Um termo não identificado não comprova ausência do atendimento. Depois que o atendimento estiver identificado e for pesquisado, ausência confirmada na base segue a transferência humana obrigatória.`;
