import { useCallback, useEffect, useState } from "react";
import { getFlagUsuario, setFlagUsuario } from "@/lib/cache/prefs-cache";
import { FLAG_INBOX_MOSTRAR_TESTES, incluirTesteEfetivo } from "@/lib/atendimento/conversas-teste";

/**
 * "Mostrar conversas de teste" — preferência lembrada por usuário
 * (`profiles.preferencias_ui.flags.inbox_mostrar_testes`).
 *
 * Sem autorização devolve desligado, sem ler nem gravar a preferência.
 * O servidor confere o perfil de novo e conserva o escopo da atendente.
 */
export function useMostrarConversasTeste(autorizado: boolean, usuarioId?: string | null) {
  const [salvo, setSalvo] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!autorizado) {
      setSalvo(false);
      setCarregado(false);
      return;
    }
    let vale = true;
    setSalvo(false);
    setCarregado(false);
    getFlagUsuario(FLAG_INBOX_MOSTRAR_TESTES)
      .then((v) => {
        if (!vale) return;
        setSalvo(v === true);
        setCarregado(true);
      })
      .catch(() => {
        if (vale) setCarregado(true);
      });
    return () => {
      vale = false;
    };
  }, [autorizado, usuarioId]);

  const alternar = useCallback(
    async (valor: boolean) => {
      if (!autorizado) return;
      setSalvo(valor);
      try {
        await setFlagUsuario(FLAG_INBOX_MOSTRAR_TESTES, valor);
      } catch {
        /* preferência é conveniência: falha ao gravar não derruba a tela */
      }
    },
    [autorizado],
  );

  return { ligado: incluirTesteEfetivo(salvo, autorizado), carregado, alternar };
}
