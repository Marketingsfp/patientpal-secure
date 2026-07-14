import type { ReactNode } from "react";
import {
  MoreHorizontal, MessageCircle, DollarSign, FileText,
  Eye, Pencil, CheckCircle2, XCircle, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowActionsProps {
  onWhatsapp?: () => void;
  onFinanceiro?: () => void;
  onProntuario?: () => void;
  onVisualizar?: () => void;
  onEditar?: () => void;
  onConfirmar?: () => void;
  onCancelar?: () => void;
  onExcluir?: () => void;
  extra?: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

/**
 * RowActions — atalhos importantes (WhatsApp, Financeiro, Prontuário) inline
 * + menu "..." com o restante das ações.
 */
export function RowActions({
  onWhatsapp, onFinanceiro, onProntuario,
  onVisualizar, onEditar, onConfirmar, onCancelar, onExcluir,
  extra, size = "md", disabled, className,
}: RowActionsProps) {
  const btn = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <div className={cn("flex items-center gap-0.5 justify-end", className)}>
      {onWhatsapp && (
        <Button
          type="button" variant="ghost" size="icon"
          className={cn(btn, "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700")}
          onClick={onWhatsapp} disabled={disabled} aria-label="Enviar WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      )}
      {onFinanceiro && (
        <Button
          type="button" variant="ghost" size="icon"
          className={cn(btn, "text-emerald-700 hover:bg-emerald-50")}
          onClick={onFinanceiro} disabled={disabled} aria-label="Financeiro"
        >
          <DollarSign className="h-4 w-4" />
        </Button>
      )}
      {onProntuario && (
        <Button
          type="button" variant="ghost" size="icon"
          className={cn(btn, "text-blue-600 hover:bg-blue-50")}
          onClick={onProntuario} disabled={disabled} aria-label="Prontuário"
        >
          <FileText className="h-4 w-4" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button" variant="ghost" size="icon"
            className={cn(btn, "text-muted-foreground hover:text-foreground")}
            disabled={disabled} aria-label="Mais ações"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onVisualizar && (
            <DropdownMenuItem onClick={onVisualizar}>
              <Eye className="h-4 w-4 mr-2" /> Visualizar
            </DropdownMenuItem>
          )}
          {onEditar && (
            <DropdownMenuItem onClick={onEditar}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </DropdownMenuItem>
          )}
          {onConfirmar && (
            <DropdownMenuItem onClick={onConfirmar}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Confirmar
            </DropdownMenuItem>
          )}
          {onCancelar && (
            <DropdownMenuItem onClick={onCancelar}>
              <XCircle className="h-4 w-4 mr-2 text-amber-600" /> Cancelar
            </DropdownMenuItem>
          )}
          {onFinanceiro && (
            <DropdownMenuItem onClick={onFinanceiro}>
              <DollarSign className="h-4 w-4 mr-2" /> Financeiro
            </DropdownMenuItem>
          )}
          {extra}
          {onExcluir && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onExcluir}
                className="text-rose-600 focus:text-rose-700"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}