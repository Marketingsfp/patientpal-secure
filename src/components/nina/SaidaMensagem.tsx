/**
 * SELO E DETALHES DE CADA BOLHA DA NINA.
 *
 * A porcentagem só aparece quando existe avaliação do conteúdo DAQUELA
 * mensagem. Aviso do sistema, mensagem sem avaliação, texto alterado depois da
 * avaliação e falha de carregamento têm cada um seu selo e seu motivo escrito.
 *
 * Os detalhes usam o vínculo real gravado (execução, entrega, encaminhamento)
 * — nunca associação por horário ou por semelhança de texto.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { saidasDasMensagens, type SaidaMensagemView } from "@/lib/nina/saida-mensagem.functions";
import {
  EXPLICACAO_CLASSE_SAIDA,
  ROTULO_CLASSE_SAIDA,
  podeExibirPorcentagem,
  type ClasseSaida,
} from "@/lib/nina/confidence/classificacao-saida";

export type MapaSaidas = Record<string, SaidaMensagemView | "falha">;

/**
 * Busca em UM lote o que cada bolha é. O resultado vem do banco, então a tela
 * mostra a mesma coisa depois de atualizar a página.
 */
export function useSaidasDasMensagens(
  clinicaId: string | null | undefined,
  conversaId: string | null | undefined,
  mensagemIds: string[],
  revisao = "",
): MapaSaidas {
  const buscar = useServerFn(saidasDasMensagens);
  const ids = [...new Set(mensagemIds)].sort();
  const consulta = useQuery({
    queryKey: ["nina-saidas-mensagens", clinicaId, conversaId ?? null, ids, revisao],
    enabled: Boolean(clinicaId && ids.length),
    staleTime: 10_000,
    retry: false,
    // A bolha pode ser gravada antes do aviso/avaliação, sem novo UPDATE na
    // mensagem. Confere essa janela curta até 4 vezes por chave e encerra.
    refetchInterval: (query) => {
      const dados = query.state.data;
      if (query.state.status === "error" || !dados || query.state.dataUpdateCount >= 4)
        return false;
      const linhas = Object.values(dados);
      if (linhas.some((linha) => linha === "falha")) return false;
      return linhas.some(
        (linha) => linha !== "falha" && (!linha.inspecionavel || linha.classe === "sem_avaliacao"),
      )
        ? 1500
        : false;
    },
    queryFn: async (): Promise<MapaSaidas> => {
      const mapa: MapaSaidas = {};
      for (let inicio = 0; inicio < ids.length; inicio += 200) {
        const lote = ids.slice(inicio, inicio + 200);
        const linhas = await buscar({
          data: { clinicaId: clinicaId!, conversaId: conversaId ?? null, mensagemIds: lote },
        });
        for (const linha of linhas) {
          if (
            linha.clinicaId === clinicaId &&
            (!conversaId || linha.conversaId === conversaId) &&
            lote.includes(linha.mensagemId)
          )
            mapa[linha.mensagemId] = linha;
        }
        // Mensagem ausente/inacessível não comprova que ela não foi avaliada.
        for (const id of lote) if (!mapa[id]) mapa[id] = "falha";
      }
      return mapa;
    },
  });
  if (consulta.isError) return Object.fromEntries(ids.map((id) => [id, "falha" as const]));
  return consulta.data ?? {};
}
const ESTILO_CLASSE: Record<ClasseSaida, string> = {
  resposta_avaliada: "border-border/60 text-muted-foreground",
  aviso_operacional: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  sem_avaliacao: "border-border/60 text-muted-foreground",
  texto_alterado: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  falha_ao_carregar: "border-destructive/40 text-destructive",
};

const ESTILO_NIVEL: Record<string, string> = {
  HIGH: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  LOW: "border-destructive/30 bg-destructive/10 text-destructive",
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}

/** Selo da bolha + "Detalhes técnicos", inclusive para avisos do sistema. */
export function SaidaMensagemBadge({ saida }: { saida: SaidaMensagemView | "falha" | undefined }) {
  const [aberto, setAberto] = useState(false);

  if (!saida) {
    return (
      <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-border/60 px-1.5 text-[10px] leading-none text-muted-foreground">
        …
      </span>
    );
  }

  const falhou = saida === "falha";
  const classe: ClasseSaida = falhou ? "falha_ao_carregar" : saida.classe;
  const dados = falhou ? null : saida;
  const mostraNota = !falhou && podeExibirPorcentagem(classe) && dados?.score != null;
  const estilo = mostraNota
    ? (ESTILO_NIVEL[dados!.nivel ?? "LOW"] ?? ESTILO_CLASSE.resposta_avaliada)
    : ESTILO_CLASSE[classe];
  const explicacao = falhou ? EXPLICACAO_CLASSE_SAIDA.falha_ao_carregar : dados!.explicacao;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${ROTULO_CLASSE_SAIDA[classe]} — ${explicacao}`}
          aria-label={`${ROTULO_CLASSE_SAIDA[classe]}. ${explicacao} Ver detalhes técnicos.`}
          className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium leading-none ${estilo}`}
        >
          {mostraNota ? `${dados!.score}/100` : ROTULO_CLASSE_SAIDA[classe]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-80 space-y-2 overflow-y-auto text-xs">
        <Secao titulo="Situação desta mensagem">
          <p className="font-medium">{ROTULO_CLASSE_SAIDA[classe]}</p>
          <p className="text-muted-foreground">{explicacao}</p>
          {!falhou && dados!.limitacao && (
            <p className="text-muted-foreground">{dados!.limitacao}</p>
          )}
        </Secao>
        {falhou ? null : (
          <>
            <Secao titulo="Origem da mensagem">
              <p className="text-muted-foreground">{dados!.origem ?? "Não registrada"}</p>
            </Secao>
            <Secao titulo="Texto final entregue">
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-2 text-[10px]">
                {dados!.textoEntregue ?? "—"}
              </pre>
              <p className="text-[10px] text-muted-foreground">
                Impressão digital: {dados!.textoEntregueHash ?? "—"}
              </p>
            </Secao>
            {dados!.motivoSubstituicao && (
              <Secao titulo="Motivo da substituição">
                <p className="text-muted-foreground">{dados!.motivoSubstituicao}</p>
              </Secao>
            )}
            <Secao titulo="Avaliações registradas neste atendimento">
              {dados!.avaliacoes.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma avaliação registrada.</p>
              ) : (
                <ul className="space-y-0.5 text-muted-foreground">
                  {dados!.avaliacoes.map((a, i) => (
                    <li key={a.decisaoId ?? i}>
                      {a.score ?? "—"}/100 · {a.nivel ?? "—"} ·{" "}
                      {a.representacao ?? "texto_completo"} ·{" "}
                      {a.desteTexto ? "deste texto" : "de outro texto"} · conteúdo{" "}
                      {a.textoHash ?? "sem impressão digital"}
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
            {dados!.encaminhamento && (
              <Secao titulo="Encaminhamento">
                <p className="text-muted-foreground">
                  Protocolo {dados!.encaminhamento.protocolo ?? "não registrado"} ·{" "}
                  {dados!.encaminhamento.estadoRotulo}
                </p>
              </Secao>
            )}
            <Secao titulo="Entrega">
              <p className="text-muted-foreground">
                Ambiente: {dados!.ambiente === "homologacao" ? "Homologação" : "Produção"} ·{" "}
                {dados!.entrega?.estado ?? "Estado não registrado"}
                {dados!.entrega?.representacao ? ` · ${dados!.entrega.representacao}` : ""}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Atendimento: {dados!.execucaoId ?? "não vinculado"}
              </p>
            </Secao>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
