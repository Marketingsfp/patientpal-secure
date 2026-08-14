// Validador e formatador de CPF (algoritmo oficial da Receita Federal)

export function somenteDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

export function formatarCPF(s: string): string {
  const d = somenteDigitos(s).slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

export function isCPFValido(cpf: string): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // rejeita 000... 111... etc

  const calcDV = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const dv1 = calcDV(d.slice(0, 9), 10);
  if (dv1 !== Number(d[9])) return false;
  const dv2 = calcDV(d.slice(0, 10), 11);
  if (dv2 !== Number(d[10])) return false;
  return true;
}
