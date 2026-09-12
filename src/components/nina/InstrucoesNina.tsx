/**
 * Seção "Instruções da Nina" (abaixo do canvas da Arquitetura).
 *
 * FASE 3: rascunho + publicação versionada + histórico + comparação + restauração.
 * Publicar cria SEMPRE uma versão nova; a anterior é arquivada, nunca apagada.
 *
 * FASE 3 (backend) + FASE 4 (interface): a versão PUBLICADA no escopo
 * "whatsapp" é a ÚNICA fonte de comportamento conversacional da Nina do
 * WhatsApp. Nenhuma outra tela edita comportamento. A auditoria abaixo mostra,
 * somente leitura, o que de fato chega ao modelo e de onde cada parte vem.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { RegrasPublicadasRevisao } from "@/components/nina/RegrasPublicadasRevisao";
import { IdentidadeAtendimentoCampos } from "@/components/nina/IdentidadeAtendimentoCampos";
import { validarIdentidadeParaPublicacao } from "@/lib/nina/identidade-atendimento";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ESCOPOS,
  ROTULO_ESCOPO,
  carregarInstrucoesNina,
  historicoInstrucoesNina,
  publicarInstrucoesNina,
  salvarRascunhoInstrucoes,
  type EscopoInstrucoes,
  type InstrucoesEscopo,
  type VersaoHistorico,
} from "@/lib/nina/instrucoes.functions";
import { apenasMudancas, compararTextos, resumoDiff } from "@/lib/nina/instrucoes-diff";
import { previewRequestNina } from "@/lib/nina/prompt-preview.functions";


const ROTULO_STATUS: Record<string, string> = {
  publicada: "Atual",
  rascunho: "Rascunho",
  arquivada: "Versão anterior",
};

function dataBr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function InstrucoesNina({
  clinicaId,
  podeEditar,
  podePublicar,
  podeHistorico,
}: {
  clinicaId: string;
  /** FASE 7 — quem só visualiza não pode salvar rascunho. */
  podeEditar: boolean;
  /** FASE 7 — publicar é separado de editar. */
  podePublicar: boolean;
  podeHistorico: boolean;
}) {
  const carregar = useServerFn(carregarInstrucoesNina);
  const { data, isLoading, error } = useQuery({
    queryKey: ["nina-instrucoes", clinicaId],
    queryFn: () => carregar({ data: { clinicaId } }),
    enabled: !!clinicaId,
  });
  const [escopo, setEscopo] = useState<EscopoInstrucoes>("whatsapp");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Instruções da Nina</CardTitle>
        <Badge variant="outline">Publicar cria uma versão nova</Badge>
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
                  clinicaId={clinicaId}
                  podeEditar={podeEditar}
                  podePublicar={podePublicar}
                  podeHistorico={podeHistorico}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function Editor({
  bloco,
  clinicaId,
  podeEditar,
  podePublicar,
  podeHistorico,
}: {
  bloco: InstrucoesEscopo;
  clinicaId: string;
  podeEditar: boolean;
  podePublicar: boolean;
  podeHistorico: boolean;
}) {
  const queryClient = useQueryClient();
  const base = bloco.rascunho ?? bloco.publicada;
  const [texto, setTexto] = useState(base?.conteudo ?? "");
  const [comentario, setComentario] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  useEffect(() => {
    setTexto(base?.conteudo ?? "");
  }, [base?.id, base?.conteudo]);

  const atualizar = () => {
    queryClient.invalidateQueries({ queryKey: ["nina-instrucoes", clinicaId] });
    queryClient.invalidateQueries({ queryKey: ["nina-instrucoes-historico", bloco.escopo] });
    // FASE 3 — publicar/restaurar precisa refazer a prévia sem recarregar a
    // aplicação. A chave leva clínica/escopo/contexto/versão, então
    // invalidamos pelo prefixo.
    queryClient.invalidateQueries({ queryKey: ["nina-prompt-preview"] });
  };

  const salvarFn = useServerFn(salvarRascunhoInstrucoes);
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          clinicaId,
          escopo: bloco.escopo,
          conteudo: texto,
          comentario: comentario || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Rascunho salvo. A Nina continua respondendo como antes.");
      atualizar();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho."),
  });

  const publicarFn = useServerFn(publicarInstrucoesNina);
  const publicar = useMutation({
    mutationFn: (entrada: { conteudo: string; comentario?: string; restauradaDe?: number }) =>
      publicarFn({
        data: {
          clinicaId,
          escopo: bloco.escopo,
          conteudo: entrada.conteudo,
          comentario: entrada.comentario,
          restauradaDe: entrada.restauradaDe ?? null,
        },
      }),
    onSuccess: (nova) => {
      toast.success(`Versão v${nova.versao} publicada. A versão anterior foi guardada.`);
      setComentario("");
      atualizar();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar as instruções."),
  });

  const [auditoriaAberta, setAuditoriaAberta] = useState(false);
  const alterado = texto !== (base?.conteudo ?? "");
  const vazio = texto.trim().length === 0;
  // FASE 1 — bloco de identidade duplicado/incompleto reprova a publicação
  // antes de sair da tela. Bloco ausente não bloqueia: fica como pendência.
  const identidade = useMemo(
    () =>
      bloco.escopo === "whatsapp"
        ? validarIdentidadeParaPublicacao(texto)
        : ({ ok: true, identidade: null, pendente: false } as const),
    [bloco.escopo, texto],
  );
  const identidadeInvalida = !identidade.ok;


  return (
    <div className="space-y-3">
      {bloco.escopo === "whatsapp" ? (
        <p className="text-xs text-muted-foreground">
          Única fonte de comportamento da Nina do WhatsApp — vale para todas as clínicas.
        </p>
      ) : null}

      {/* FASE 3 — três coisas diferentes, cada uma com o seu texto. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border p-2 text-xs">
          <p className="font-medium">Rascunho (em edição)</p>
          <p className="text-muted-foreground">
            {bloco.rascunho
              ? `v${bloco.rascunho.versao} — é o texto da caixa abaixo. Não está em uso.`
              : "Nenhum rascunho salvo. A caixa abaixo mostra a versão publicada."}
          </p>
        </div>
        <div className="rounded-md border p-2 text-xs">
          <p className="font-medium">Publicada (em uso agora)</p>
          <p className="text-muted-foreground">
            {bloco.publicada
              ? `v${bloco.publicada.versao} — publicada em ${dataBr(bloco.publicada.publicado_em)}.`
              : "Nenhuma versão publicada."}
            {bloco.escopo === "whatsapp" ? " Alcance: todas as clínicas." : ""}
          </p>
        </div>
        <div className="rounded-md border p-2 text-xs">
          <p className="font-medium">Usada nesta resposta</p>
          <p className="text-muted-foreground">
            Depende de cada mensagem. Abra a execução da mensagem (Homologação ou rastreamento) —
            uma resposta antiga continua mostrando a versão dela.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">
          {bloco.publicada ? `Publicada: v${bloco.publicada.versao}` : "nenhuma publicada"}
        </Badge>
        {bloco.rascunho ? (
          <Badge variant="outline">Rascunho v{bloco.rascunho.versao} — não está em uso</Badge>
        ) : null}
      </div>


      {bloco.escopo === "whatsapp" ? (
        <IdentidadeAtendimentoCampos
          texto={texto}
          onTextoChange={setTexto}
          somenteLeitura={!podeEditar}
        />
      ) : null}

      <label className="sr-only" htmlFor={`instrucoes-${bloco.escopo}`}>
        Instruções da Nina — {ROTULO_ESCOPO[bloco.escopo]}
      </label>
      <Textarea
        id={`instrucoes-${bloco.escopo}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        readOnly={!podeEditar}
        spellCheck={false}
        className="min-h-[520px] resize-y overflow-auto whitespace-pre font-mono text-xs leading-relaxed"
      />

      <RegrasPublicadasRevisao texto={texto} escopo={bloco.escopo} />

      <Input
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={500}
        placeholder="Comentário desta alteração (opcional) — aparece no histórico"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => salvar.mutate()}
          disabled={!podeEditar || salvar.isPending || !alterado || vazio}
        >
          {salvar.isPending ? "Salvando…" : "Salvar rascunho"}
        </Button>
        <Button
          onClick={() => setConfirmando(true)}
          disabled={!podePublicar || publicar.isPending || vazio || identidadeInvalida}
        >
          {publicar.isPending ? "Publicando…" : "Publicar instruções"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setHistoricoAberto(true)}
          disabled={!podeHistorico}
        >
          Histórico de versões
        </Button>
        {bloco.escopo === "whatsapp" ? (
          <Button variant="ghost" onClick={() => setAuditoriaAberta(true)}>
            Ver prévia com contexto de exemplo
          </Button>
        ) : null}
      </div>

      {bloco.escopo === "whatsapp" ? (
        <AuditoriaPrompt
          clinicaId={clinicaId}
          aberto={auditoriaAberta}
          onOpenChange={setAuditoriaAberta}
          versaoPublicada={bloco.publicada?.versao ?? null}
          // FASE 4 — com alteração não publicada, a prévia mostra o rascunho
          // em edição e diz isso; nada é publicado por abrir a prévia.
          conteudoRascunho={alterado ? texto : null}
        />
      ) : null}


      {!podePublicar ? (
        <p className="text-xs text-muted-foreground">
          {podeEditar
            ? "Seu acesso permite salvar rascunho, mas não publicar. A publicação é feita por um administrador."
            : "Seu acesso é somente de leitura nas Instruções da Nina."}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Digitar e salvar rascunho não muda o atendimento. Publicar guarda a versão anterior e cria
        uma nova — nenhuma versão é apagada.
      </p>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar esta nova versão das instruções da Nina?</AlertDialogTitle>
            <AlertDialogDescription>
              As próximas execuções da Nina passarão a utilizar essas instruções.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => publicar.mutate({ conteudo: texto, comentario: comentario || undefined })}
            >
              Publicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HistoricoVersoes
        clinicaId={clinicaId}
        podeRestaurar={podePublicar}
        escopo={bloco.escopo}
        aberto={historicoAberto}
        onOpenChange={setHistoricoAberto}
        atualTexto={bloco.publicada?.conteudo ?? ""}
        restaurando={publicar.isPending}
        onRestaurar={(versao) =>
          publicar.mutate({
            conteudo: versao.conteudo,
            comentario: `Restauração do conteúdo da v${versao.versao}.`,
            restauradaDe: versao.versao,
          })
        }
      />
    </div>
  );
}

function HistoricoVersoes({
  clinicaId,
  podeRestaurar,
  escopo,
  aberto,
  onOpenChange,
  atualTexto,
  restaurando,
  onRestaurar,
}: {
  clinicaId: string;
  podeRestaurar: boolean;
  escopo: EscopoInstrucoes;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  atualTexto: string;
  restaurando: boolean;
  onRestaurar: (versao: VersaoHistorico) => void;
}) {
  const buscar = useServerFn(historicoInstrucoesNina);
  const { data: versoes, isLoading } = useQuery({
    queryKey: ["nina-instrucoes-historico", escopo],
    queryFn: () => buscar({ data: { clinicaId, escopo } }),
    enabled: aberto,
  });

  const [selecionada, setSelecionada] = useState<VersaoHistorico | null>(null);
  const [comparandoCom, setComparandoCom] = useState<VersaoHistorico | null>(null);
  const [confirmarRestauro, setConfirmarRestauro] = useState<VersaoHistorico | null>(null);

  const lista = versoes ?? [];
  const atual = lista.find((v) => v.status === "publicada") ?? null;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de versões — {ROTULO_ESCOPO[escopo]}</DialogTitle>
          <DialogDescription>
            Todas as versões ficam guardadas. Restaurar uma versão antiga cria uma versão nova, sem
            apagar as demais.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando o histórico…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma versão registrada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {lista.map((v) => (
              <li key={v.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">v{v.versao}</span>
                  <Badge variant={v.status === "publicada" ? "secondary" : "outline"}>
                    {ROTULO_STATUS[v.status] ?? v.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {dataBr(v.publicado_em ?? v.created_at)} · {v.autor ?? "responsável não registrado"}
                  </span>
                </div>
                {v.comentario ? <p className="mt-1 text-muted-foreground">{v.comentario}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelecionada(v)}>
                    Ver conteúdo
                  </Button>
                  {atual && v.id !== atual.id ? (
                    <Button size="sm" variant="outline" onClick={() => setComparandoCom(v)}>
                      Comparar com v{atual.versao}
                    </Button>
                  ) : null}
                  {v.status !== "publicada" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={restaurando || !podeRestaurar}
                      onClick={() => setConfirmarRestauro(v)}
                    >
                      Restaurar como nova versão
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Leitura de uma versão antiga */}
        <Dialog open={!!selecionada} onOpenChange={(o) => !o && setSelecionada(null)}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Versão v{selecionada?.versao} — somente leitura</DialogTitle>
              <DialogDescription>
                {dataBr(selecionada?.publicado_em ?? selecionada?.created_at ?? null)} ·{" "}
                {selecionada?.autor ?? "responsável não registrado"}
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
              {selecionada?.conteudo}
            </pre>
          </DialogContent>
        </Dialog>

        {/* Comparação */}
        <Dialog open={!!comparandoCom} onOpenChange={(o) => !o && setComparandoCom(null)}>
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Comparação: v{comparandoCom?.versao} ↔ v{atual?.versao} (atual)
              </DialogTitle>
              <DialogDescription>
                Em verde o que foi acrescentado, em vermelho o que saiu, em amarelo o que mudou.
              </DialogDescription>
            </DialogHeader>
            {comparandoCom ? (
              <Comparacao antes={comparandoCom.conteudo} depois={atualTexto} />
            ) : null}
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!confirmarRestauro}
          onOpenChange={(o) => !o && setConfirmarRestauro(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Restaurar o conteúdo da v{confirmarRestauro?.versao} como nova versão?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Uma versão nova será criada com esse conteúdo e passará a ser a atual. As versões
                anteriores continuam guardadas no histórico.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmarRestauro) onRestaurar(confirmarRestauro);
                  setConfirmarRestauro(null);
                }}
              >
                Restaurar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Comparacao({ antes, depois }: { antes: string; depois: string }) {
  const linhas = useMemo(() => compararTextos(antes, depois), [antes, depois]);
  const resumo = useMemo(() => resumoDiff(linhas), [linhas]);
  const visiveis = useMemo(() => apenasMudancas(linhas), [linhas]);

  if (resumo.adicionadas + resumo.removidas + resumo.alteradas === 0) {
    return <p className="text-sm text-muted-foreground">As duas versões têm o mesmo conteúdo.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{resumo.adicionadas} linha(s) acrescentada(s)</Badge>
        <Badge variant="outline">{resumo.removidas} linha(s) removida(s)</Badge>
        <Badge variant="outline">{resumo.alteradas} linha(s) alterada(s)</Badge>
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-md border font-mono text-xs">
        {visiveis.map((l, i) => {
          if (l.tipo === "igual") {
            return (
              <div key={i} className="px-3 py-0.5 text-muted-foreground whitespace-pre-wrap">
                {l.antes}
              </div>
            );
          }
          if (l.tipo === "alterada") {
            return (
              <div key={i} className="border-l-2 border-l-[var(--chart-4)] bg-[color-mix(in_oklch,var(--chart-4)_14%,transparent)] px-3 py-0.5">
                <div className="whitespace-pre-wrap line-through opacity-70">{l.antes}</div>
                <div className="whitespace-pre-wrap">{l.depois}</div>
              </div>
            );
          }
          if (l.tipo === "removida") {
            return (
              <div
                key={i}
                className="border-l-2 border-l-destructive bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] px-3 py-0.5 whitespace-pre-wrap line-through opacity-80"
              >
                {l.antes}
              </div>
            );
          }
          return (
            <div
              key={i}
              className="border-l-2 border-l-primary bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] px-3 py-0.5 whitespace-pre-wrap"
            >
              {l.depois}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * FASE 3 — PRÉVIA COM CONTEXTO DE EXEMPLO (somente leitura).
 *
 * Mostra a versão PUBLICADA montada com um atendimento fictício. Não é o
 * registro de nenhuma resposta real: para saber o que gerou uma resposta
 * específica, abra a execução daquela mensagem.
 */
function AuditoriaPrompt({
  clinicaId,
  aberto,
  onOpenChange,
  versaoPublicada,
  conteudoRascunho,
}: {
  clinicaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  versaoPublicada: number | null;
  conteudoRascunho?: string | null;
}) {
  const buscar = useServerFn(previewRequestNina);
  const { data, isLoading, error } = useQuery({
    // A chave distingue clínica, escopo, contexto e a versão publicada
    // conhecida pela tela: publicar troca a chave e a prévia se refaz.
    queryKey: [
      "nina-prompt-preview",
      clinicaId,
      "whatsapp",
      "exemplo",
      versaoPublicada,
      conteudoRascunho ?? null,
    ],
    queryFn: () =>
      buscar({
        data: conteudoRascunho ? { clinicaId, conteudoRascunho } : { clinicaId },
      }),
    enabled: aberto,
  });
  const [verDiferencas, setVerDiferencas] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prévia com contexto de exemplo — Nina do WhatsApp</DialogTitle>
          <DialogDescription>
            Somente leitura, com um atendimento fictício. Não é o registro de uma resposta real: o
            que foi usado em uma resposta específica aparece na execução daquela mensagem.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Montando a visualização…</p>
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground">Não foi possível montar a visualização.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">
                Comportamento: Arquitetura v{data.versao ?? "—"}
              </Badge>
              {data.alcanceGlobal ? (
                <Badge variant="outline">Vale para todas as clínicas</Badge>
              ) : null}
              <Badge variant="outline">Contexto de exemplo</Badge>
              <Badge variant={data.fonteConteudo === "rascunho" ? "destructive" : "outline"}>
                {data.fonteConteudo === "rascunho"
                  ? "Rascunho em edição (não publicado)"
                  : data.fonteConteudo === "publicada"
                    ? "Versão publicada"
                    : "Texto do código"}
              </Badge>
              {data.publicadoEm ? (
                <span className="text-xs text-muted-foreground">
                  publicada em {dataBr(data.publicadoEm)}
                </span>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setVerDiferencas((v) => !v)}>
                {verDiferencas ? "Ocultar diferenças" : "Ver diferenças"}
              </Button>
            </div>

            {data.origemTemplate === "codigo" ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                Nenhuma versão publicada foi lida: o texto abaixo é o do código, usado como
                alternativa. Não trate isto como a versão publicada.
              </p>
            ) : null}
            {data.marcadorPendente ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                O marcador <code>{data.marcadorPendente}</code> ficaria sem substituição.
              </p>
            ) : null}

            {verDiferencas ? (
              <section className="space-y-1">
                <h4 className="text-sm font-medium">
                  Texto publicado ↔ texto com os dados preenchidos
                </h4>
                <p className="text-xs text-muted-foreground">
                  Mostra apenas a substituição de variáveis (nome da unidade, por exemplo).
                </p>
                <Comparacao antes={data.template} depois={data.behaviorPrompt} />
              </section>
            ) : null}

            <section className="rounded-lg border p-3 text-sm">
              <h4 className="mb-1 font-medium">Identidade do atendimento nesta prévia</h4>
              {data.identidade.ok ? (
                <p className="text-muted-foreground">
                  Atendente <strong>{data.identidade.assistente}</strong> ·{" "}
                  {data.identidade.tipoEstabelecimento}{" "}
                  <strong>{data.identidade.estabelecimento}</strong> · origem:{" "}
                  {data.fonteConteudo}
                </p>
              ) : (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                  {data.identidade.pendenciaAdministrativa ??
                    "Sem identidade válida: o atendimento responderia sem citar nomes."}
                </p>
              )}
            </section>

            <BlocoLeitura
              titulo="Contrato de precedência do turno"
              origem={
                data.regrasAplicaveis.length
                  ? `${data.regrasAplicaveis.length} regra(s) publicada(s) aplicável(is)${
                      data.limitacoesPrecedencia.length
                        ? ` · limitações: ${data.limitacoesPrecedencia.join(", ")}`
                        : ""
                    }`
                  : "nenhuma regra publicada aplicável a este exemplo"
              }
              conteudo={
                data.contratoPrecedencia || "(nenhuma restrição adicional neste exemplo)"
              }
            />
            <BlocoLeitura
              titulo="Prompt de comportamento"
              origem={`fonte: Arquitetura / versão v${data.versao ?? "—"}`}
              conteudo={data.behaviorPrompt}
            />
            <BlocoLeitura
              titulo="Contexto dinâmico (exemplo)"
              origem="fonte: atendimento fictício — somente leitura"
              conteudo={data.runtimeContextJson}
            />
            <BlocoLeitura
              titulo="Ferramentas / schemas"
              origem="fonte: mesmo registro de ferramentas do atendimento"
              conteudo={
                data.ferramentas.length
                  ? data.ferramentas.map((f) => `${f.nome} — ${f.descricao}`).join("\n")
                  : "(nenhuma ferramenta ativa)"
              }
            />
            <BlocoLeitura
              titulo="Envelope técnico"
              origem="fonte: código — somente leitura"
              conteudo={data.envelope}
            />
            <BlocoLeitura
              titulo="Prompt montado nesta prévia"
              origem="montado pelo mesmo compositor do atendimento, com dados de exemplo"
              conteudo={data.conteudoFinal}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlocoLeitura({
  titulo,
  origem,
  conteudo,
}: {
  titulo: string;
  origem: string;
  conteudo: string;
}) {
  return (
    <section className="rounded-lg border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <h4 className="text-sm font-medium">{titulo}</h4>
        <span className="text-xs text-muted-foreground">{origem}</span>
      </header>
      <pre className="max-h-[40vh] overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
        {conteudo}
      </pre>
    </section>
  );
}
