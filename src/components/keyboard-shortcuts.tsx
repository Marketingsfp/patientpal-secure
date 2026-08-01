import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTurboMode, isTypingTarget } from "@/lib/turbo-mode";

/**
 * Atalhos globais de teclado para reduzir o uso do mouse.
 *
 * - "?"        → abre o painel de atalhos
 * - "/"        → foca o primeiro campo marcado com [data-quick-search]
 *                (busca de paciente etc.)
 * - Alt+1..9   → navega para os primeiros itens do menu lateral
 *                (lê os <a data-nav-to> renderizados pela sidebar)
 * - Enter      → em qualquer diálogo com um <button data-primary>,
 *                dispara esse botão (não interfere em textareas)
 */
export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const isTyping = isTypingTarget;

    const focusQuickSearch = () => {
      const target = document.querySelector<HTMLElement>("[data-quick-search]");
      if (!target) return false;
      target.focus();
      if (target instanceof HTMLInputElement) target.select();
      return true;
    };

    const clickByAttr = (attr: string) => {
      const btn = document.querySelector<HTMLButtonElement>(`button[${attr}]:not([disabled])`);
      if (!btn) return false;
      btn.click();
      return true;
    };

    const onKey = (e: KeyboardEvent) => {
      // "?" abre o painel de ajuda
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // "/" foca o primeiro campo de busca rápida disponível
      if (e.key === "/" && !isTyping(e.target)) {
        if (focusQuickSearch()) e.preventDefault();
        return;
      }

      // ===== MODO TURBO (F-keys, Ctrl+S, Ctrl+Enter) =====
      const turbo = getTurboMode();
      if (turbo) {
        // F2 → buscar paciente (mesmo dentro de input)
        if (e.key === "F2") {
          if (focusQuickSearch()) e.preventDefault();
          return;
        }
        // F3 → novo agendamento (encaixe)
        if (e.key === "F3" && !isTyping(e.target)) {
          if (clickByAttr("data-turbo-novo")) e.preventDefault();
          return;
        }
        // F4 → repetir último (a implementar na Fase 2)
        if (e.key === "F4" && !isTyping(e.target)) {
          if (clickByAttr("data-turbo-repetir")) e.preventDefault();
          return;
        }
        // F5 → atualizar agenda (só fora de input; deixa F5 do browser em inputs)
        if (e.key === "F5" && !isTyping(e.target)) {
          if (clickByAttr("data-turbo-refresh")) e.preventDefault();
          return;
        }
        // F6 → próximo horário
        if (e.key === "F6") {
          if (clickByAttr("data-turbo-proximo")) e.preventDefault();
          return;
        }
        // F7 → Agenda Express
        if (e.key === "F7") {
          e.preventDefault();
          navigate({ to: "/app/agenda/express" });
          return;
        }
        // F8 → Agenda
        if (e.key === "F8") {
          e.preventDefault();
          navigate({ to: "/app/agenda" });
          return;
        }
        // F9 → Caixa
        if (e.key === "F9") {
          e.preventDefault();
          navigate({ to: "/app/caixa" });
          return;
        }
        // Ctrl+F → buscar paciente (só fora de input)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f" && !isTyping(e.target)) {
          if (focusQuickSearch()) e.preventDefault();
          return;
        }
        // Ctrl+S → salvar (dispara data-primary do diálogo mais próximo)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
          const dialog = (e.target as HTMLElement | null)?.closest('[role="dialog"]');
          const primary = (dialog ?? document).querySelector<HTMLButtonElement>(
            "button[data-primary]:not([disabled])"
          );
          if (primary) {
            e.preventDefault();
            primary.click();
            return;
          }
        }
        // Ctrl+Enter → salvar + receber
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "Enter") {
          if (clickByAttr("data-turbo-salvar-receber")) e.preventDefault();
          return;
        }
        // Ctrl+Shift+Enter → salvar + receber + emitir NFS-e
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
          if (clickByAttr("data-turbo-salvar-receber-nfse")) e.preventDefault();
          return;
        }
        // Enter / Shift+Enter → navegar entre [data-turbo-field]
        if ((e.key === "Enter") && (e.target instanceof HTMLElement) && e.target.hasAttribute("data-turbo-field")) {
          // se o input está dentro de um combobox aberto, deixa o Enter selecionar
          const inCombobox = e.target.closest('[role="combobox"], [role="listbox"], [aria-expanded="true"]');
          if (!inCombobox) {
            const fields = Array.from(
              document.querySelectorAll<HTMLElement>("[data-turbo-field]:not([disabled])")
            );
            const idx = fields.indexOf(e.target);
            if (idx >= 0) {
              const next = e.shiftKey ? fields[idx - 1] : fields[idx + 1];
              if (next) {
                e.preventDefault();
                next.focus();
                if (next instanceof HTMLInputElement) next.select();
                return;
              }
            }
          }
        }
      }

      // Alt+1..9 → atalho para itens do menu lateral
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>("aside [data-nav-to]")
        );
        const target = links[idx];
        if (target?.dataset.navTo) {
          e.preventDefault();
          navigate({ to: target.dataset.navTo });
        }
        return;
      }

      // Enter dentro de diálogo → aciona botão marcado com [data-primary]
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const tgt = e.target as HTMLElement | null;
        if (!tgt) return;
        if (tgt.tagName === "TEXTAREA") return;
        const dialog = tgt.closest('[role="dialog"]');
        if (!dialog) return;
        // se já estiver focado num botão, deixa o comportamento padrão
        if (tgt.tagName === "BUTTON") return;
        const primary = dialog.querySelector<HTMLButtonElement>(
          "button[data-primary]:not([disabled])"
        );
        if (primary) {
          e.preventDefault();
          primary.click();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />;
}

