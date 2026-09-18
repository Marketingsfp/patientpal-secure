/** Um único instante por atualização, compartilhado por todos os cronômetros da tela. */
export function criarRelogioPausa(ambiente: {
  agora: () => number;
  iniciar: (atualizar: () => void) => () => void;
}) {
  const ouvintes = new Set<() => void>();
  let instante = ambiente.agora();
  let parar: (() => void) | undefined;
  const atualizar = () => {
    instante = ambiente.agora();
    ouvintes.forEach((ouvinte) => ouvinte());
  };
  return {
    ler: () => instante,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      if (ouvintes.size === 1) {
        atualizar();
        parar = ambiente.iniciar(atualizar);
      }
      return () => {
        ouvintes.delete(ouvinte);
        if (ouvintes.size === 0) {
          parar?.();
          parar = undefined;
        }
      };
    },
  };
}
