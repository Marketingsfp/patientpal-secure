import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export type SearchableMultiOption = { value: string; label: string };

interface Props {
  options: SearchableMultiOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

const cleanLabel = (label: string) => label.replace(/^\d+\.\s*/, "");

export function SearchableMultiSelect({
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
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedLabels = useMemo(
    () => value.map((v) => cleanLabel(options.find((o) => o.value === v)?.label ?? v)),
    [options, value],
  );

  const toggle = (nextValue: string) => {
    if (!nextValue || nextValue === "none") return;
    if (selectedSet.has(nextValue)) {
      onChange(value.filter((v) => v !== nextValue));
      return;
    }
    onChange([...value, nextValue]);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (!disabled) setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal min-h-10 h-auto py-2", className)}
        >
          <span className="min-w-0 flex-1 text-left text-sm leading-5">
            {selectedLabels.length > 0 ? (
              <span className="line-clamp-2">
                {selectedLabels.join(" + ")}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(var(--radix-popover-trigger-width),32rem)] max-w-[94vw]"
        align="start"
        sideOffset={4}
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command
          filter={(val, search) => {
            const opt = options.find((o) => o.value === val);
            if (!opt) return 0;
            return opt.label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b px-2">
            <CommandInput placeholder={searchPlaceholder} className="border-0" />
            {value.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onChange([])}
                title="Limpar seleção"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <CommandList className="max-h-[min(340px,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => toggle(o.value)}
                    className="items-start gap-2"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                      )}
                    >
                      <Check className={cn("h-3 w-3", checked ? "opacity-100" : "opacity-0")} />
                    </span>
                    <span className="min-w-0 whitespace-normal leading-5">{o.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}