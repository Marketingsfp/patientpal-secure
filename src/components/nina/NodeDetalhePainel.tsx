/**
 * FASE 5 — Painel lateral com os detalhes técnicos de um componente da
 * arquitetura da Nina.
 *
 * Tudo aqui é leitura: os dados vêm do Architecture Manifest e, no modo
 * Execução, do trace daquela passagem. O código-fonte é carregado sob demanda
 * por uma server function que exige perfil de admin e oculta valores
 * sensíveis. Não existe execução de código nesta tela.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NODES_ARQUITETURA, type NodeArquitetura } from "@/lib/nina/arquitetura/manifesto";
import { CORES_CATEGORIA } from "@/lib/nina/arquitetura/layout";
import { verTrechoCodigo, type RespostaCodigo } from "@/lib/nina/arquitetura/codigo.functions";
import { carregarInstrucoesNina } from "@/lib/nina/instrucoes.functions";
import type { StatusNodeCanvas } from "./ArquiteturaCanvas";
import {
  RESTRITO,
  lerDetalheEspecifico,
  type DetalheEspecifico,
  type NivelAcesso,
} from "@/lib/nina/arquitetura/detalhes-ia";

/** Nodes cuja configuração vem das Instruções da Nina publicadas. */
const NODES_INSTRUCOES = ["prompt.compose", "instructions.published"];

/**
 * FASE 5 — versão publicada das Instruções da Nina usada pela montagem do
 * prompt, com atalho para a seção editável abaixo do canvas.
 */
function ConfiguracaoInstrucoes({ onVerInstrucoes }: { onVerInstrucoes: () => void }) {
  const carregar = useServerFn(carregarInstrucoesNina);
  const { data, isLoading } = useQuery({
    queryKey: ["nina-instrucoes"],
    queryFn: () => carregar(),
  });
  const whatsapp = data?.find((d) => d.escopo === "whatsapp")?.publicada ?? null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide">Configuração publicada</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando a versão publicada…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Versão publicada">{whatsapp ? `v${whatsapp.versao}` : "—"}</Campo>
          <Campo rotulo="Fonte">Instruções da Nina</Campo>
          <Campo rotulo="Status">{whatsapp ? "Publicada" : "Nenhuma publicada (usa o texto do código)"}</Campo>
          <Campo rotulo="Última publicação">
            {whatsapp?.publicado_em
              ? new Date(whatsapp.publicado_em).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "—"}
          </Campo>
        </div>
      )}
      <Button size="sm" variant="outline" onClick={onVerInstrucoes}>
        Ver instruções
      </Button>
      <p className="text-xs text-muted-foreground">
        O texto publicado define só o jeito de conversar. Permissões, acesso a dados e confirmações
        obrigatórias continuam valendo sempre.
      </p>
    </div>
  );
}


type Props = {
  node: NodeArquitetura | null;
  aberto: boolean;
  onFechar: () => void;
  clinicaId?: string | null;
  execucao?: StatusNodeCanvas | null;
  modoExecucao?: boolean;
  nivelAcesso?: NivelAcesso;
  pacienteExecucaoId?: string | null;
};

