import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export function TablePagination({
  page, pageSize, total,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange, onPageSizeChange, className,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-t border-border bg-card rounded-b-2xl",
        className,
      )}
    >
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Mostrando <span className="font-medium text-foreground tabular-nums">{from}</span>
          {" – "}
          <span className="font-medium text-foreground tabular-nums">{to}</span>
          {" de "}
          <span className="font-medium text-foreground tabular-nums">{total.toLocaleString("pt-BR")}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-7 w-[72px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums px-2">
          Página <span className="font-medium text-foreground">{page}</span> de{" "}
          <span className="font-medium text-foreground">{totalPages}</span>
        </span>
        <Button
          type="button" variant="outline" size="sm"
          className="h-8 gap-1"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <Button
          type="button" variant="outline" size="sm"
          className="h-8 gap-1"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          Próximo <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}