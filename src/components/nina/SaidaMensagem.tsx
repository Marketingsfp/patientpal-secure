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
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  saidasDasMensagens,
  type SaidaMensagemView,
} from "@/lib/nina/saida-mensagem.functions";
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
): MapaSaidas {
  const buscar = useServerFn(saidasDasMensagens);
  const cache = useRef<Map<string, SaidaMensagemView | "falha">>(new Map());
  const [, forcar] = useState(0);
  const chave = mensagemIds.slice().sort().join(",");

  useEffect(() => {
    const ids = chave ? chave.split(",") : [];
    if (!clinicaId || ids.length === 0) return;
    const pendentes = ids.filter((id) => !cache.current.has(id));
    if (pendentes.length === 0) return;
    let ativo = true;
    void (async () => {
      try {
        const linhas = await buscar({
          data: { clinicaId, conversaId: conversaId ?? null, mensagemIds: pendentes.slice(0, 200) },
        });
        if (!ativo) return;
        for (const l of linhas) cache.current.set(l.mensagemId, l);
        // Sem linha devolvida não há registro: é ausência, não falha.
        for (const id of pendentes) {
          if (!cache.current.has(id)) {
            cache.current.set(id, {
              mensagemId: id,
              execucaoId: null,
              ambiente: "homologacao",
              classe: "sem_avaliacao",
              explicacao: EXPLICACAO_CLASSE_SAIDA.sem_avaliacao,
              limitacao: null,
              origem: null,
              textoEntregue: null,
              textoEntregueHash: null,
              motivoSubstituicao: null,
              entrega: null,
              encaminhamento: null,
              avaliacoes: [],
              score: null,
              nivel: null,
            });
          }
        }
      } catch {
        // Falha de carregamento é declarada como tal — nunca vira "não avaliada".
        for (const id of pendentes) cache.current.set(id, "falha");
      }
      if (ativo) forcar((n) => n + 1);
    })();
    return () => {
      ativo = false;
    };
  }, [buscar, chave, clinicaId, conversaId]);

  return useMemo(() => {
    const ids = chave ? chave.split(",") : [];
    const mapa: MapaSaidas = {};
    for (const id of ids) {
      const v = cache.current.get(id);
      if (v) mapa[id] = v;
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, cache.current.size, forcar]);
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
