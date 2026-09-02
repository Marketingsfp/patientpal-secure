/**
 * Atalho da Tabela de Valores: gaveta que abre por cima de qualquer tela.
 *
 * O botão fica no cabeçalho do sistema, então a atendente consulta o preço
 * sem sair da Agenda nem da Recepção e sem perder o que estava preenchendo.
 *
 * A gaveta é deliberadamente "seca": sem fade e sem zoom. Na Agenda a
 * recepcionista atende com o paciente na frente e qualquer animação vira
 * espera percebida.
 */

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAcessoModulo } from "@/hooks/use-permissoes";
import { EVENTO_ABRIR_TABELA_VALORES } from "@/lib/tabela-valores/abrir";
import { TabelaValoresPainel } from "./tabela-valores-painel";

/** Sem animação: `duration-0` e `animate-none` anulam o fade/zoom do Dialog. */
const SEM_ANIMACAO =
  "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none " +
  "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 " +
  "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100";

export function TabelaValoresDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-3xl h-[85dvh] grid-rows-[auto_1fr] gap-3 ${SEM_ANIMACAO}`}
        overlayClassName={SEM_ANIMACAO}
        // O Dialog do projeto bloqueia Esc e clique fora por padrão (protege
        // formulários de cobrança). Aqui não há nada para perder: a consulta
        // tem que fechar tão rápido quanto abriu.
        onEscapeKeyDown={() => {}}
        onPointerDownOutside={() => {}}
        onInteractOutside={() => {}}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Tabela de valores
          </DialogTitle>
        </DialogHeader>
        <TabelaValoresPainel className="min-h-0" />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botão do cabeçalho + a gaveta que ele abre. Fica escondido para quem não
 * tem o módulo "Informações rápidas" liberado no perfil de acesso.
 */
export function BotaoTabelaValores() {
  const podeVer = useAcessoModulo("consulta-rapida") !== "none";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!podeVer) return;
    const abrir = () => setOpen(true);
    window.addEventListener(EVENTO_ABRIR_TABELA_VALORES, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_TABELA_VALORES, abrir);
  }, [podeVer]);

  if (!podeVer) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 px-2 gap-1.5 rounded-full text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        title="Tabela de valores (Alt+V)"
        onClick={() => setOpen(true)}
      >
        <Tag className="h-4 w-4" />
        <span className="hidden lg:inline text-xs font-medium">Valores</span>
      </Button>
      <TabelaValoresDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
