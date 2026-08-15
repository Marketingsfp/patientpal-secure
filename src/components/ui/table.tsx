import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }
>(({ className, containerClassName, ...props }, ref) => {
  // Padrão global de UI: a tabela rola na horizontal em vez de cortar colunas
  // (as ações da última coluna ficavam inacessíveis em telas estreitas).
  //
  // A altura máxima é obrigatória para o cabeçalho fixo (`sticky` no `th`)
  // funcionar. `overflow-x-auto` já faz desta div um contêiner de rolagem nos
  // DOIS eixos, então é contra ela que o `sticky` se resolve — e não contra a
  // área de conteúdo da página. Sem altura, a div cresce junto com a tabela, o
  // cabeçalho nunca tem onde grudar e sobe junto com as linhas. Telas curtas
  // não são afetadas (é `max-height`), e a página pode sobrescrever passando
  // outra altura em `containerClassName`.
  return (
    <div
      className={cn(
        "relative w-full overflow-x-auto overflow-y-auto max-h-[70vh]",
        containerClassName,
      )}
    >
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    // O fundo fica no `th`, não no `thead`: as células cobrem toda a área do
    // cabeçalho, então qualquer cor no `thead` é pintada por cima e nunca
    // aparece. Antes havia `bg-primary/10` aqui e `bg-muted` no `th` — o cinza
    // vencia e o tom institucional nunca foi exibido.
    className={cn(
      "border-b-2 border-primary/30 [&_tr]:border-b-0 [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-(--table-head-bg) [&_th]:shadow-[inset_0_-1px_0_var(--border)]",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-2 text-left align-middle font-bold uppercase tracking-wide text-xs text-primary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
