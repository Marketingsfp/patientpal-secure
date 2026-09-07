import { NODES_ARQUITETURA } from "../src/lib/nina/arquitetura/manifesto";
import { calcularLayout, extrairArestas, calcularProfundidades, LARGURA_NODE, ALTURA_NODE } from "../src/lib/nina/arquitetura/layout";
const n = NODES_ARQUITETURA;
const a = extrairArestas(n);
console.log("nodes", n.length, "arestas", a.length);
const cat: Record<string,number> = {};
for (const x of n) cat[x.categoria] = (cat[x.categoria]??0)+1;
console.log(cat);
const prof = calcularProfundidades(n);
const cols: Record<number,string[]> = {};
for (const x of n) (cols[prof.get(x.id)!] ??= []).push(x.id);
for (const k of Object.keys(cols).map(Number).sort((p,q)=>p-q)) console.log("col",k,cols[k]!.length,cols[k]!.join(", "));
const L = calcularLayout(n);
console.log("largura", L.largura, "altura", L.altura);
// isolados
console.log("isolados", n.filter(x=>x.anteriores.length===0&&x.seguintes.length===0).map(x=>x.id));
console.log("finais", n.filter(x=>x.seguintes.length===0).map(x=>x.id));
// arestas longas (salto de colunas)
const longas = a.map(e=>({e, d:(prof.get(e.para)!)-(prof.get(e.de)!)})).filter(x=>Math.abs(x.d)>1 || x.d<=0);
console.log("arestas nao-adjacentes", longas.length);
for (const x of longas) console.log("  ", x.e.id, "delta", x.d);
// arquivos referenciados
const arq = new Set(n.map(x=>x.arquivo).filter(Boolean));
console.log("arquivos", arq.size);
