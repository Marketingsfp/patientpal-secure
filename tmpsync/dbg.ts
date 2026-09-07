import { SNAPSHOT_ANTERIOR, assinaturaAtual, calcularDiffArquitetura } from "../src/lib/nina/arquitetura/sync";
console.log("snap", SNAPSHOT_ANTERIOR.length, "atual", assinaturaAtual().length);
const d = calcularDiffArquitetura();
console.log(d.adicionados.length, d.alterados.length, d.removidos.length, d.inalterados.length);
