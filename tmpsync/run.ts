import { calcularDiffArquitetura, diffEmTexto } from "../src/lib/nina/arquitetura/sync";
import { NODES_ARQUITETURA } from "../src/lib/nina/arquitetura/manifesto";
import { extrairArestas, calcularLayout } from "../src/lib/nina/arquitetura/layout";
const d = calcularDiffArquitetura();
console.log(diffEmTexto(d));
console.log("\nresumo:", d.resumo);
const l = calcularLayout(NODES_ARQUITETURA);
console.log("nodes:", NODES_ARQUITETURA.length, "arestas:", extrairArestas(NODES_ARQUITETURA).length, "layout:", Math.round(l.largura), "x", Math.round(l.altura));
