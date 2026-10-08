// Dois arquivos de migration com o mesmo número de versão.
export default function checar({ arquivos, todos }) {
  const versao = (a) => (a.match(/supabase\/migrations\/(\d+)_[^/]*\.sql$/) || [])[1];
  const donos = new Map();
  for (const a of todos) {
    const v = versao(a);
    if (v) donos.set(v, [...(donos.get(v) || []), a]);
  }
  const achados = [];
  for (const a of arquivos) {
    const v = versao(a);
    const lista = v && donos.get(v);
    if (lista && lista.length > 1) {
      achados.push({ arquivo: a, linha: 1, msg: `versão ${v} repetida: ${lista.filter((x) => x !== a).join(", ")}` });
    }
  }
  return achados;
}
