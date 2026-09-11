/**
 * Página do detalhamento de um card do Financeiro, aberta em nova aba.
 *
 * Não consulta o banco: desenha a tabela que a tela de origem montou e
 * entregou pelo navegador (ver `@/lib/financeiro/detalhe-aba`). Assim o
 * detalhamento é exatamente o do card clicado — com os filtros, o período e a
 * chave dos retroativos que estavam na tela naquele momento.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lerPacote, type PacoteDetalhe } from "@/lib/financeiro/detalhe-aba";
import type { Visao } from "@/lib/financeiro/detalhe-tabela";
import { DetalhamentoCorpo } from "@/components/financeiro/painel-detalhamento";

export function PaginaDetalhe({
  id,
  voltarPara,
  nomeTela,
}: {
  id: string;
  /** Tela de onde o detalhamento veio, para o link de volta. */
  voltarPara: "/app/financeiro" | "/app/financeiro/movimento";
  nomeTela: string;
}) {
  // O armazenamento do navegador só existe no cliente; por isso a leitura é
  // feita depois de montar, e não durante a renderização no servidor.
  const [estado, setEstado] = useState<{ lido: boolean; pacote: PacoteDetalhe | null }>({
    lido: false,
    pacote: null,
  });
  useEffect(() => {
    let pacote: PacoteDetalhe | null = null;
    try {
      pacote = lerPacote(id, window.localStorage, window.sessionStorage);
    } catch {
      pacote = null;
    }
    setEstado({ lido: true, pacote });
  }, [id]);

  const pacote = estado.pacote;
  useEffect(() => {
    if (pacote) document.title = `${pacote.analitico.titulo} — Financeiro`;
  }, [pacote]);

  const montar = useCallback(
    (visao: Visao) =>
      visao === "sintetico" && pacote?.sintetico ? pacote.sintetico : pacote!.analitico,
    [pacote],
  );

  if (!estado.lido) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (!pacote) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-10 text-center">
        <p className="text-base font-medium">Este detalhamento não está mais disponível.</p>
        <p className="text-sm text-muted-foreground">
          Ele abre a partir de um clique no card, e só no navegador onde o card foi clicado. Volte à
          tela de origem e clique no card de novo.
        </p>
        <Button asChild variant="outline">
          <Link to={voltarPara}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para {nomeTela}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DetalhamentoCorpo
        montar={montar}
        rotuloSintetico={pacote.rotuloSintetico}
        arquivo={pacote.arquivo}
        de={pacote.de}
        ate={pacote.ate}
        clinicaNome={pacote.clinicaNome}
        alturaTabela="max-h-[calc(100dvh-19rem)] min-h-64"
        cabecalho={(det, periodo) => (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {pacote.clinicaNome} · {nomeTela}
            </p>
            <h1 className="text-xl font-semibold">
              {det.titulo} — {periodo}
            </h1>
            <p className="text-xs text-muted-foreground">{det.explicacao}</p>
          </div>
        )}
      />
    </div>
  );
}