function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const groups = useMemo(
    () => [
      {
        title: "Geral",
        items: [
          { keys: ["?"], desc: "Abrir / fechar este painel" },
          { keys: ["/"], desc: "Focar busca rápida (paciente, etc.)" },
          { keys: ["Esc"], desc: "Fechar diálogos abertos" },
          { keys: ["Enter"], desc: "Confirmar ação principal do diálogo" },
        ],
      },
      {
        title: "Menu lateral",
        items: [
          { keys: ["Alt", "1–9"], desc: "Ir para os 9 primeiros itens do menu" },
          { keys: ["↑", "↓"], desc: "Navegar entre itens (com foco na sidebar)" },
        ],
      },
      {
        title: "Agenda",
        items: [
          { keys: ["N"], desc: "Novo agendamento (encaixe)" },
          { keys: ["F"], desc: "Focar filtro de profissional" },
          { keys: ["R"], desc: "Recarregar a lista" },
        ],
      },
      {
        title: "Diálogo de pagamento",
        items: [
          { keys: ["1"], desc: "Dinheiro" },
          { keys: ["2"], desc: "PIX" },
          { keys: ["3"], desc: "Cartão de Débito" },
          { keys: ["4"], desc: "Cartão de Crédito" },
          { keys: ["5"], desc: "Mais de uma forma" },
        ],
      },
      {
        title: "Check-in",
        items: [
          { keys: ["Alt", "1–9"], desc: "Confirmar presença do N-ésimo paciente da lista" },
          { keys: ["/"], desc: "Focar busca de paciente" },
        ],
      },
      {
        title: "Recepção / Filas",
        items: [
          { keys: ["C"], desc: "Chamar próxima senha" },
        ],
      },
      {
        title: "Caixa — Cobrança",
        items: [
          { keys: ["1–4"], desc: "Forma de pagamento da linha atual" },
          { keys: ["5"], desc: "Adicionar nova forma de pagamento" },
          { keys: ["Enter"], desc: "Confirmar cobrança" },
        ],
      },
    ],
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="text-sm font-semibold mb-2">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map((it, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{it.desc}</span>
                    <span className="flex items-center gap-1">
                      {it.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 text-xs font-mono"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}