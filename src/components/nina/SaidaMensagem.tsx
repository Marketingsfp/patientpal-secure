/** Leitura das mensagens para inspeção técnica, sem nota de confiança. */
import { queryOptions, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saidasDasMensagens, type SaidaMensagemView } from "@/lib/nina/saida-mensagem.functions";
import { revisaoInspecaoMensagens, type MensagemInspecao } from "@/lib/nina/inspecao-mensagem";
import { criarLimiteLeituraSaidas } from "@/lib/nina/limite-leitura-saidas";

const lerComLimite = criarLimiteLeituraSaidas(3);

export type MapaSaidas = Record<string, SaidaMensagemView | "falha">;

/**
 * Busca em lotes por conversa real, com até três consultas simultâneas.
 * O histórico de vários ciclos não é associado à conversa atualmente selecionada.
 */
export function useSaidasDasMensagens(
  clinicaId: string | null | undefined,
  conversaId: string | null | undefined,
  mensagemIds: string[],
  revisao = "",
  mensagens?: readonly MensagemInspecao[],
): MapaSaidas {
  const buscar = useServerFn(saidasDasMensagens);
  const ids = [...new Set(mensagemIds)].sort();
  const porMensagem = new Map((mensagens ?? []).map((m) => [String(m.id), m]));
  const porConversa = new Map<string | null, string[]>();
  for (const id of ids) {
    // Histórico de teste contém várias conversas. A seleção atual não é prova
    // de que uma mensagem antiga pertence àquela conversa.
    const vinculada = mensagens ? porMensagem.get(id)?.conversa_id : conversaId;
    const conversa = typeof vinculada === "string" && vinculada ? vinculada : null;
    const grupo = porConversa.get(conversa) ?? [];
    grupo.push(id);
    porConversa.set(conversa, grupo);
  }
  const grupos = [...porConversa].sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""));
  const consultas = useQueries({
    queries: grupos.map(([conversaDoGrupo, idsDoGrupo]) =>
      queryOptions({
        queryKey: [
          "nina-saidas-mensagens",
          clinicaId,
          conversaDoGrupo,
          idsDoGrupo,
          mensagens
            ? revisaoInspecaoMensagens(idsDoGrupo.map((id) => porMensagem.get(id) ?? {}))
            : revisao,
        ],
        enabled: Boolean(clinicaId && idsDoGrupo.length),
        staleTime: 10_000,
        retry: false,
        // O vínculo pode chegar depois da bolha: até quatro leituras por grupo.
        refetchInterval: (query) => {
          const dados = query.state.data;
          if (query.state.status === "error" || !dados || query.state.dataUpdateCount >= 4)
            return false;
          const linhas = Object.values(dados);
          if (linhas.some((linha) => linha === "falha")) return false;
          return linhas.some(
            (linha) =>
              linha !== "falha" && !linha.inspecionavel,
          )
            ? 1500
            : false;
        },
        queryFn: async ({ signal }): Promise<MapaSaidas> => {
          const mapa: MapaSaidas = {};
          for (let inicio = 0; inicio < idsDoGrupo.length; inicio += 200) {
            const lote = idsDoGrupo.slice(inicio, inicio + 200);
            const linhas = await lerComLimite(
              () =>
                buscar({
                  signal,
                  data: {
                    clinicaId: clinicaId!,
                    conversaId: conversaDoGrupo,
                    mensagemIds: lote,
                  },
                }),
              signal,
            );
            for (const linha of linhas) {
              if (
                linha.clinicaId === clinicaId &&
                (!conversaDoGrupo || linha.conversaId === conversaDoGrupo) &&
                lote.includes(linha.mensagemId)
              )
                mapa[linha.mensagemId] = linha;
            }
            // Ausência ou falta de acesso não comprovam ausência de avaliação.
            for (const id of lote) if (!mapa[id]) mapa[id] = "falha";
          }
          return mapa;
        },
      }),
    ),
  });
  const mapa: MapaSaidas = {};
  consultas.forEach((consulta, indice) => {
    if (consulta.isError) for (const id of grupos[indice]![1]) mapa[id] = "falha";
    else Object.assign(mapa, consulta.data ?? {});
  });
  return mapa;
}
