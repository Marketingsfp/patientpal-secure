/**
 * Registro WebMCP da tela autenticada de atendimento.
 *
 * Fase 2: uma ferramenta de leitura de contexto.
 * Fase 3: adaptadores finos para as operações reais de atendimento,
 * homologação da Nina e catálogo estruturado.
 *
 * Garantias:
 * - Detecta suporte antes de registrar. Navegador sem WebMCP segue normal.
 * - Nada roda durante a renderização no servidor (tudo dentro de useEffect).
 * - Só registra com usuário autenticado e clínica selecionada; ao sair do
 *   módulo, trocar de sessão ou perder a clínica, o AbortController remove
 *   todas as ferramentas de uma vez — sem registros duplicados por render.
 * - Nenhuma ferramenta executa SQL, JavaScript ou requisição livre: todas
 *   chamam funções existentes, que revalidam sessão, perfil e clínica no
 *   servidor.
 */
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { classificarAmbiente, montarContextoWebmcp } from "@/lib/webmcp/contexto";
import { obterSelecaoTeste } from "@/lib/webmcp/selecao-teste";
import { notificarAtualizacao } from "@/lib/webmcp/atualizacao";
import { pedirSelecaoConversa } from "@/lib/webmcp/selecao-conversa";
import { montarFerramentasWebmcp, type ApiWebmcp } from "@/lib/webmcp/ferramentas";
import {
  listarConversas,
  obterConversa,
  listarMensagensConversa,
  listarEventosConversa,
  listarNotas,
  criarNota,
  listarUsuariosClinica,
  listarPresenca,
  listarDepartamentos,
  listarFilaHumana,
  transferirConversa,
} from "@/lib/atendimento.functions";
import {
  listarLeadsTeste,
  historicoLeadTeste,
  enviarMensagemTeste,
  resolverConversaTeste,
} from "@/lib/nina/teste-console.functions";
import {
  listarCatalogoNina,
  opcoesCatalogoNina,
  salvarServicoCatalogo,
  salvarProfissionalCatalogo,
  alterarStatusCatalogo,
  organizarTextoCatalogoIA,
} from "@/lib/nina/catalogo.functions";

interface FerramentaRegistravel {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (entrada: unknown) => Promise<string> | string;
}

interface ContainerWebmcp {
  registerTool: (
    ferramenta: FerramentaRegistravel,
    opcoes?: { signal?: AbortSignal },
  ) => Promise<unknown> | unknown;
}

/** Detecção de suporte. Retorna null quando o navegador não implementa WebMCP. */
export function containerWebmcp(): ContainerWebmcp | null {
  if (typeof document === "undefined") return null;
  const alvos: unknown[] = [
    (document as unknown as { modelContext?: unknown }).modelContext,
    typeof navigator !== "undefined"
      ? (navigator as unknown as { modelContext?: unknown }).modelContext
      : undefined,
  ];
  for (const alvo of alvos) {
    if (alvo && typeof (alvo as ContainerWebmcp).registerTool === "function") {
      return alvo as ContainerWebmcp;
    }
  }
  return null;
}