/** FASE 6 — leitura específica de prompt, conhecimento/RAG, IA e ferramentas. */
function DetalheIAeTools({ detalhe }: { detalhe: DetalheEspecifico }) {
  if (!detalhe) return null;

  if (detalhe.tipo === "prompt") {
    return (
      <div className="space-y-4 rounded-md border p-3">
        <p className="text-xs font-medium uppercase tracking-wide">Instruções da Nina</p>
        <Campo rotulo="Versão do prompt principal">{detalhe.versao ?? "—"}</Campo>
        <Campo rotulo="Publicado em">{detalhe.publicadoEm ?? "—"}</Campo>
        <Campo rotulo="Situação">{detalhe.status ?? "—"}</Campo>
        <Campo rotulo="Módulos adicionais carregados">
          {detalhe.modulos.length ? (
            <ul className="list-disc pl-4">
              {detalhe.modulos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            "Nenhum módulo adicional"
          )}
        </Campo>
        <Campo rotulo="Instruções utilizadas">
          <span className="whitespace-pre-wrap break-words text-xs">
            {detalhe.instrucoes ?? "—"}
          </span>
        </Campo>
      </div>
    );
  }

  if (detalhe.tipo === "conhecimento") {
    return (
      <div className="space-y-4 rounded-md border p-3">
        <p className="text-xs font-medium uppercase tracking-wide">Conhecimento consultado</p>
        <Campo rotulo="Consulta realizada">{detalhe.consulta ?? "—"}</Campo>
        <Campo rotulo="Tipo de recuperação">{detalhe.recuperacao}</Campo>
        <Campo rotulo="Fontes encontradas">
          {detalhe.semResultados ? (
            "Nenhuma fonte encontrada para esta consulta."
          ) : (
            <ul className="space-y-1">
              {detalhe.fontes.map((f, i) => (
                <li key={f.id ?? i} className="flex flex-wrap items-center gap-2">
                  <span>{f.titulo}</span>
                  {f.versao ? <Badge variant="outline">versão {f.versao}</Badge> : null}
                  {f.score != null ? <Badge variant="secondary">{f.score}</Badge> : null}
                  {f.selecionada ? <Badge>usada na resposta</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Campo>
        <Campo rotulo="Conteúdo utilizado">
          <span className="whitespace-pre-wrap break-words text-xs">
            {detalhe.conteudoUtilizado ?? "—"}
          </span>
        </Campo>
        {detalhe.fontesDeOutroPaciente > 0 ? (
          <p className="text-xs text-muted-foreground">
            {detalhe.fontesDeOutroPaciente} fonte(s) de outro paciente não são exibidas.
          </p>
        ) : null}
      </div>
    );
  }

  if (detalhe.tipo === "ia") {
    return (
      <div className="space-y-4 rounded-md border p-3">
        <p className="text-xs font-medium uppercase tracking-wide">Modelo de IA</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Provedor">{detalhe.provedor ?? "—"}</Campo>
          <Campo rotulo="Modelo">{detalhe.modelo ?? "—"}</Campo>
          <Campo rotulo="Horário">{detalhe.horario ?? "—"}</Campo>
          <Campo rotulo="Latência">
            {detalhe.latenciaMs != null ? `${detalhe.latenciaMs} ms` : "—"}
          </Campo>
          <Campo rotulo="Tokens de entrada">{detalhe.tokensEntrada ?? "—"}</Campo>
          <Campo rotulo="Tokens de saída">{detalhe.tokensSaida ?? "—"}</Campo>
          <Campo rotulo="Tokens totais">{detalhe.tokensTotais ?? "—"}</Campo>
          <Campo rotulo="Custo estimado">{detalhe.custoEstimado ?? "não informado"}</Campo>
          <Campo rotulo="Chamadas ao modelo">{detalhe.chamadas ?? "—"}</Campo>
          <Campo rotulo="Situação">{detalhe.status ?? "—"}</Campo>
        </div>
        <Campo rotulo="Instruções utilizadas">
          <span className="whitespace-pre-wrap break-words text-xs">
            {detalhe.instrucoes ?? "—"}
          </span>
        </Campo>
        <Campo rotulo="Contexto enviado">
          <span className="whitespace-pre-wrap break-words text-xs">
            {detalhe.contextoEnviado ?? "—"}
          </span>
        </Campo>
        <Campo rotulo="Conhecimento recuperado">
          <span className="whitespace-pre-wrap break-words text-xs">
            {detalhe.conhecimentoRecuperado ?? "—"}
          </span>
        </Campo>
        <Campo rotulo="Ferramentas solicitadas">
          {detalhe.toolCalls.length ? detalhe.toolCalls.join(" · ") : "Nenhuma"}
        </Campo>
        <Campo rotulo="Resultado estruturado">
          <span className="whitespace-pre-wrap break-words text-xs">
            {detalhe.resultadoEstruturado ?? "—"}
          </span>
        </Campo>
        <p className="text-xs text-muted-foreground">
          O raciocínio interno do modelo nunca é registrado nem exibido.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide">Ferramenta</p>
      <Campo rotulo="Ferramenta">{detalhe.ferramenta ?? "—"}</Campo>
      <Campo rotulo="Argumentos">
        {detalhe.argumentos ? (
          <pre className="overflow-auto rounded bg-muted/40 p-2 text-[11px]">
            <code>{JSON.stringify(detalhe.argumentos, null, 2)}</code>
          </pre>
        ) : (
          "—"
        )}
      </Campo>
      <Campo rotulo="Resultado">{detalhe.resultado ?? "—"}</Campo>
      <Campo rotulo="Validações">
        {detalhe.validacoes.length ? detalhe.validacoes.join(" · ") : "—"}
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Situação">{detalhe.status ?? "—"}</Campo>
        <Campo rotulo="Latência">
          {detalhe.latenciaMs != null ? `${detalhe.latenciaMs} ms` : "—"}
        </Campo>
        <Campo rotulo="Identificador da operação">{detalhe.operacaoId ?? "—"}</Campo>
      </div>
      {detalhe.erro ? (
        <Campo rotulo="Erro">
          <span className="text-destructive">{detalhe.erro}</span>
        </Campo>
      ) : null}
    </div>
  );
}

function nomeDe(id: string): string {
  return NODES_ARQUITETURA.find((n) => n.id === id)?.nome ?? id;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export function NodeDetalhePainel({
  node,
  aberto,
  onFechar,
  clinicaId,
  execucao,
  modoExecucao = false,
  nivelAcesso = "operacional",
  pacienteExecucaoId = null,
}: Props) {
  const buscarCodigo = useServerFn(verTrechoCodigo);
  const [codigo, setCodigo] = useState<RespostaCodigo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);
  const [aba, setAba] = useState("visao");

  useEffect(() => {
    setCodigo(null);
    setErroCodigo(null);
    setAba(modoExecucao && execucao ? "execucao" : "visao");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  async function carregarCodigo() {
    if (!node?.arquivo || !clinicaId) return;
    setCarregando(true);
    setErroCodigo(null);
    try {
      const resposta = await buscarCodigo({
        data: { clinicaId, arquivo: node.arquivo, funcao: node.funcao },
      });
      setCodigo(resposta);
    } catch {
      setErroCodigo("Não foi possível carregar o trecho agora.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Sheet open={aberto} onOpenChange={(v) => (v ? null : onFechar())}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        {node ? (
          <>
            <SheetHeader className="space-y-2 border-b p-4 text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: CORES_CATEGORIA[node.categoria] }}
                />
                {node.nome}
              </SheetTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{node.categoria}</Badge>
                <Badge variant={execucao ? "default" : "secondary"}>
                  {execucao ? execucao.status : modoExecucao ? "não utilizado" : "disponível"}
                </Badge>
                {node.servico ? <Badge variant="secondary">{node.servico}</Badge> : null}
              </div>
            </SheetHeader>

            <Tabs value={aba} onValueChange={setAba} className="flex h-[calc(100%-6rem)] flex-col">
              <TabsList className="mx-4 mt-3 grid w-auto grid-cols-4">
                <TabsTrigger value="visao">Visão geral</TabsTrigger>
                <TabsTrigger value="execucao">Execução</TabsTrigger>
                <TabsTrigger value="codigo">Código</TabsTrigger>
                <TabsTrigger value="doc">Documentação</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                  <TabsContent value="visao" className="mt-0 space-y-4">
                    {NODES_INSTRUCOES.includes(node.id) ? (
                      <ConfiguracaoInstrucoes
                        onVerInstrucoes={() => {
                          onFechar();
                          window.dispatchEvent(new CustomEvent("nina:ver-instrucoes"));
                        }}
                      />
                    ) : null}
                    <Campo rotulo="Descrição">{node.descricao}</Campo>

                    <Campo rotulo="Entrada">{node.entrada}</Campo>
                    <Campo rotulo="Saída">{node.saida}</Campo>
                    <Campo rotulo="Serviço">{node.servico ?? "Interno do sistema"}</Campo>
                    <Campo rotulo="Dependências (antes)">
                      {node.anteriores.length
                        ? node.anteriores.map(nomeDe).join(" · ")
                        : "Ponto de entrada do fluxo"}
                    </Campo>
                    <Campo rotulo="Segue para">
                      {node.seguintes.length
                        ? node.seguintes.map(nomeDe).join(" · ")
                        : "Fim do caminho"}
                    </Campo>
                    {node.tabelas?.length ? (
                      <Campo rotulo="Tabelas">
                        <span className="font-mono text-xs">{node.tabelas.join(", ")}</span>
                      </Campo>
                    ) : null}
                    <Campo rotulo="Possíveis erros">
                      <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                        {node.erros.map((erro) => (
                          <li key={erro}>{erro}</li>
                        ))}
                      </ul>
                    </Campo>
                  </TabsContent>

                  <TabsContent value="execucao" className="mt-0 space-y-4">
                    {execucao ? (
                      <>
                        <Campo rotulo="Status">{execucao.status}</Campo>
                        <Campo rotulo="Tempo">
                          {execucao.duracaoMs != null ? `${execucao.duracaoMs} ms` : "—"}
                        </Campo>
                        <Campo rotulo="Horário">{execucao.horario ?? "—"}</Campo>
                        <Campo rotulo="Tentativas">{execucao.tentativas ?? 1}</Campo>
                        <Campo rotulo="Entrada desta passagem">{execucao.entrada ?? "—"}</Campo>
                        <Campo rotulo="Resultado">{execucao.resultado ?? "—"}</Campo>
                        <DetalheIAeTools
                          detalhe={lerDetalheEspecifico(
                            node.id,
                            execucao.metadata,
                            nivelAcesso,
                            pacienteExecucaoId,
                          )}
                        />
                        {nivelAcesso !== "admin" ? (
                          <p className="text-xs text-muted-foreground">
                            Conteúdos marcados como {RESTRITO} são visíveis apenas para
                            administradores desta clínica.
                          </p>
                        ) : null}
                        {execucao.erro ? (
                          <Campo rotulo="Erro">
                            <span className="text-destructive">{execucao.erro}</span>
                          </Campo>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {modoExecucao
                          ? "Este componente não foi utilizado nessa mensagem."
                          : "Selecione uma mensagem no modo Execução para ver os dados da passagem por este componente."}
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="codigo" className="mt-0 space-y-3">
                    <Campo rotulo="Arquivo responsável">
                      <span className="break-all font-mono text-xs">
                        {node.arquivo ?? "Sem arquivo específico"}
                      </span>
                    </Campo>
                    <Campo rotulo="Função responsável">
                      <span className="break-all font-mono text-xs">{node.funcao ?? "—"}</span>
                    </Campo>

                    {node.arquivo ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={carregarCodigo}
                        disabled={carregando || !clinicaId}
                      >
                        {carregando ? "Carregando…" : "Ver trecho (somente leitura)"}
                      </Button>
                    ) : null}

                    {!clinicaId ? (
                      <p className="text-xs text-muted-foreground">
                        Escolha uma clínica para conferir o trecho de código.
                      </p>
                    ) : null}
                    {erroCodigo ? <p className="text-sm text-destructive">{erroCodigo}</p> : null}

                    {codigo && !codigo.permitido ? (
                      <p className="text-sm text-muted-foreground">
                        {codigo.motivo === "sem_permissao"
                          ? "Visualizar código é restrito a administradores desta clínica."
                          : "Este arquivo não está liberado para visualização."}
                      </p>
                    ) : null}

                    {codigo?.permitido ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{codigo.linguagem}</Badge>
                          <span className="font-mono">{codigo.arquivo}</span>
                          <span>a partir da linha {codigo.linhaInicial}</span>
                        </div>
                        {codigo.ocultouSensivel ? (
                          <p className="text-xs text-muted-foreground">
                            Linhas com conteúdo sensível foram ocultadas.
                          </p>
                        ) : null}
                        <pre className="max-h-[45vh] overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
                          <code>{codigo.trecho}</code>
                        </pre>
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="doc" className="mt-0 space-y-4">
                    <Campo rotulo="O que este componente faz">{node.descricao}</Campo>
                    <Campo rotulo="Quando ele acontece">
                      {node.anteriores.length
                        ? `Depois de: ${node.anteriores.map(nomeDe).join(", ")}.`
                        : "É um dos pontos de entrada do atendimento."}
                    </Campo>
                    <Campo rotulo="O que ele entrega">
                      {node.saida}
                      {node.seguintes.length
                        ? ` Segue para: ${node.seguintes.map(nomeDe).join(", ")}.`
                        : ""}
                    </Campo>
                    <Campo rotulo="Onde conferir">
                      <span className="break-all font-mono text-xs">
                        {node.arquivo ?? "—"}
                        {node.funcao ? ` · ${node.funcao}` : ""}
                      </span>
                    </Campo>
                    <p className="text-xs text-muted-foreground">
                      Esta documentação é gerada a partir do mapa oficial da arquitetura. Não há
                      execução de código por esta tela.
                    </p>
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
