/**
 * Nina → Arquitetura.
 *
 * Tela somente leitura. Ela desenha o Architecture Manifest já existente
 * (`src/lib/nina/arquitetura/manifesto.ts`) e, no modo Execução, mostra o
 * caminho real de uma mensagem a partir do tracing. Nada aqui altera o backend,
 * a ordem de execução, prompts, ferramentas ou dados de atendimento.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArquiteturaCanvas } from "@/components/nina/ArquiteturaCanvas";
import { RastrearExecucao } from "@/components/nina/RastrearExecucao";
import { InstrucoesNina } from "@/components/nina/InstrucoesNina";

import { useClinica } from "@/hooks/use-clinica";
import { capacidadesArquitetura } from "@/lib/nina/arquitetura/permissoes.functions";
import { nivelAcessoDe, podeArquitetura } from "@/lib/nina/arquitetura/permissoes";
import { NODES_ARQUITETURA } from "@/lib/nina/arquitetura/manifesto";
import { statusArquitetura } from "@/lib/nina/arquitetura/layout-incremental";
import {
  HISTORICO_ARQUITETURA,
  comparacaoRecente,
  destaquesDaComparacao,
} from "@/lib/nina/arquitetura/versoes";
import { mudancaConfiguracaoPrompt } from "@/lib/nina/arquitetura/sync";
import { historicoInstrucoesNina } from "@/lib/nina/instrucoes.functions";
import { SemCaixaAlta } from "@/components/ui/caixa-alta";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/_authenticated/app/nina-arquitetura")({
  head: () => ({
    meta: [
      { title: "Nina — Arquitetura do atendimento" },
      {
        name: "description",
        content:
          "Mapa visual dos componentes reais do backend da Nina: entrada, contexto, conhecimento, modelo, ferramentas, envio e observabilidade.",
      },
      { property: "og:title", content: "Nina — Arquitetura do atendimento" },
      {
        property: "og:description",
        content: "Visualize e audite o caminho que uma mensagem percorre no atendimento da Nina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Fora da caixa alta automática: aqui se digita instrução da Nina e código de execução —
  // ver caixa-alta.tsx.
  component: () => (
    <SemCaixaAlta>
      <Pagina />
    </SemCaixaAlta>
  ),
});

function Pagina() {
  const { clinicaAtual } = useClinica();
  const { session, loading: authLoading } = useAuth();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const [modo, setModo] = useState<"arquitetura" | "execucao" | "alteracoes">("arquitetura");

  // FASE 5 — ação "Ver instruções" do node Montagem do prompt: volta para o
  // mapa e rola até a seção editável abaixo do canvas.
  useEffect(() => {
    function irParaInstrucoes() {
      setModo("arquitetura");
      requestAnimationFrame(() => {
        document.getElementById("instrucoes-nina")?.scrollIntoView({ behavior: "smooth" });
      });
    }
    window.addEventListener("nina:ver-instrucoes", irParaInstrucoes);
    return () => window.removeEventListener("nina:ver-instrucoes", irParaInstrucoes);
  }, []);

  // FASE 8 — quem chega pelo Relatório da homologação com #execucao já cai na
  // aba de rastreio; o código a procurar vem no sessionStorage (lido lá).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#execucao") setModo("execucao");
    else if (window.location.hash === "#instrucoes-nina") {
      requestAnimationFrame(() => {
        document.getElementById("instrucoes-nina")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, []);


  const buscarCapacidades = useServerFn(capacidadesArquitetura);
  const { data: permissao } = useQuery({
    queryKey: ["arquitetura-capacidades", clinicaId, session?.user.id],
    enabled: !authLoading && !!session?.access_token && !!clinicaId,
    queryFn: () => {
      if (!clinicaId || !session?.access_token) {
        throw new Error("Sessão ainda não está pronta");
      }
      return buscarCapacidades({ data: { clinicaId } });
    },
  });

  const capacidades = permissao?.capacidades ?? [];
  const podeVer = podeArquitetura(capacidades, "arquitetura.visualizar");
  const podeExecucao = podeArquitetura(capacidades, "arquitetura.execucao");
  const nivelAcesso = nivelAcessoDe(capacidades);
  const chavePosicoes = `nina-arquitetura-posicoes:${clinicaId ?? "sem-clinica"}`;
  const status = statusArquitetura(NODES_ARQUITETURA);
  const comparacao = comparacaoRecente();
  const marcasAlteracao = destaquesDaComparacao(comparacao);
  const sinal =
    status.cor === "verde" ? "🟢" : status.cor === "amarelo" ? "🟡" : "🔴";

  if (permissao && !podeVer) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acesso não liberado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Seu perfil não tem permissão para ver a arquitetura da Nina. Fale com a administração da
            clínica.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Network className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Nina — Arquitetura</h1>
          <p className="text-sm text-muted-foreground">
            Mapa dos componentes reais do atendimento. Mover um item muda apenas o desenho.
          </p>
        </div>
      </header>

      <div
        role="status"
        className="flex flex-wrap items-start gap-2 rounded-lg border p-3 text-sm"
        style={{
          borderColor:
            status.cor === "verde"
              ? "color-mix(in oklch, var(--primary) 40%, transparent)"
              : status.cor === "amarelo"
                ? "color-mix(in oklch, var(--chart-4) 55%, transparent)"
                : "color-mix(in oklch, var(--destructive) 55%, transparent)",
        }}
      >
        <span aria-hidden="true">{sinal}</span>
        <div>
          <p className="font-medium">{status.titulo}</p>
          <p className="text-muted-foreground">{status.detalhe}</p>
        </div>
      </div>

      <Tabs value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
        <TabsList>
          <TabsTrigger value="arquitetura">Arquitetura</TabsTrigger>
          <TabsTrigger value="execucao">Execução</TabsTrigger>
          <TabsTrigger value="alteracoes">Alterações</TabsTrigger>
        </TabsList>

        <TabsContent value="arquitetura" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">O que a Nina pode fazer</CardTitle>
              <Badge variant="outline">Somente leitura</Badge>
            </CardHeader>
            <CardContent>
              <ArquiteturaCanvas
                chavePosicoes={chavePosicoes}
                clinicaId={clinicaId}
                nivelAcesso={nivelAcesso}
                marcasAlteracao={marcasAlteracao}
              />
            </CardContent>
          </Card>

          <div id="instrucoes-nina" className="scroll-mt-24">
            {clinicaId && podeArquitetura(capacidades, "nina.instrucoes.ver") ? (
              <InstrucoesNina
                clinicaId={clinicaId}
                podeEditar={podeArquitetura(capacidades, "nina.instrucoes.editar")}
                podePublicar={podeArquitetura(capacidades, "nina.instrucoes.publicar")}
                podeHistorico={podeArquitetura(capacidades, "nina.instrucoes.historico")}
              />
            ) : null}
          </div>

        </TabsContent>


        <TabsContent value="alteracoes" className="mt-4">
          <PainelAlteracoes clinicaId={clinicaId ?? null} podeHistorico={podeArquitetura(capacidades, "nina.instrucoes.historico")} />
        </TabsContent>

        <TabsContent value="execucao" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">O que aconteceu em uma mensagem</CardTitle>
            </CardHeader>
            <CardContent>
              {podeExecucao ? (
                <RastrearExecucao
                  clinicaId={clinicaId}
                  nivelAcesso={nivelAcesso}
                  chavePosicoes={`${chavePosicoes}:execucao`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Seu perfil não tem permissão para rastrear mensagens.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PainelAlteracoes({
  clinicaId,
  podeHistorico,
}: {
  clinicaId: string | null;
  podeHistorico: boolean;
}) {
  const comparacao = comparacaoRecente();

  if (!comparacao) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alterações da arquitetura</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Existe apenas uma versão registrada — ainda não há comparação disponível.
        </CardContent>
      </Card>
    );
  }

  const { de, para, nodes, conexoes, nomes } = comparacao;
  const nome = (id: string) => nomes[id] ?? id;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Arquitetura v{de.versao} → Arquitetura v{para.versao}
          </CardTitle>
          <Badge variant="outline">{comparacao.resumo}</Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <section>
            <h3 className="mb-1 font-medium">Adicionado</h3>
            {nodes.adicionados.length === 0 ? (
              <p className="text-muted-foreground">Nada adicionado.</p>
            ) : (
              <ul className="space-y-0.5">
                {nodes.adicionados.map((id) => (
                  <li key={id} className="text-foreground">
                    <span className="font-mono text-xs text-muted-foreground">+</span> {nome(id)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-medium">Alterado</h3>
            {nodes.alterados.length === 0 ? (
              <p className="text-muted-foreground">Nada alterado.</p>
            ) : (
              <ul className="space-y-0.5">
                {nodes.alterados.map((m) => (
                  <li key={m.id} className="text-foreground">
                    <span className="font-mono text-xs text-muted-foreground">~</span> {nome(m.id)}{" "}
                    <span className="text-xs text-muted-foreground">({m.campos.join(", ")})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-medium">Removido</h3>
            {nodes.removidos.length === 0 ? (
              <p className="text-muted-foreground">Nada removido.</p>
            ) : (
              <ul className="space-y-0.5">
                {nodes.removidos.map((id) => (
                  <li key={id} className="text-foreground">
                    <span className="font-mono text-xs text-muted-foreground">-</span> {nome(id)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-medium">Conexões</h3>
            {conexoes.adicionadas.length === 0 && conexoes.removidas.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma ligação mudou.</p>
            ) : (
              <ul className="space-y-0.5">
                {conexoes.adicionadas.map((c) => (
                  <li key={`a-${c.de}-${c.para}`}>
                    <span className="font-mono text-xs text-muted-foreground">+</span> {nome(c.de)}{" "}
                    → {nome(c.para)}
                  </li>
                ))}
                {conexoes.removidas.map((c) => (
                  <li key={`r-${c.de}-${c.para}`}>
                    <span className="font-mono text-xs text-muted-foreground">-</span> {nome(c.de)}{" "}
                    → {nome(c.para)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versões registradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[...HISTORICO_ARQUITETURA].reverse().map((v) => (
            <div key={v.versao} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Arquitetura v{v.versao}</span>
                <Badge variant="outline">{v.data}</Badge>
                <span className="text-xs text-muted-foreground">
                  {v.quantidadeNodes} componentes · {v.quantidadeTools} ferramentas
                </span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <li>Publicação: {v.deploy ?? "não publicada"}</li>
                <li>Commit: {v.commit ?? "não registrado"}</li>
                <li>Versão do prompt: {v.versaoPrompt ?? "não registrada"}</li>
                <li>Modelo: {v.modelo ?? "não registrado"}</li>
              </ul>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm">
                {v.alteracoes.map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {clinicaId && podeHistorico ? <MudancasDoPrompt clinicaId={clinicaId} /> : null}

      <p className="text-xs text-muted-foreground">
        Mover ou reorganizar componentes no mapa muda apenas o desenho e não cria uma versão nova
        da arquitetura.
      </p>

    </div>
  );
}

/**
 * FASE 5 — Architecture Sync das Instruções da Nina.
 *
 * Publicar novas instruções é mudança de configuração: atualiza os metadados
 * do componente "Montagem do prompt" e registra a troca de versão, sem
 * reorganizar o mapa nem criar versão nova da arquitetura.
 */
