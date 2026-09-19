import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { registrarEventoSeguranca } from "@/lib/coach/seguranca-tela";
import type { TelaProtegida, TipoEventoSeguranca } from "@/lib/coach/seguranca-tela";

function ehCampoDeTexto(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

/**
 * Monitoramento silencioso de tentativas de captura durante treino e prova.
 * A atendente não recebe nenhum aviso: nada de marca d'água, embaçamento ou
 * mensagem na tela. As tentativas ficam visíveis apenas no painel da gestora.
 */
export function ProtecaoTela({
  atendente,
  clinicaId,
  tela,
  registrarSaidaDeAba = true,
  children,
}: {
  atendente: string;
  clinicaId: string | null;
  tela: TelaProtegida;
  /** No treino por voz a atendente troca de janela o tempo todo — sem sentido registrar. */
  registrarSaidaDeAba?: boolean;
  children: ReactNode;
}) {
  const clinicaIdRef = useRef<string | null>(null);

  clinicaIdRef.current = clinicaId;

  const registrar = useCallback(
    (tipo: TipoEventoSeguranca) => {
      void registrarEventoSeguranca({
        atendente,
        clinicaId: clinicaIdRef.current,
        tela,
        tipo,
      });
    },
    [atendente, tela],
  );

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (ehCampoDeTexto(e.target)) return;
      registrar("menu_contexto");
    };

    const onCopy = (e: ClipboardEvent) => {
      if (ehCampoDeTexto(e.target)) return;
      registrar("copiar");
    };

    const onCut = (e: ClipboardEvent) => {
      if (ehCampoDeTexto(e.target)) return;
      registrar("recortar");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tecla = e.key.toLowerCase();

      if (e.key === "PrintScreen" || tecla === "printscreen") {
        registrar("print_screen");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && tecla === "p") {
        registrar("imprimir");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (tecla === "s" || tecla === "4" || tecla === "5")) {
        registrar("print_screen");
      }
    };

    const onVisibility = () => {
      if (document.hidden && registrarSaidaDeAba) registrar("saida_de_aba");
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [registrar, registrarSaidaDeAba]);

  return <>{children}</>;
}
