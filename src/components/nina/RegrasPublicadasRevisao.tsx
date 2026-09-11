/**
 * Conferência das regras derivadas ANTES de publicar.
 *
 * Mostra, para o texto em edição, exatamente o que o motor de confiabilidade
 * vai conseguir conferir — e o que NÃO vai. A leitura é determinística (sem
 * IA): nada é acrescentado ao que está escrito. Regra sem interpretação segura
 * aparece como "não interpretada / não verificada", nunca como cumprimento.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { hashDoTexto } from "@/lib/nina/confidence/hash";
import { revisarRegrasDoTexto, type RegraPublicada } from "@/lib/nina/confidence/regras-publicadas";

const ROTULO_VERIFICACAO: Record<RegraPublicada["verificacao"], string> = {
  literal: "texto exigido (conferido automaticamente)",
  proibicao_de_conteudo: "proibição de conteúdo (conferida automaticamente)",
  semantica: "linguagem aberta (não conferida automaticamente)",
  nao_interpretada: "não interpretada / não verificada",
};

const ROTULO_LIMITACAO: Record<string, string> = {
  REGRA_PUBLICADA_NAO_INTERPRETADA:
    "Há regra escrita que não pôde ser interpretada com segurança — ela não será conferida.",
  REGRA_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA_AUTOMATICAMENTE:
    "Há regra de linguagem aberta — depende de revisão humana, não é conferida automaticamente.",
  CONDICAO_SEM_VALOR_DECLARADO:
    "Há uma condição escrita sem o valor logo abaixo — ela foi ignorada.",
};

function condicaoLegivel(r: RegraPublicada): string {
  if (r.condicao.tipo === "sempre") return "sempre";
  const como = r.condicao.tipo === "mensagem_exata" ? "mensagem exatamente" : "mensagem contém";
  return `${como}: ${r.condicao.valor}`;
}

export function RegrasPublicadasRevisao({ texto, escopo }: { texto: string; escopo: string }) {
  const revisao = useMemo(
    () => revisarRegrasDoTexto(texto, escopo, hashDoTexto(texto)),
    [texto, escopo],
  );

  return (
    <div className="rounded-md border p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-medium">Regras lidas deste texto ({revisao.regras.length})</p>
        <Badge variant="secondary">{revisao.verificaveis} conferíveis</Badge>
        {revisao.naoVerificaveis > 0 ? (
          <Badge variant="outline">{revisao.naoVerificaveis} dependem de revisão humana</Badge>
        ) : null}
      </div>

      {revisao.regras.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma regra foi reconhecida neste texto. Nada será conferido automaticamente.
        </p>
      ) : (
        <ul className="space-y-2">
          {revisao.regras.map((r) => (
            <li key={r.id} className="rounded border p-2">
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant={r.natureza === "proibicao" ? "destructive" : "secondary"}>
                  {r.natureza === "proibicao" ? "proibição" : "exigência"}
                </Badge>
                <Badge variant="outline">prioridade {r.prioridade}</Badge>
                <Badge variant="outline">
                  {r.ambiente === "qualquer" ? "todos os ambientes" : r.ambiente}
                </Badge>
                <Badge variant="outline">quando: {condicaoLegivel(r)}</Badge>
              </div>
              <p className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{r.trecho}</p>
              <p className="mt-1 text-muted-foreground">
                Verificação: {ROTULO_VERIFICACAO[r.verificacao]}
                {r.literal ? ` — texto exigido: "${r.literal}"` : ""}
                {r.proibicoes.length > 0 ? ` — proíbe: ${r.proibicoes.join(", ")}` : ""}
                {` — linhas ${r.linhaInicio}–${r.linhaFim}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {revisao.limitacoes.length > 0 ? (
        <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2">
          <p className="font-medium">Limitações desta publicação</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {revisao.limitacoes.map((l) => (
              <li key={l}>{ROTULO_LIMITACAO[l] ?? l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
