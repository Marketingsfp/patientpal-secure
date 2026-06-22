import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { LISTA_SERVICO_NACIONAL } from "@/data/lista-servico-nacional";

interface Props {
  value: string;
  onChange: (codigo: string) => void;
  placeholder?: string;
}

export function ItemServicoPicker({ value, onChange, placeholder = "Buscar serviço..." }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => LISTA_SERVICO_NACIONAL.find((i) => i.codigo === value),
    [value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LISTA_SERVICO_NACIONAL.slice(0, 100);
    return LISTA_SERVICO_NACIONAL.filter(
      (i) => i.codigo.includes(q) || i.descricao.toLowerCase().includes(q),
    ).slice(0, 200);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected ? (
              <>
                <span className="font-mono text-xs mr-2">{selected.codigo}</span>
                <span className="text-muted-foreground">{selected.descricao}</span>
              </>
            ) : value ? (
              <span className="font-mono text-xs">{value} (não encontrado na Lista Nacional)</span>
            ) : (
              <span className="text-muted-foreground">Selecione o código nacional…</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(640px,90vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar por código ou descrição (ex: medicina, 0401)"
              className="border-0"
            />
          </div>
          <CommandList className="max-h-[360px]">
            <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
            <CommandGroup>
              {filtered.map((i) => (
                <CommandItem
                  key={i.codigo}
                  value={i.codigo}
                  onSelect={() => {
                    onChange(i.codigo);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="gap-2"
                >
                  <Check className={cn("h-4 w-4", value === i.codigo ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs w-16 shrink-0">{i.codigo}</span>
                  <span className="text-sm">{i.descricao}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}