/**
 * Informação que o cadastro não traz (regra de 13/10/2026, vale para todos os casos).
 *
 * A Nina responde só com o que o cadastro traz. Faltando a informação ou
 * estando "não informada" (público atendido, gênero, preparo, pedido médico,
 * documentos, convênio, parcelamento, modalidade…), ela não supõe e não diz
 * que a informação "não está cadastrada": diz que quem passa é a recepção.
 * IDADE-01 continua: idade não informada não cria restrição (sem citar cadastro).
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";

export const TEXTO_INFORMACAO_PELA_RECEPCAO = "Essa informação quem passa é a nossa recepção.";

export const REGRA_INFORMACAO_NAO_CADASTRADA = `INFORMACAO NAO CADASTRADA — REGRA INEGOCIAVEL:
- Responda somente com o que o cadastro traz. Quando o paciente pedir algo que o cadastro nao traz ou traz como nao informado (ex.: publico atendido, genero, pedido medico, preparo, documentos, convenio, parcelamento, modalidade, duracao, resultado), nao suponha e nao complete com conhecimento geral ("normalmente", "geralmente", "para o publico geral").
- Nunca diga ao paciente que a informacao nao esta cadastrada, nao consta no sistema, nao foi informada ou que nao ha restricao cadastrada.
- Diga que quem passa essa informacao e a nossa recepcao.
- Excecao: IDADE-01 continua valendo (idade nao informada nao cria restricao etaria); ao aplicar, nao mencione o cadastro.
- Excecoes confirmadas pela clinica (14/10/2026): debito e credito usam o valor de Pix/cartao (PAGAMENTO-02); acompanhante pode acompanhar (ACOMPANHANTE-01); explicacao geral curta da especialidade, exame ou procedimento e permitida (EXPLICACAO-01).`;

/** Frase que expõe ao paciente a falta de cadastro ("não está cadastrado", "não consta no sistema"…). */
const FALTA_DE_CADASTRO =
  /\b(?:nao (?:esta|estao|consta|constam|ha|temos|tenho|possui|possuem|foi|foram|existe)\b[^.!?\n]{0,60}\b(?:cadastrad|registrad|informad|no sistema|no cadastro|na base|em nosso sistema|no nosso sistema|no nosso cadastro)|sem\b[^.!?\n]{0,40}\b(?:cadastrad|registrad|informad)|nao (?:tenho|temos) (?:essa|esta|a) informacao|(?:essa|esta) informacao nao (?:esta|consta|foi))/;
/** Assunto de idade: IDADE-01 manda não falar de restrição inexistente, só remover a frase. */
const IDADE =
  /\b(?:idade|anos|crianca|criancas|bebe|bebes|faixa etaria|idosos?|menor(?:es)? de idade)\b/;

const PONTO = String.fromCharCode(30);

/**
 * Troca a frase que expõe a falta de cadastro pela orientação da recepção (uma
 * vez por resposta). Frase sobre idade sem restrição sai sem substituição
 * (IDADE-01). O resto da resposta fica igual e ela nunca fica vazia.
 */
export function corrigirInformacaoNaoCadastrada(texto: string): string {
  let trocou = false;
  const protegido = texto.replace(/\b(?:dra?|sra?|profa?)\./gi, (m) => m.slice(0, -1) + PONTO);
  const corrigido = protegido.replace(/[^.!?\n]+[.!?]*/g, (frase) => {
    const t = normalizarRespostaInformal(frase.split(PONTO).join("."));
    if (!FALTA_DE_CADASTRO.test(t)) return frase;
    // Rótulo no início da frase ("*Preparo:* …") continua; só o conteúdo muda.
    const inicio =
      /^\s*(?:[•*_-]*\s*[*_]{0,2}[\p{L} /]{2,40}?[*_]{0,2}\s*:\s*[*_]{0,2}\s*)?/u.exec(
        frase,
      )?.[0] ?? "";
    // IDADE-01: a resposta continua ("não há restrição de idade, portanto…");
    // sai só a menção ao cadastro. Apagar a frase inteira sumia com a resposta
    // (homologação 13/10/2026, 19:45).
    if (IDADE.test(t))
      return frase
        .replace(/\s+(?:cadastrad[ao]s?|registrad[ao]s?|informad[ao]s?)\b/gi, "")
        .replace(/\s+(?:n[oa]|em)\s+(?:nosso\s+)?(?:sistema|cadastro|base)\b/gi, "")
        .replace(/\s{2,}/g, " ");
    if (trocou) return "";
    trocou = true;
    return `${inicio}${TEXTO_INFORMACAO_PELA_RECEPCAO}`;
  });
  const resultado = corrigido
    .split(PONTO)
    .join(".")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return resultado || texto;
}

/** Frase que manda o paciente à recepção/equipe para obter uma informação. */
const ORIENTA_RECEPCAO =
  /\b(?:recepcao|nossa equipe|equipe de atendimento|atendentes?)\b[^.!?\n]*\b(?:passa|passam|informa|informam|tira|tiram|confirma|confirmam|confirmad[ao]s?|verifica|verificar|orienta|orientam|esclarece|esclarecem|responde|respondem)\b|\b(?:quem|so a|somente a|apenas a)\b[^.!?\n]*\b(?:passa|informa|tira|confirma|orienta|esclarece|responde)\b[^.!?\n]*\b(?:recepcao|equipe)\b/;
// "forma exata de atendimento" e "como funciona a chamada" também são o assunto
// da modalidade (homologação 14/10/2026, ciclo 1167).
const ASSUNTO_MODALIDADE =
  /\b(?:modalidade|forma (?:exata )?de atendimento|ordem de chegada|hora marcada|horario marcado|por ficha|pre-?agendamento|como funciona a chamada|funcionamento do atendimento)\b/;

