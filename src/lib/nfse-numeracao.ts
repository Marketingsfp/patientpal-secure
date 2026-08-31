/**
 * Numeração da DPS (o número sequencial da NFS-e no Ambiente Nacional).
 *
 * Vive fora de `nfse.functions.ts` para poder ser testada: as duas funções
 * recebem o cliente do banco por parâmetro, então o teste passa um cliente de
 * mentira e simula duas emissões disputando o mesmo número.
 */

export type SupabaseAdmin =
  (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/**
 * Reserva, só para esta emissão, o próximo número de DPS do emitente.
 *
 * Por que não basta ler o contador e gravar contador+1: em 31/08/2026 três
 * notas foram recusadas com E0014 ("esse número já existe") porque duas
 * recepcionistas clicaram em emitir no MESMO SEGUNDO. As duas emissões leram
 * o contador em 8540, as duas gravaram 8541, e as duas mandaram a DPS 8540 —
 * a prefeitura ficou com a primeira e recusou a segunda. Com 250 notas por dia
 * e três pessoas emitindo ao mesmo tempo, essa fresta entre ler e gravar era
 * atingida algumas vezes ao dia.
 *
 * Aqui a gravação é condicional: "suba de 8540 para 8541 SOMENTE se ainda
 * estiver em 8540". Quem chega depois não casa a condição, não grava nada,
 * relê o contador e leva o número seguinte. Duas emissões simultâneas nunca
 * recebem o mesmo número, e isso vale mesmo entre servidores diferentes,
 * porque quem decide o empate é o banco.
 *
 * Não substitui a repescagem do E0014: o contador local pode estar atrás da
 * prefeitura por causa de notas emitidas fora do sistema. Ele resolve a
 * colisão entre duas emissões nossas, que é a causa dos casos de 31/08.
 */
export async function reservarNumeroDps(
  supabaseAdmin: SupabaseAdmin,
  emitenteId: string,
  numeroLido: number,
): Promise<number> {
  const MAX_TENTATIVAS = 25;
  let candidato = Number.isFinite(numeroLido) && numeroLido > 0 ? Math.trunc(numeroLido) : 1;

  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    const { data: reservou } = await supabaseAdmin
      .from("nfse_emitentes")
      .update({ rps_proximo_numero: candidato + 1 })
      .eq("id", emitenteId)
      .eq("rps_proximo_numero", candidato)
      .select("rps_proximo_numero")
      .maybeSingle();
    if (reservou) return candidato;

    // Outra emissão levou este número. Relê o contador e tenta o atual.
    const { data: atual } = await supabaseAdmin
      .from("nfse_emitentes")
      .select("rps_proximo_numero")
      .eq("id", emitenteId)
      .maybeSingle();
    const lido = Number(atual?.rps_proximo_numero);
    candidato = Number.isFinite(lido) && lido > candidato ? Math.trunc(lido) : candidato + 1;
  }

  throw new Error(
    "Não foi possível reservar o número da NFS-e (o contador do emitente está sendo disputado). Tente emitir de novo em alguns segundos.",
  );
}

/**
 * Avança o contador do emitente para `novoProximo`, mas **nunca para trás**.
 *
 * A repescagem do E0014 sobe o número tentativa a tentativa e, no fim, grava
 * onde parou. Gravar esse valor direto podia DESFAZER o avanço de uma emissão
 * paralela que já tinha ido mais longe — e aí o número recuava e voltava a
 * colidir. A condição `lt` faz a gravação só valer quando ela realmente
 * adianta o contador.
 */
export async function avancarContadorDps(
  supabaseAdmin: SupabaseAdmin,
  emitenteId: string,
  novoProximo: number,
) {
  await supabaseAdmin
    .from("nfse_emitentes")
    .update({ rps_proximo_numero: novoProximo })
    .eq("id", emitenteId)
    .lt("rps_proximo_numero", novoProximo);
}
