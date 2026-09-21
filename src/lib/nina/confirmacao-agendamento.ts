import type { VagaAgendamento } from "./agendamento-escolha";

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const CURTA =
  /^(sim|isso|isso mesmo|esse mesmo|essa mesma|e isso|eh isso|claro|ok|okay|okey|beleza|blz|pode ser|pode marcar|pode agendar|pode sim|quero|quero sim|desejo|confirmo|confirmado|agendar|agende|agenda|marcar|marque|marca|vamos|bora|fechado|perfeito|por favor|sim por favor|aceito)$/;
const VOCABULARIO = new Set(
  (
    "sim isso mesmo mesma claro ok eu confirmo confirmado confirmada aceito autorizo pode ser marcar agendar finalizar concluir prosseguir continuar " +
    "o a os as um uma de da do das dos em no na nos nas com para pra por favor gentileza e esse essa esses essas este esta estes estas " +
    "todos todas dados informacoes atendimento consulta exame procedimento agendamento pre horario data dia profissional medico medica dr dra doutor doutora " +
    "meu minha esta estao correto correta corretos corretas certo certa certinho combinado fechado tudo pode"
  ).split(/\s+/),
);

/** Aceite explícito; qualificadores só valem quando conferem com a vaga do resumo.
 * A entrega do resumo e o escopo da sessão são verificados separadamente. */
export function ehConfirmacaoDeAgendamento(texto: string, vaga?: VagaAgendamento | null): boolean {
  let t = normalizar(texto ?? "");
  if (!t || t.length > 500) return false;
  t = t.replace(/\b(?:pode|podemos) (?:finalizar|concluir)\?\s*$/, "");
  if (
    /[?]/.test(t) ||
    /\b(?:nao|nem|talvez|mas|porem|se|caso|ou|ainda|outro|outra|trocar|mudar|alterar|cancelar|exceto|apenas|so)\b/.test(
      t,
    )
  )
    return false;
  if (CURTA.test(t.replace(/[,.!]/g, " ").replace(/\s+/g, " ").trim())) return true;
  if (
    !/^(?:(?:sim|isso|claro|ok)[,.!\s]+)?(?:eu\s+)?(?:confirmo|aceito|autorizo|pode\s+(?:sim\s+)?(?:marcar|agendar|finalizar|concluir)|(?:esta|estao|tudo)\s+(?:certo|correto|certinho))\b/.test(
      t,
    )
  )
    return false;
  let compativel = true;
  t = t.replace(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?)\b/g, (data) => {
    const [d, m, a] = data.split("/");
    const iso = data.includes("-")
      ? data
      : `${a ?? vaga?.data.slice(0, 4)}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    compativel &&= !!vaga && iso === vaga.data;
    return " ";
  });
  t = t.replace(
    /\b([01]?\d|2[0-3])(?:\s*:\s*([0-5]\d)|\s*h(?:\s*([0-5]\d))?)(?!\d)/g,
    (_t, h, m, mh) => {
      compativel &&= !!vaga && `${String(h).padStart(2, "0")}:${m ?? mh ?? "00"}` === vaga.hora;
      return " ";
    },
  );
  if (!compativel || /\d/.test(t)) return false;
  const permitidas = new Set(VOCABULARIO);
  if (vaga) {
    for (const palavra of normalizar(`${vaga.medico} ${vaga.procedimento ?? ""}`).split(/[^a-z]+/))
      permitidas.add(palavra);
  }
  return t
    .split(/[^a-z]+/)
    .filter(Boolean)
    .every((p) => permitidas.has(p));
}
