import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { valorDoCustomizado, type PerfilCustomizado } from "@/lib/perfis-customizados";

/**
 * Opções da lista suspensa "Perfil de acesso": os perfis de sistema e, abaixo,
 * os perfis criados pela clínica em Perfis de Acesso (valor "custom:<id>").
 */
export function PerfilSelectItems({
  sistema,
  customizados,
}: {
  sistema: ReadonlyArray<{ value: string; label: string }>;
  customizados: ReadonlyArray<PerfilCustomizado>;
}) {
  return (
    <>
      {sistema.map((p) => (
        <SelectItem key={p.value} value={p.value}>
          {p.label}
        </SelectItem>
      ))}
      {customizados.length > 0 && (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Perfis da clínica</SelectLabel>
            {customizados.map((p) => (
              <SelectItem key={p.id} value={valorDoCustomizado(p.id)}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectGroup>
        </>
      )}
    </>
  );
}