/**
 * Mensagem só com pergunta genérica ("vocês têm otorrino? como funciona aí?",
 * "como vocês atendem?"): a Nina informa e espera; não é pergunta sem resposta
 * que justifique encaminhar (homologação 14/10/2026, ciclos 1060 e 1180).
 */
const PERGUNTA_GENERICA =
  /^(?:e |mas |entao )?(?:como funciona(?: ai| aqui| na clinica| com voces| ai na clinica)?|como (?:voces|vcs) (?:atendem|trabalham|fazem)|como sao (?:os |as )?(?:atendimentos|consultas|opcoes)(?: de voces| ai)?|quais (?:sao )?(?:as )?opcoes(?: de voces| de atendimento| ai)?|(?:voces|vcs) (?:tem|fazem|atendem|realizam)\b.{0,80}|tem (?:esse |essa )?(?:atendimento|consulta|exame)\b.{0,60}|como (?:eu )?faco)$/;

export function perguntaGenerica(mensagem: string): boolean {
  const perguntas = (mensagem ?? "").match(/[^.!?\n]+\?/g) ?? [];
  if (!perguntas.length) return false;
  return perguntas.every((f) =>
    PERGUNTA_GENERICA.test(normalizarRespostaInformal(f).replace(/\?/g, "").trim()),
  );
}

/**
 * Tira as frases "quem passa essa informação é a recepção" da resposta, sem
 * mexer no resto — para quando o paciente não perguntou aquilo.
 */
export function removerOrientacaoRecepcao(texto: string): string {
  const protegido = (texto ?? "").replace(
    /\b(?:dra?|sra?|profa?)\./gi,
    (m) => m.slice(0, -1) + PONTO,
  );
  const linhas = protegido.split("\n").flatMap((linha) => {
    const nova = (linha.match(/[^.!?\n]+[.!?]*/g) ?? [linha])
      .filter((frase) => {
        const t = normalizarRespostaInformal(frase.split(PONTO).join("."));
        if (frase.includes("?") || /\b(?:posso|podemos|vou|vamos|irei)\b/.test(t)) return true;
        return !ORIENTA_RECEPCAO.test(t);
      })
      .join("")
      .trim();
    // Linha que só tinha a orientação some; linhas em branco do texto ficam.
    return linha.trim() && !nova ? [] : [nova];
  });
  const resultado = linhas
    .join("\n")
    .split(PONTO)
    .join(".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return resultado || texto;
}

/**
 * Regra de 13/10/2026 (segunda revisão): quando a resposta seria "quem passa
 * essa informação é a recepção", a Nina não diz isso — encaminha. Devolve se
 * há essa orientação e o que sobra para enviar junto do encaminhamento: as
 * respostas que a Nina tem, sem a orientação, sem a apresentação e sem as
 * perguntas finais ("Deseja agendar…?").
 * `modalidadePerguntada` = o paciente perguntou como funciona o atendimento;
 * sem pergunta, frase de modalidade não dispara encaminhamento.
 */
export function separarOrientacaoRecepcao(
  texto: string,
  modalidadePerguntada: boolean,
): { orientaRecepcao: boolean; restante: string } {
  const protegido = (texto ?? "").replace(
    /\b(?:dra?|sra?|profa?)\./gi,
    (m) => m.slice(0, -1) + PONTO,
  );
  let orientaRecepcao = false;
  const linhas = protegido.split("\n").map((linha) => {
    if (/intelig[eê]ncia artificial/i.test(linha)) return "";
    const frases = linha.match(/[^.!?\n]+[.!?]*/g) ?? [];
    return frases
      .filter((frase) => {
        const t = normalizarRespostaInformal(frase.split(PONTO).join("."));
        // Pergunta, oferta ou promessa ("posso encaminhar…?", "vou encaminhar")
        // têm tratamento próprio; não são a orientação de procurar a recepção.
        if (frase.includes("?") || /\b(?:posso|podemos|vou|vamos|irei)\b/.test(t)) return true;
        if (!ORIENTA_RECEPCAO.test(t)) return true;
        if (ASSUNTO_MODALIDADE.test(t) && !modalidadePerguntada) return false;
        orientaRecepcao = true;
        return false;
      })
      .join("")
      .trim();
  });
  // Convites para marcar escritos como afirmação ("Caso tenha preferência, me
  // informe se deseja o primeiro horário…") também saem.
  const CONVITE =
    /\b(?:deseja|gostaria|quer|me informe|caso (?:tenha|queira|deseje)|se (?:quiser|desejar))\b[^.!?\n]*\b(?:agendar|marcar|prefer\w*|primeiro (?:horario|disponivel)|profissional)\b/;
  for (let i = 0; i < linhas.length; i++) {
    const frases = linhas[i]!.match(/[^.!?\n]+[.!?]*/g) ?? [];
    linhas[i] = frases
      .filter((f) => !CONVITE.test(normalizarRespostaInformal(f.split(PONTO).join("."))))
      .join("")
      .trim();
  }
  // Perguntas finais (oferta de agendar, "mais alguma dúvida?") saem.
  while (linhas.length) {
    const ultima = linhas[linhas.length - 1]!.trim();
    if (!ultima) {
      linhas.pop();
      continue;
    }
    if (!/\?\s*$/.test(ultima)) break;
    const semPergunta = ultima.replace(/[^.!?\n]*\?\s*$/, "").trim();
    if (semPergunta) {
      linhas[linhas.length - 1] = semPergunta;
      continue;
    }
    linhas.pop();
  }
  const restante = linhas
    .join("\n")
    .split(PONTO)
    .join(".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { orientaRecepcao, restante };
}
