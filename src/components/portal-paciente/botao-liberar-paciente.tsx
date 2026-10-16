import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { liberarParaPaciente } from "@/lib/portal-paciente/portal-equipe.functions";

/** "Liberar ao paciente" / "Retirar liberação", com quem e quando. */
export function BotaoLiberarPaciente({
  origem,
  id,
  liberadoEm,
  liberadoPor,
  onMudou,
}: {
  origem: "documento" | "exame";
  id: string;
  liberadoEm: string | null;
  liberadoPor: string | null;
  onMudou?: () => void;
}) {
  const fn = useServerFn(liberarParaPaciente);
  const [em, setEm] = useState(liberadoEm);
  const [salvando, setSalvando] = useState(false);
  const nome = useQuery({
    queryKey: ["perfil-nome", liberadoPor],
    enabled: !!liberadoPor && !!em,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", liberadoPor as string)
        .maybeSingle();
      return data?.nome ?? null;
    },
  });

  const alternar = async () => {
    setSalvando(true);
    try {
      const r = await fn({ data: { origem, id, liberar: !em } });
      setEm(r.liberadoEm);
      toast.success(r.liberadoEm ? "Liberado na Área do Paciente." : "Liberação retirada.");
      onMudou?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant={em ? "secondary" : "outline"}
        onClick={alternar}
        disabled={salvando}
      >
        {em ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {em ? "Retirar liberação" : "Liberar ao paciente"}
      </Button>
      {em && (
        <span className="text-[11px] text-muted-foreground">
          Liberado em {new Date(em).toLocaleString("pt-BR")}
          {liberadoPor ? (nome.data ? ` por ${nome.data}` : "") : " (automático)"}
        </span>
      )}
    </span>
  );
}
