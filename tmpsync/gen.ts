import { NODES_ARQUITETURA as V1 } from "./manifesto-v1";
const snap = V1.map((n) => ({
  id: n.id,
  categoria: n.categoria,
  arquivo: n.arquivo ?? null,
  funcao: n.funcao ?? null,
  anteriores: [...n.anteriores].sort(),
  seguintes: [...n.seguintes].sort(),
}));
console.log(JSON.stringify(snap, null, 2));
