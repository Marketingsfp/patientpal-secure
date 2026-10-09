import { useCallback, useEffect, useState } from "react";
import { getFlagUsuario, setFlagUsuario } from "@/lib/cache/prefs-cache";
import { FLAG_INBOX_MOSTRAR_TESTES, incluirTesteEfetivo } from "@/lib/atendimento/conversas-teste";

/**
 * "Mostrar conversas de teste" — preferência lembrada por usuário
 * (`profiles.preferencias_ui.flags.inbox_mostrar_testes`).
 *
 * `admin = false` devolve sempre desligado, sem ler nem gravar nada: o controle
 * só existe para administrador. O servidor confere o perfil de novo.
 */
export function useMostrarConversasTeste(admin: boolean) {
  const [salvo, setSalvo] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!admin) {
      setSalvo(false);
      setCarregado(false);
      return;
    }
    let vale = true;
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
  }, [admin]);

  const alternar = useCallback(
    async (valor: boolean) => {
      if (!admin) return;
      setSalvo(valor);
      try {
        await setFlagUsuario(FLAG_INBOX_MOSTRAR_TESTES, valor);
      } catch {
        /* preferência é conveniência: falha ao gravar não derruba a tela */
      }
    },
    [admin],
  );

  return { ligado: incluirTesteEfetivo(salvo, admin), carregado, alternar };
}
