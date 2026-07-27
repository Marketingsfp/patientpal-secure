import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTts } from "@/hooks/use-tts";

/**
 * Toggle 🔊 no header do app-shell. Só aparece nas clínicas com TTS habilitado
 * (Menino Jesus). Permite ao usuário desligar/ligar globalmente a leitura em
 * voz alta — persiste em localStorage.
 */
export function TTSToggle() {
  const { clinicHabilitada, userOn, toggle } = useTts();
  if (!clinicHabilitada) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="hidden sm:inline-flex h-9 w-9 p-0 rounded-full"
      onClick={toggle}
      title={userOn ? "Desativar leitura em voz alta" : "Ativar leitura em voz alta"}
      aria-label="Leitura em voz alta"
    >
      {userOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-60" />}
    </Button>
  );
}