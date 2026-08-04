import * as React from "react";
import {
  Pencil,
  CreditCard,
  MoreHorizontal,
  Eye,
  CalendarClock,
  Printer,
  Ban,
  CalendarX2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AgendaStatus = "realizado" | "agendado" | "livre" | "cancelado";

export interface AgendaTableItem {
  id: string;
  ficha: string;
  /** Dia da semana abreviado — ex.: "Seg", "Ter". */
  dia: string;
  /** Data já formatada — ex.: "04/08/2026". */
  data: string;
  horaInicio: string;
  horaFim: string;
  profissional: string;
  cliente: string;
  servico: string;
  status: AgendaStatus;
}

export interface AgendaTableProps {
  items: AgendaTableItem[];
  isLoading?: boolean;
  onEdit?: (item: AgendaTableItem) => void;
  onPayment?: (item: AgendaTableItem) => void;
  className?: string;
}

const STATUS_LABEL: Record<AgendaStatus, string> = {
  realizado: "Realizado",
  agendado: "Agendado",
  livre: "Livre",
  cancelado: "Cancelado",
};

const STATUS_CLASS: Record<AgendaStatus, string> = {
  realizado: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  agendado: "bg-blue-500/10 text-blue-700 ring-blue-500/20",
  livre: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
  cancelado: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};

function StatusBadge({ status }: { status: AgendaStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STATUS_CLASS[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

function AcoesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Mais opções"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem>
          <Eye className="mr-2 h-4 w-4" />
          Ver detalhes
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CalendarClock className="mr-2 h-4 w-4" />
          Reagendar
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir guia
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-600 focus:text-rose-600">
          <Ban className="mr-2 h-4 w-4" />
          Cancelar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AcoesRapidas({
  item,
  onEdit,
  onPayment,
}: {
  item: AgendaTableItem;
  onEdit?: (item: AgendaTableItem) => void;
  onPayment?: (item: AgendaTableItem) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="Editar agendamento"
        title="Editar"
        onClick={() => onEdit?.(item)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
        aria-label="Registrar pagamento"
        title="Pagamento"
        onClick={() => onPayment?.(item)}
      >
        <CreditCard className="h-4 w-4" />
      </Button>
      <AcoesMenu />
    </div>
  );
}

export function AgendaTable({
  items,
  isLoading = false,
  onEdit,
  onPayment,
  className,
}: AgendaTableProps) {
  const [selecionados, setSelecionados] = React.useState<string[]>([]);

  const ids = React.useMemo(() => items.map((i) => i.id), [items]);
  const todosSelecionados = ids.length > 0 && selecionados.length === ids.length;
  const algunsSelecionados = selecionados.length > 0 && !todosSelecionados;

  React.useEffect(() => {
    setSelecionados((prev) => prev.filter((id) => ids.includes(id)));
  }, [ids]);

  function toggle(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleTodos() {
    setSelecionados(todosSelecionados ? [] : ids);
  }

  if (isLoading) {
    return (
      <div className={className}>
        {/* Desktop */}
        <div className="hidden overflow-hidden rounded-xl border md:block">
          <div className="h-11 border-b bg-slate-50/70" />
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Mobile */}
        <div className="space-y-3 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 shadow-sm">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-3 w-28" />
              <Skeleton className="mt-2 h-3 w-36" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center",
          className,
        )}
      >
        <CalendarX2 className="h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Nenhum agendamento encontrado.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajuste os filtros ou crie um novo agendamento.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* ---------- Desktop ---------- */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="w-10">
                <Checkbox
                  checked={todosSelecionados ? true : algunsSelecionados ? "indeterminate" : false}
                  onCheckedChange={toggleTodos}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead className="w-20 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ficha
              </TableHead>
              <TableHead className="w-16 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dia
              </TableHead>
              <TableHead className="w-28 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Data
              </TableHead>
              <TableHead className="w-32 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Intervalo
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Profissional
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cliente
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Serviço
              </TableHead>
              <TableHead className="w-32 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alertas
              </TableHead>
              <TableHead className="w-32 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const checked = selecionados.includes(item.id);
              return (
                <TableRow
                  key={item.id}
                  data-state={checked ? "selected" : undefined}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50/60"
                >
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(item.id)}
                      aria-label={`Selecionar ficha ${item.ficha}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.ficha}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.dia}</TableCell>
                  <TableCell className="text-sm tabular-nums">{item.data}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {item.horaInicio} – {item.horaFim}
                  </TableCell>
                  <TableCell className="text-sm">{item.profissional}</TableCell>
                  <TableCell className="text-sm font-medium">{item.cliente}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.servico}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>
                    <AcoesRapidas item={item} onEdit={onEdit} onPayment={onPayment} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ---------- Mobile ---------- */}
      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-slate-50/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.cliente}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.servico}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
              <div className="col-span-1">
                <dt className="text-muted-foreground">Horário</dt>
                <dd className="tabular-nums">
                  {item.horaInicio} – {item.horaFim}
                </dd>
              </div>
              <div className="col-span-1">
                <dt className="text-muted-foreground">Data</dt>
                <dd className="tabular-nums">
                  {item.dia}, {item.data}
                </dd>
              </div>
              <div className="col-span-1">
                <dt className="text-muted-foreground">Profissional</dt>
                <dd className="truncate">{item.profissional}</dd>
              </div>
              <div className="col-span-1">
                <dt className="text-muted-foreground">Ficha</dt>
                <dd className="font-mono">{item.ficha}</dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center justify-between border-t pt-2">
              <Checkbox
                checked={selecionados.includes(item.id)}
                onCheckedChange={() => toggle(item.id)}
                aria-label={`Selecionar ficha ${item.ficha}`}
              />
              <AcoesRapidas item={item} onEdit={onEdit} onPayment={onPayment} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgendaTable;