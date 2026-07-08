// Máscaras e formatações (padrão brasileiro) para reduzir erro no preenchimento.

export function soDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00), progressivo enquanto digita. */
export function mascaraCpfCnpj(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += "." + p2;
    if (p3) out += "." + p3;
    if (p4) out += "-" + p4;
    return out;
  }
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "/" + p4;
  if (p5) out += "-" + p5;
  return out;
}

export function tipoDocumento(v: string): "CPF" | "CNPJ" | null {
  const d = soDigitos(v);
  if (d.length === 0) return null;
  return d.length <= 11 ? "CPF" : "CNPJ";
}

/** Telefone (00) 0000-0000 ou (00) 00000-0000, progressivo. */
export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (d.length <= 2) return `(${ddd}`;
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const cut = d.length > 10 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, cut)}-${resto.slice(cut, cut + 4)}`;
}

/** Formata dígitos como moeda BRL (interpreta a entrada como centavos). */
export function mascaraMoeda(v: string): string {
  const d = soDigitos(v);
  if (!d) return "";
  const num = parseInt(d, 10) / 100;
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Converte a string monetária digitada em número (reais) ou null. */
export function moedaParaNumero(v: string): number | null {
  const d = soDigitos(v);
  if (!d) return null;
  return parseInt(d, 10) / 100;
}

/** Formata um número (reais) para exibição inicial no input monetário. */
export function numeroParaMoeda(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
