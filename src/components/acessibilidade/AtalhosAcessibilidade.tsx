import { useEffect } from "react";
import { useAcessibilidade } from "./AcessibilidadeProvider";

/**
 * Atalhos opcionais de acessibilidade. Nunca executam ação destrutiva direta:
 * Alt+R apenas aciona o botão de encerrar, que já pede confirmação.
 *
 * Os botões alvo são localizados por `data-a11y-acao` e, como alternativa,
 * pelo texto acessível (aria-label/title), sem exigir mudança nas telas.
 */
function acionar(acao: string, rotulos: string[]): boolean {
  const direto = document.querySelector<HTMLButtonElement>(
    `[data-a11y-acao="${acao}"]:not([disabled])`,
  );
  if (direto) {
    direto.click();
    return true;
  }
  const candidatos = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
  );
  const alvo = candidatos.find((b) => {
    const txt = `${b.getAttribute("aria-label") ?? ""} ${b.getAttribute("title") ?? ""} ${
      b.textContent ?? ""
    }`.toLowerCase();
    return rotulos.some((r) => txt.includes(r));
  });
  if (alvo) {
    alvo.click();
    return true;
  }
  return false;
}

export function AtalhosAcessibilidade() {
  const { prefs, anunciar } = useAcessibilidade();
  const ativo = prefs.atalhosTeclado;

  useEffect(() => {
    if (!ativo) return;
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Enter → enviar mensagem (funciona dentro do campo de texto)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (acionar("enviar", ["enviar mensagem", "enviar"])) e.preventDefault();
        return;
      }
      // Ctrl+K → busca
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        const alvo =
          document.querySelector<HTMLElement>("[data-quick-search]") ??
          document.querySelector<HTMLElement>('input[type="search"]');
        if (alvo) {
          e.preventDefault();
          alvo.focus();
          if (alvo instanceof HTMLInputElement) alvo.select();
          anunciar("Campo de busca em foco");
        }
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "a" && acionar("agendar", ["agendar"])) {
        e.preventDefault();
        anunciar("Agendamento aberto");
      } else if (k === "t" && acionar("transferir", ["transferir"])) {
        e.preventDefault();
        anunciar("Transferência aberta");
      } else if (k === "r" && acionar("encerrar", ["encerrar", "resolver"])) {
        e.preventDefault();
        anunciar("Confirmação de encerramento aberta", true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ativo, anunciar]);

  return null;
}
