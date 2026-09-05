import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { normalizarBusca, pontuarRelevancia } from "@/lib/busca/relevancia";

export type SearchableOption = { value: string; label: string };

interface Props {
  options: SearchableOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado.",
  className,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!disabled) setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal disabled:opacity-100", className)}
        >
          <span
            className={cn(
              "truncate text-left opacity-100",
              selected ? "text-slate-900 dark:text-slate-50 font-medium" : "text-muted-foreground",
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(var(--radix-popover-trigger-width),24rem)] max-w-[90vw]"
        align="start"
        sideOffset={4}
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command
          filter={(val, search) => {
            // O cmdk devolve o valor já com `trim()`; comparar sem aparar
            // esconderia opções cujo nome tem espaço sobrando no cadastro.
            const opt = options.find((o) => o.value.trim() === val);
            if (!opt) return 0;
            const query = normalizarBusca(search);
            if (!query) return 1;
            // O cmdk ordena pela pontuação, então a correspondência exata sobe
            // para o topo em vez de ficar perdida no meio dos parecidos.
            return Math.max(
              pontuarRelevancia(opt.label, query),
              pontuarRelevancia(opt.value, query),
            );
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[min(300px,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
