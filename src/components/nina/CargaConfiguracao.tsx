import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERFIS, ROTULO_PERFIL, type ConfigCarga, type Perfil } from "@/lib/nina/carga";

const CAMPOS = [
  ["leadsAtivos", "Leads participantes", 1, 10, 1],
  ["totalMensagens", "Total de mensagens", 1, 500, 1],
  ["conversasSimultaneas", "Conversas simultâneas", 1, 10, 1],
  ["mensagensPorMinuto", "Mensagens por minuto", 1, 240, 1],
  ["duracaoMaxS", "Duração máxima (segundos)", 30, 1800, 1],
  ["intervaloMs", "Intervalo entre disparos (ms)", 0, 60000, 1],
  ["timeoutS", "Tempo limite por resposta (segundos)", 10, 120, 1],
  ["maxTokens", "Limite de tokens", 1000, 2000000, 1000],
  ["creditosPorMilTokens", "Créditos por mil tokens", 0, 100, 0.1],
  ["maxCustoCreditos", "Teto de custo estimado em créditos", 0, 5000, 1],
] as const;

export function CargaConfiguracao({
  config,
  onChange,
  disabled = false,
  totalCalculado = false,
}: {
  config: ConfigCarga;
  onChange: (c: ConfigCarga) => void;
  disabled?: boolean;
  totalCalculado?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-3 text-sm font-medium">Configuração do teste</legend>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="carga-perfil">Perfil</Label>
          <Select
            disabled={disabled}
            value={config.perfil}
            onValueChange={(valor) => {
              const perfil = valor as Perfil;
              onChange(
                perfil === "customizado"
                  ? { ...config, perfil, retriesMax: 0 }
                  : { ...PERFIS[perfil], retriesMax: 0, distribuicao: config.distribuicao },
              );
            }}
          >
            <SelectTrigger id="carga-perfil">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["leve", "medio", "alto", "customizado"] as Perfil[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {ROTULO_PERFIL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {CAMPOS.map(([campo, rotulo, min, max, step]) => (
          <div key={campo} className="space-y-1.5">
            <Label htmlFor={`carga-${campo}`}>{rotulo}</Label>
            <Input
              id={`carga-${campo}`}
              type="number"
              min={min}
              max={max}
              step={step}
              value={config[campo]}
              readOnly={campo === "totalMensagens" && totalCalculado}
              onChange={(e) =>
                onChange({ ...config, perfil: "customizado", [campo]: Number(e.target.value) })
              }
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Tokens e custo referem-se às execuções da Nina; o consumo de Sol e Luna é separado. O custo
        é estimado pela taxa informada. Teto de custo 0 significa sem limite de custo; os limites de
        mensagens, duração e tokens continuam valendo.
      </p>
      <p className="text-xs text-muted-foreground">
        Mensagens já iniciadas não são reenviadas automaticamente.
      </p>
    </fieldset>
  );
}
