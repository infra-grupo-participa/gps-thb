/**
 * "Volte para a MESMA tela do painel" — a última URL de `/admin`.
 *
 * 🔑 O estado do painel (aba, busca, ordem, filtros, lote) já mora na URL
 * (`alunos-ativos-lista/estado-na-url.ts`) e "de qual card eu saí" mora numa
 * âncora por `alunoId` (`alunos-ativos-lista/ancora.ts`). O que faltava era a
 * VOLTA: o link "← Voltar aos alunos" e a aba "Alunos" do header apontavam
 * para `/admin` **pelado**, e um `href` fixo apaga tudo o que a URL guardava.
 * O admin filtrava, buscava, rolava, abria um aluno — e voltava para o topo de
 * uma lista sem filtro. A âncora até funcionava, mas apontava para um card que
 * a nova lista não continha.
 *
 * Aqui fica só a parte SEM React (testável, sem hook): gravar, ler e —
 * principalmente — **sanear**. O componente e o hook estão em
 * `voltar-ao-painel.tsx`.
 *
 * 🔴 Allowlist fechada, igual à do parse da URL. O que sai daqui vira destino
 * de `router.push`/`<Link>`, então nada que venha do storage pode escolher o
 * CAMINHO: ele é a string literal `/admin`, escrita neste arquivo. Storage é
 * gravável por qualquer script da própria origem — um `/admin` trocado por
 * `//evil.com` no `sessionStorage` viraria uma saída do domínio no clique do
 * "Voltar" (o mesmo buraco que `destinoInterno` fecha no `?redirect=`).
 *
 * 🔴 `sessionStorage`, nunca `localStorage`: `q` é o que o admin digitou e
 * pode ser o nome de um aluno. A chave morre com a aba, exatamente como o
 * histórico que ela existe para imitar.
 */

import {
  ABAS,
  ABA_PADRAO,
  FILTROS,
} from "./alunos-ativos-lista/estado-na-url";
import { ORDENS } from "./alunos-ativos-lista/tipos";

/** Uma chave, um valor. Interna: só as três funções abaixo a tocam. */
const CHAVE_URL_PAINEL = "gps.admin.painel.ultimaUrl";

/**
 * Para onde ir quando não há nada gravado (primeira visita, aba anônima com
 * storage bloqueado, chave saneada e recusada).
 *
 * **`aba=ativos` explícito**, e não `/admin`: sem `?aba=` o painel abre em
 * "Visão geral", e quem clica em "Voltar aos alunos" quer a LISTA.
 */
export const URL_PAINEL_PADRAO = "/admin?aba=ativos";

/** Teto do termo de busca — barra uma URL gigante colada por engano. */
const MAX_TERMO = 80;

/**
 * Devolve um caminho interno seguro, ou `null` se não der para confiar.
 *
 * O caminho NUNCA vem da entrada: é montado aqui. Da entrada aproveitamos
 * apenas os cinco parâmetros do painel — e **cada um passa pela allowlist que
 * o painel já usa** (`ABAS`, `ORDENS`, `FILTROS`), em vez de ser copiado cru.
 *
 * 🔴 Por que não basta copiar o valor: `?f=sem_login,PWNED` é descartado pelo
 * `lerEstado` na hora de FILTRAR, mas se a chave guardasse o texto original o
 * "Voltar" ressuscitaria o lixo no endereço a cada ida e volta. A regra da
 * casa é uma só — allowlist fechada no parse **e** na volta.
 */
function sanitizarUrlDoPainel(
  url: string | null | undefined,
): string | null {
  if (typeof url !== "string" || url.length === 0 || url.length > 600) {
    return null;
  }
  const [caminho, consulta = ""] = url.split("?");
  if (caminho !== "/admin") return null;

  const bruto = new URLSearchParams(consulta);
  const sp = new URLSearchParams();

  const aba = bruto.get("aba");
  if (aba && aba !== ABA_PADRAO && (ABAS as readonly string[]).includes(aba)) {
    sp.set("aba", aba);
  }

  const termo = (bruto.get("q") ?? "").slice(0, MAX_TERMO).trim();
  if (termo) sp.set("q", termo);

  const ordem = bruto.get("ordem");
  if (ordem && (ORDENS as readonly string[]).includes(ordem)) {
    sp.set("ordem", ordem);
  }

  // Ordem estável (a da allowlist), como em `escreverEstado`: marcar A e
  // depois B tem de gerar a MESMA chave que marcar B e depois A.
  const marcados = new Set((bruto.get("f") ?? "").split(",").map((x) => x.trim()));
  const filtros = FILTROS.filter((x) => marcados.has(x));
  if (filtros.length > 0) sp.set("f", filtros.join(","));

  // `mais` é o lote (`?mais=2`), decidido no servidor: só dígito, e com o
  // mesmo teto de 10 rodadas que `/admin` aplica.
  const mais = Math.min(Math.max(Math.trunc(Number(bruto.get("mais"))) || 0, 0), 10);
  if (mais > 0) sp.set("mais", String(mais));

  // Mesma razão de `escreverEstado`: `?f=chamado,sem_login` é feito para ser
  // lido, `?f=chamado%2Csem_login` não.
  const q = sp.toString().replace(/%2C/g, ",");
  return q ? `/admin?${q}` : "/admin";
}

/** Grava a URL atual do painel. Falha em silêncio: é conforto, não função. */
export function gravarUrlDoPainel(url: string): void {
  const limpo = sanitizarUrlDoPainel(url);
  if (!limpo) return;
  try {
    sessionStorage.setItem(CHAVE_URL_PAINEL, limpo);
  } catch {
    // Aba anônima com storage bloqueado: o fallback já cobre.
  }
}

/**
 * A URL gravada, saneada — ou `URL_PAINEL_PADRAO`. Nunca lança.
 *
 * 🔑 **Sempre com uma aba de LISTA.** Quem chama é o link "← Voltar aos
 * alunos", e o rótulo promete a lista. Se a última tela do painel foi a "Visão
 * geral", a URL gravada não tem `?aba=` (o padrão sai do endereço) — e voltar
 * devolvia o dashboard, não os alunos. Só `ativos` e as outras abas gravadas
 * sobrevivem; a ausência de aba e a aba padrão viram `aba=ativos`.
 */
export function lerUrlDoPainel(): string {
  let limpa: string | null = null;
  try {
    limpa = sanitizarUrlDoPainel(sessionStorage.getItem(CHAVE_URL_PAINEL));
  } catch {
    return URL_PAINEL_PADRAO;
  }
  if (!limpa) return URL_PAINEL_PADRAO;

  const [caminho, consulta = ""] = limpa.split("?");
  const sp = new URLSearchParams(consulta);
  if (sp.get("aba")) return limpa;
  sp.set("aba", "ativos");
  return `${caminho}?${sp.toString().replace(/%2C/g, ",")}`;
}
