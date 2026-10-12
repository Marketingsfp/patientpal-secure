import { createContext, useContext } from "react";

/** Liga os botões “Como ler” e o layout por seções (flag `catalogo_estruturado`). */
export const CatalogoOrganizado = createContext(false);

export function useCatalogoOrganizado() {
  return useContext(CatalogoOrganizado);
}

/** O item aberto usa atendimentos estruturados (muda a explicação da sincronização). */
export const ItemEstruturado = createContext(false);

export function useItemEstruturado() {
  return useContext(ItemEstruturado);
}