export function useWebmcpContexto(): void {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const api: ApiWebmcp = {
    listarConversas: useServerFn(listarConversas) as ApiWebmcp["listarConversas"],
    obterConversa: useServerFn(obterConversa) as ApiWebmcp["obterConversa"],
    listarMensagens: useServerFn(listarMensagensConversa) as ApiWebmcp["listarMensagens"],
    listarEventos: useServerFn(listarEventosConversa) as ApiWebmcp["listarEventos"],
    listarNotas: useServerFn(listarNotas) as ApiWebmcp["listarNotas"],
    criarNota: useServerFn(criarNota) as ApiWebmcp["criarNota"],
    listarUsuarios: useServerFn(listarUsuariosClinica) as ApiWebmcp["listarUsuarios"],
    listarPresenca: useServerFn(listarPresenca) as ApiWebmcp["listarPresenca"],
    listarDepartamentos: useServerFn(listarDepartamentos) as ApiWebmcp["listarDepartamentos"],
    listarFilaHumana: useServerFn(listarFilaHumana) as ApiWebmcp["listarFilaHumana"],
    transferirConversa: useServerFn(transferirConversa) as ApiWebmcp["transferirConversa"],
    listarLeadsTeste: useServerFn(listarLeadsTeste) as ApiWebmcp["listarLeadsTeste"],
    historicoLeadTeste: useServerFn(historicoLeadTeste) as ApiWebmcp["historicoLeadTeste"],
    enviarMensagemTeste: useServerFn(enviarMensagemTeste) as ApiWebmcp["enviarMensagemTeste"],
    resolverConversaTeste: useServerFn(resolverConversaTeste) as ApiWebmcp["resolverConversaTeste"],
    listarCatalogo: useServerFn(listarCatalogoNina) as ApiWebmcp["listarCatalogo"],
    opcoesCatalogo: useServerFn(opcoesCatalogoNina) as ApiWebmcp["opcoesCatalogo"],
    salvarServicoCatalogo: useServerFn(salvarServicoCatalogo) as ApiWebmcp["salvarServicoCatalogo"],
    salvarProfissionalCatalogo: useServerFn(
      salvarProfissionalCatalogo,
    ) as ApiWebmcp["salvarProfissionalCatalogo"],
    alterarStatusCatalogo: useServerFn(alterarStatusCatalogo) as ApiWebmcp["alterarStatusCatalogo"],
    organizarTextoCatalogoIA: useServerFn(
      organizarTextoCatalogoIA,
    ) as ApiWebmcp["organizarTextoCatalogoIA"],
  };

  const email = user?.email ?? null;
  const nome = clinicaAtual?.clinica?.nome ?? null;
  const papel = clinicaAtual?.role ?? null;

  useEffect(() => {
    // Sem usuário autenticado ou sem clínica escolhida, nada é registrado —
    // é isso que faz as ferramentas sumirem da descoberta após o logout.
    if (!user || !clinicaId) return;
    const container = containerWebmcp();
    if (!container) return;

    const controller = new AbortController();
    const ambiente = classificarAmbiente(window.location.host);

    let dentroDeIframe = false;
    try {
      dentroDeIframe = window.self !== window.top;
    } catch {
      dentroDeIframe = true;
    }

    const ferramentas = montarFerramentasWebmcp({
      autenticado: true,
      clinicaId,
      ambiente,
      api,
      selecionarConversa: pedirSelecaoConversa,
      notificar: notificarAtualizacao,
    });

    const contexto: FerramentaRegistravel = {
      name: "atendimento_contexto",
      description:
        "Retorna o contexto da tela de atendimento da Nina: ambiente, clínica autorizada, perfil autenticado, conversa de teste selecionada e capacidades disponíveis. Somente leitura, sem dados clínicos.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        consequentialHint: false,
        untrustedContentHint: false,
      },
      execute: () =>
        JSON.stringify(
          {
            ...montarContextoWebmcp({
              host: window.location.host,
              dentroDeIframe,
              autenticado: true,
              usuarioEmail: email,
              clinicaId,
              clinicaNome: nome,
              papel,
              selecaoTeste: obterSelecaoTeste(),
            }),
            capacidades: ["contexto:leitura", ...ferramentas.map((f) => f.name)],
            observacao:
              "Alterações só são executadas fora de produção e apenas sobre conversas de homologação. Informe sempre o identificador da conversa alvo.",
          },
          null,
          2,
        ),
    };

    try {
      for (const f of [contexto, ...ferramentas]) {
        void container.registerTool(f, { signal: controller.signal });
      }
    } catch {
      // Navegador com WebMCP parcial: seguimos sem as ferramentas.
      controller.abort();
      return;
    }

    return () => controller.abort();
    // `api` é recriada a cada render pelos hooks de servidor; o registro
    // depende apenas de sessão e clínica, o que evita registros duplicados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, clinicaId, email, nome, papel]);
}
