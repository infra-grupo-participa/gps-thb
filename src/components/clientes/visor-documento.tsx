"use client";

/**
 * Visor de documento INLINE — pré-visualização de contrato/minuta/croqui
 * sem baixar o arquivo (fatia 5, 24/09/2026; pedido do Marcio: "os
 * operadores não devem precisar baixar minuta, croqui ou contrato para
 * analisar").
 *
 * 🔴 **`src` só existe depois do clique em "Pré-visualizar".** Este
 * componente NUNCA é montado no render de uma lista — quem o usa (
 * `minutas-anexo.tsx`, `contrato-anexo.tsx`, `ficha-croqui.tsx`) só o
 * renderiza a partir do item cujo id está em estado local de "visualizando
 * agora", e desmonta ao fechar. Cada `<iframe>` vivo é um download de até
 * 5 MB pela rota (`Cache-Control: private, no-store` — nada de cache); um
 * iframe por linha da lista custaria N downloads de 5 MB no simples abrir da
 * aba.
 *
 * PDF em `<iframe>` SEM `sandbox` — visor NATIVO do navegador, 0 KB de JS.
 * Imagem em `<img>`. 🔴 O atributo `sandbox` foi REMOVIDO em 24/09/2026 por
 * medição em Chrome 154: `sandbox=""` e `sandbox="allow-scripts"` fazem o
 * Chrome bloquear o visor de PDF (o frame vira `chrome-error://chromewebdata/`)
 * e a pré-visualização não pinta nada. Não reintroduzir o atributo sem medir
 * de novo em Chrome real: `chromium` headless shell não tem viewer de PDF e
 * não reproduz o defeito.
 *
 * ── 🔴 O QUE ISOLA, EM PRODUÇÃO — a CSP NÃO CHEGA ──────────────────────────
 * Até 24/09/2026 este cabeçalho apresentava `Content-Security-Policy: sandbox`
 * como a primeira camada. **É falso em produção, e foi medido hoje**
 * (`curl -sI https://programa.timeholdingbrasil.com.br/clientes/…/documento/
 * minuta/…`): o LiteSpeed da Hostinger devolve
 * `Content-Security-Policy: upgrade-insecure-requests` — a CSP que o Next
 * emite **não chega ao navegador**, exatamente como já acontece com
 * `frame-ancestors` em `/p/plantao` (ver o CLAUDE.md, war-room de 09/09). O
 * `X-Frame-Options` do Next, esse, CHEGA.
 *
 * As camadas que valem **no ar**, em ordem:
 *   1. **magic bytes + `nosniff`** — o `Content-Type` é decidido lendo os
 *      primeiros bytes do arquivo (`src/lib/documento-inline.ts`), nunca o que
 *      o cliente declarou no upload, e `X-Content-Type-Options: nosniff`
 *      impede o navegador de reinterpretar. É o que garante que o arquivo
 *      **nunca vira HTML executável** — e é a única camada que não depende de
 *      cabeçalho que um proxy possa reescrever;
 *   2. **o viewer do Chrome roda em origem `chrome-extension://`**
 *      (`mhjfbmdgcfjbbpaeojofohoefgiehjai`), fora da nossa — o PDF não
 *      alcança cookie nem `localStorage` do GPS;
 *   3. **`Content-Security-Policy: sandbox` é BÔNUS**, válido só onde o proxy
 *      deixa passar (dev e build local). Não contar com ela em produção.
 *
 * ⚠️ Para a CSP voltar a valer no ar é preciso config no hPanel da Hostinger —
 * não é resolvível por código. Enquanto não for, a camada 1 é a que responde.
 *
 * A URL (`src`) é **relativa**, no formato
 * `/clientes/<clienteId>/documento/<tipo>/<id>`, com `tipo` ∈
 * `contrato` (`id="contrato"`) · `minuta` (id da minuta) · `croqui` (id do
 * croqui) — a mesma rota vale para o admin (guarda no servidor).
 *
 * 🔴 Estado de erro: o iframe que recebe 404/413/415 não expõe o corpo da
 * resposta ao React (é outra origem/documento) — não há como "ler" a frase
 * em português que a rota devolve. Por isso o rodapé oferece "Abrir em nova
 * aba" e "Baixar" incondicionalmente: se o visor não carregar, as duas
 * saídas continuam funcionando (a nova aba mostra a frase de erro por si
 * só; "Baixar" é responsabilidade de quem chamou este componente).
 */

export function VisorDocumento({
  src,
  tipo,
  titulo,
  onFechar,
  onBaixar,
}: {
  /** Só existe depois do clique — nunca montar isto no render de uma lista. */
  src: string;
  tipo: "pdf" | "imagem";
  titulo: string;
  onFechar: () => void;
  /** Ação de baixar, do componente pai (mesmo fluxo de "Baixar" da linha) —
   * opcional: quando ausente, o rodapé só oferece "Abrir em nova aba". */
  onBaixar?: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-borda-fina bg-card p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="corpo-sm min-w-0 truncate font-medium">{titulo}</p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="corpo-sm text-accent-foreground underline-offset-4 hover:underline"
          >
            Abrir em nova aba
          </a>
          {onBaixar ? (
            <button
              type="button"
              onClick={onBaixar}
              className="corpo-sm text-accent-foreground underline-offset-4 hover:underline"
            >
              Baixar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onFechar}
            className="corpo-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Fechar
          </button>
        </div>
      </div>

      {tipo === "pdf" ? (
        // 🔴 SEM `sandbox`, e é medido, não preferência: com `sandbox=""` (e
        // também com `sandbox="allow-scripts"`) o Chrome 154 RECUSA carregar o
        // visor de PDF — o frame vai para `chrome-error://chromewebdata/`
        // ("Esta página foi bloqueada pelo Chrome") e a pré-visualização fica
        // branca. Sem o atributo, o PDF abre no viewer nativo
        // (`chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/`).
        // O isolamento que VALE em produção vem da RESPOSTA da rota:
        // `Content-Type` por magic bytes + `nosniff` (o arquivo nunca vira
        // HTML) e o viewer rodando em origem `chrome-extension://`, fora da
        // nossa. 🔴 A `Content-Security-Policy: sandbox` é BÔNUS: medido em
        // 24/09/2026 com `curl -sI` contra produção, o LiteSpeed devolve
        // `upgrade-insecure-requests` e a nossa CSP não chega ao navegador
        // (o `X-Frame-Options` do Next chega). Ver o cabeçalho do arquivo.
        <iframe
          src={src}
          title={titulo}
          referrerPolicy="no-referrer"
          className="h-[70vh] w-full border border-borda-fina"
        />
      ) : (
        // `next/image` exige domínio configurado e faria uma segunda ida à
        // rota (otimizador) para um documento de terceiro que já sai de uma
        // rota própria com `no-store` — sem benefício aqui.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={titulo}
          className="max-h-[70vh] w-full rounded-md border border-borda-fina object-contain"
        />
      )}
    </div>
  );
}
