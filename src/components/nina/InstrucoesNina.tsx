/**
 * Seção "Instruções da Nina" (abaixo do canvas da Arquitetura).
 *
 * FASE 2: só leitura da fonte persistente + gravação de RASCUNHO.
 * Nada aqui altera o comportamento da Nina: o atendimento continua usando o
 * texto do código. O conteúdo NUNCA é duplicado no frontend — vem do banco.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ESCOPOS,
  ROTULO_ESCOPO,
  carregarInstrucoesNina,
  salvarRascunhoInstrucoes,
  type EscopoInstrucoes,
  type InstrucoesEscopo,
} from "@/lib/nina/instrucoes.functions";

export function InstrucoesNina() {
  const carregar = useServerFn(carregarInstrucoesNina);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["nina-instrucoes"],
    queryFn: () => carregar(),
  });
  const [escopo, setEscopo] = useState<EscopoInstrucoes>("whatsapp");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Instruções da Nina</CardTitle>
        <Badge variant="outline">Rascunho não muda o atendimento</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando as instruções…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar as instruções agora.
          </p>
        ) : (
          <Tabs value={escopo} onValueChange={(v) => setEscopo(v as EscopoInstrucoes)}>
            <TabsList>
              {ESCOPOS.map((e) => (
                <TabsTrigger key={e} value={e}>
                  {ROTULO_ESCOPO[e]}
                </TabsTrigger>
              ))}
            </TabsList>
            {(data ?? []).map((bloco) => (
              <TabsContent key={bloco.escopo} value={bloco.escopo} className="mt-4">
                <Editor
                  bloco={bloco}
                  onSalvo={() => queryClient.invalidateQueries({ queryKey: ["nina-instrucoes"] })}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function Editor({ bloco, onSalvo }: { bloco: InstrucoesEscopo; onSalvo: () => void }) {
  const base = bloco.rascunho ?? bloco.publicada;
  const [texto, setTexto] = useState(base?.conteudo ?? "");

  // Recarrega o campo quando a fonte persistente muda (troca de aba/refetch).
  useEffect(() => {
    setTexto(base?.conteudo ?? "");
  }, [base?.id, base?.conteudo]);

  const salvarFn = useServerFn(salvarRascunhoInstrucoes);
  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { escopo: bloco.escopo, conteudo: texto } }),
    onSuccess: () => {
      toast.success("Rascunho salvo. A Nina continua respondendo como antes.");
      onSalvo();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho."),
  });

  const alterado = texto !== (base?.conteudo ?? "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Versão publicada:</span>
        <Badge variant="secondary">
          {bloco.publicada ? `v${bloco.publicada.versao}` : "nenhuma"}
        </Badge>
        <span className="text-muted-foreground">Status:</span>
        <Badge variant="outline">{bloco.publicada ? "Ativa" : "Sem versão ativa"}</Badge>
        {bloco.rascunho ? (
          <Badge variant="outline">Rascunho v{bloco.rascunho.versao} em edição</Badge>
        ) : null}
      </div>

      <label className="sr-only" htmlFor={`instrucoes-${bloco.escopo}`}>
        Instruções da Nina — {ROTULO_ESCOPO[bloco.escopo]}
      </label>
      <Textarea
        id={`instrucoes-${bloco.escopo}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        spellCheck={false}
        className="min-h-[520px] resize-y overflow-auto whitespace-pre font-mono text-xs leading-relaxed"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending || !alterado || texto.trim().length === 0}
        >
          {salvar.isPending ? "Salvando…" : "Salvar rascunho"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Salvar guarda apenas um rascunho. A publicação ainda não está disponível — o atendimento
          segue usando a versão que está no sistema hoje.
        </p>
      </div>
    </div>
  );
}
