/** Modo treinamento — "Dia real": conversas de teste chegando ao longo do tempo. */
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIMITES_BATERIA } from "@/lib/nina/carga-bateria";
import { LIMITES_DIA_REAL, ROTULO_PERFIL_PICO, type PerfilPico } from "@/lib/nina/carga-dia-real";
import { valorDigitado } from "./CargaBateria";

export type SelecaoDiaReal = {
  conversas: number;
  duracaoMin: number;
  perfilPico: PerfilPico;
  turnos: number;
  manterTransferidasMin: number;
};

export function CargaDiaReal({
  disabled,
  disparando,
  onDisparar,
}: {
  disabled: boolean;
  disparando: boolean;
  onDisparar: (selecao: SelecaoDiaReal) => void;
}) {
  const [conversasTexto, setConversasTexto] = useState("10");
  const [duracaoTexto, setDuracaoTexto] = useState("5");
  const [perfilPico, setPerfilPico] = useState<PerfilPico>("aleatorio");
  const [turnosTexto, setTurnosTexto] = useState(String(LIMITES_DIA_REAL.turnosPadrao));
  const [manterTexto, setManterTexto] = useState(
    String(LIMITES_DIA_REAL.manterTransferidasMinPadrao),
  );
  const conversas = valorDigitado(
    conversasTexto,
    LIMITES_DIA_REAL.conversasMin,
    LIMITES_DIA_REAL.conversasMax,
  );
  const duracaoMin = valorDigitado(
    duracaoTexto,
    LIMITES_DIA_REAL.duracaoMinMin,
    LIMITES_DIA_REAL.duracaoMaxMin,
  );
  const turnos = valorDigitado(turnosTexto, LIMITES_BATERIA.turnosMin, LIMITES_BATERIA.turnosMax);
  const manterTransferidasMin = valorDigitado(
    manterTexto,
    0,
    LIMITES_DIA_REAL.manterTransferidasMinMax,
  );

  return (
    <div className="space-y-4" data-testid="carga-dia-real">
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Como funciona</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            As conversas chegam espalhadas no tempo, com picos e intervalos irregulares, como num
            dia de atendimento. Nada é enviado ao WhatsApp: tudo passa pelo canal de homologação.
          </li>
          <li>
            Cada conversa usa um lead de teste e um cenário real do cadastro (consulta e
            profissional publicados), com a Luna no papel do paciente. Uma em cada{" "}
            {LIMITES_DIA_REAL.umaPedeAtendenteACada} pede para falar com uma atendente e termina
            transferida para a fila.
          </li>
          <li>
            Os {LIMITES_DIA_REAL.leads} leads são reaproveitados em rodízio. Uma conversa
            transferida fica na fila pelo tempo escolhido abaixo antes de o lead ser reiniciado; a
            última de cada lead fica na tela até ser resolvida.
          </li>
          <li>
            Para ver os cards chegando, ligue &quot;Mostrar conversas de teste&quot; na tela de
            conversas (só administrador). O teste roda no servidor: pode fechar esta página.
          </li>
        </ul>
      </div>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="dia-real-conversas">Quantidade de conversas</Label>
          <Input
            id="dia-real-conversas"
            type="number"
            min={LIMITES_DIA_REAL.conversasMin}
            max={LIMITES_DIA_REAL.conversasMax}
            value={conversasTexto}
            onChange={(e) => setConversasTexto(e.target.value)}
            onBlur={() => setConversasTexto(String(conversas))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dia-real-duracao">Duração (minutos)</Label>
          <Input
            id="dia-real-duracao"
            type="number"
            min={LIMITES_DIA_REAL.duracaoMinMin}
            max={LIMITES_DIA_REAL.duracaoMaxMin}
            value={duracaoTexto}
            onChange={(e) => setDuracaoTexto(e.target.value)}
            onBlur={() => setDuracaoTexto(String(duracaoMin))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dia-real-perfil">Perfil de pico</Label>
          <Select value={perfilPico} onValueChange={(v) => setPerfilPico(v as PerfilPico)}>
            <SelectTrigger id="dia-real-perfil">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROTULO_PERFIL_PICO) as PerfilPico[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {ROTULO_PERFIL_PICO[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dia-real-turnos">Mensagens do paciente por conversa (máximo)</Label>
          <Input
            id="dia-real-turnos"
            type="number"
            min={LIMITES_BATERIA.turnosMin}
            max={LIMITES_BATERIA.turnosMax}
            value={turnosTexto}
            onChange={(e) => setTurnosTexto(e.target.value)}
            onBlur={() => setTurnosTexto(String(turnos))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dia-real-manter">Transferida fica na fila (minutos)</Label>
          <Input
            id="dia-real-manter"
            type="number"
            min={0}
            max={LIMITES_DIA_REAL.manterTransferidasMinMax}
            value={manterTexto}
            onChange={(e) => setManterTexto(e.target.value)}
            onBlur={() => setManterTexto(String(manterTransferidasMin))}
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled || disparando}
          onClick={() =>
            onDisparar({ conversas, duracaoMin, perfilPico, turnos, manterTransferidasMin })
          }
        >
          {disparando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Iniciar dia real
        </Button>
        <span className="text-xs text-muted-foreground">
          {conversas} conversa(s) em {duracaoMin} min · até {conversas * turnos} mensagens do
          paciente · {ROTULO_PERFIL_PICO[perfilPico]}
        </span>
      </div>
    </div>
  );
}
