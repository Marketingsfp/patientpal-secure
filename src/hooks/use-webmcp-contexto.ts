/**
 * Registra na página autenticada de atendimento UMA ferramenta WebMCP de
 * leitura (`atendimento_contexto`), seguindo a API imperativa oficial
 * (`document.modelContext.registerTool`, com `navigator.modelContext` como
 * variante do rascunho de especificação).
 *
 * Garantias desta fase:
 * - Detecta suporte antes de registrar. Navegador sem WebMCP segue normal.
 * - Nada roda durante a renderização no servidor (tudo dentro de useEffect).
 * - Só registra com usuário autenticado e clínica selecionada; ao sair, o
 *   AbortController remove a ferramenta da descoberta.
 * - Somente leitura: não escreve em lugar nenhum e não devolve dado clínico,
 *   credencial nem informação de outro paciente.
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { montarContextoWebmcp } from "@/lib/webmcp/contexto";
import { obterSelecaoTeste } from "@/lib/webmcp/selecao-teste";

interface FerramentaWebmcp {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (entrada: unknown) => Promise<string> | string;
}

interface ContainerWebmcp {
  registerTool: (
    ferramenta: FerramentaWebmcp,
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

  useEffect(() => {
    // Sem usuário autenticado ou sem clínica escolhida, nada é registrado —
    // é isso que faz a ferramenta sumir da descoberta após o logout.
    if (!user || !clinicaId) return;
    const container = containerWebmcp();
    if (!container) return;

    const controller = new AbortController();
    const email = user.email ?? null;
    const nome = clinicaAtual?.clinica?.nome ?? null;
    const papel = clinicaAtual?.role ?? null;

    let dentroDeIframe = false;
    try {
      dentroDeIframe = window.self !== window.top;
    } catch {
      dentroDeIframe = true;
    }

    try {
      void container.registerTool(
        {
          name: "atendimento_contexto",
          description:
            "Retorna o contexto da tela de atendimento da Nina: ambiente, clínica autorizada, perfil autenticado, conversa de teste selecionada e capacidades. Somente leitura, sem dados clínicos.",
          inputSchema: { type: "object", properties: {} },
          annotations: {
            readOnlyHint: true,
            consequentialHint: false,
            untrustedContentHint: false,
          },
          execute: () =>
            JSON.stringify(
              montarContextoWebmcp({
                host: window.location.host,
                dentroDeIframe,
                autenticado: true,
                usuarioEmail: email,
                clinicaId,
                clinicaNome: nome,
                papel,
                selecaoTeste: obterSelecaoTeste(),
              }),
              null,
              2,
            ),
        },
        { signal: controller.signal },
      );
    } catch {
      // Navegador com WebMCP parcial: seguimos sem a ferramenta.
      return;
    }

    return () => controller.abort();
  }, [user, clinicaId, clinicaAtual?.clinica?.nome, clinicaAtual?.role]);
}