function MudancasDoPrompt({ clinicaId }: { clinicaId: string }) {
  const buscar = useServerFn(historicoInstrucoesNina);
  const { data, isLoading } = useQuery({
    queryKey: ["nina-instrucoes-historico", "whatsapp", clinicaId],
    queryFn: () => buscar({ data: { clinicaId, escopo: "whatsapp" as const } }),
  });

  const publicadas = (data ?? [])
    .filter((v) => v.status === "publicada" || v.status === "arquivada")
    .sort((a, b) => a.versao - b.versao);

  const trocas = publicadas.map((v, i) =>
    mudancaConfiguracaoPrompt(i > 0 ? publicadas[i - 1]!.versao : null, v.versao),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Mudanças das Instruções da Nina</CardTitle>
        <Badge variant="outline">Configuração, não estrutura</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Carregando as publicações…</p>
        ) : trocas.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma versão publicada até agora.</p>
        ) : (
          <ul className="space-y-1">
            {[...trocas].reverse().map((t) => (
              <li key={t.para} className="flex flex-wrap items-center gap-2">
                <span>{t.resumo}</span>
                <span className="text-xs text-muted-foreground">
                  Montagem do prompt — metadados atualizados
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Trocar o conteúdo das instruções não reorganiza o desenho do mapa.
        </p>
      </CardContent>
    </Card>
  );
}
