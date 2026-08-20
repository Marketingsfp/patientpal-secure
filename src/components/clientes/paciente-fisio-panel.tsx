import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AvaliacaoFisioTab } from "@/components/fisioterapia/avaliacao-fisio-tab";
import { PacotesFisioTab } from "@/components/fisioterapia/pacotes-fisio-tab";

interface Props {
  pacienteId: string;
  pacienteNome: string;
  clinicaId: string;
  userId: string | null;
  readOnly?: boolean;
}

/**
 * Fisioterapia dentro da ficha do paciente.
 *
 * Diferente da aba de Odontologia, aqui os componentes do módulo são
 * reaproveitados inteiros — mapa corporal e pacotes já recebem o paciente por
 * propriedade e cuidam da própria permissão, então não há lógica duplicada
 * entre a ficha e a tela cheia.
 */
export function PacienteFisioPanel({
  pacienteId,
  pacienteNome,
  clinicaId,
  userId,
  readOnly = false,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link to="/app/fisioterapia" hash="avaliacao" search={{ paciente: pacienteId }}>
            <ExternalLink className="h-4 w-4 mr-2" /> Abrir módulo completo
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="avaliacao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="avaliacao">Mapa & Avaliação</TabsTrigger>
          <TabsTrigger value="pacotes">Pacotes de sessões</TabsTrigger>
        </TabsList>

        <TabsContent value="avaliacao">
          <AvaliacaoFisioTab
            pacienteId={pacienteId}
            clinicaId={clinicaId}
            userId={userId}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="pacotes">
          <PacotesFisioTab
            clinicaId={clinicaId}
            pacienteId={pacienteId}
            pacienteNome={pacienteNome}
            userId={userId}
            readOnly={readOnly}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
