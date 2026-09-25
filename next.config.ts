import type { NextConfig } from "next";

const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Não anunciar a stack em toda resposta (`X-Powered-By: Next.js`): é
  // reconhecimento grátis para quem procura versão vulnerável.
  poweredByHeader: false,

  // Server Actions atrás do proxy reverso (LiteSpeed/Hostinger): confia na
  // origem do domínio público para não bloquear login/logout/mutações por
  // divergência de Origin × Host.
  // ⚠️ `experimental.optimizePackageImports: ["lucide-react"]` foi MEDIDO em
  // 09/09/2026 (Onda 4) e REVERTIDO: build completo com e sem a opção deu o
  // MESMO byte em 12 rotas (`/login` 243 KB gzip, `/admin` 157, home 81…).
  // O `lucide-react` 1.x já publica um módulo ESM por ícone e o Turbopack já
  // os isola — não há barril a otimizar aqui. Não reintroduzir sem medir.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "programa.timeholdingbrasil.com.br",
        ...(APP_HOST ? [APP_HOST] : []),
      ],
    },
  },

  // Redireciona rotas antigas (renomeadas) para evitar 404 em links/bookmarks.
  async redirects() {
    return [
      { source: "/etapa-1", destination: "/etapa/1", permanent: true },
      // A fila de solicitações virou a aba "Solicitações" do painel. A rota
      // existia só como `redirect()` em Server Component — uma página
      // inteira (bundle + shell de HTML) para mandar o usuário embora.
      // Aqui é 1 linha e o redirect sai antes de qualquer render.
      { source: "/admin/solicitacoes", destination: "/admin", permanent: true },
      {
        source: "/admin/aluno/:id/etapa-1",
        destination: "/admin/aluno/:id/etapa/1",
        permanent: true,
      },
    ];
  },

  // Evita que um CDN/proxy sirva HTML antigo apontando para chunks já
  // substituídos após deploy (lição herdada do sip na Hostinger). Os assets
  // versionados em /_next/static continuam com cache longo e imutável.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Higiene de resposta em TODAS as rotas (inclusive assets).
      //
      // `nosniff`: impede o browser de adivinhar o tipo de um upload/arquivo
      // servido e executá-lo como script.
      // HSTS: o portal só existe em HTTPS; sem o header, o primeiro acesso
      // por http:// é interceptável. `includeSubDomains` sem `preload` de
      // propósito — `preload` é irreversível e o domínio é compartilhado
      // com outros sistemas do grupo.
      // `Permissions-Policy`: nenhuma tela usa câmera, microfone,
      // geolocalização ou pagamento; negar por padrão fecha o que um
      // terceiro embutido poderia pedir em nome do portal.
      //
      // ⚠️ CSP `script-src` NÃO entra aqui: o Next inline-eia o bootstrap e,
      // sem nonce por requisição, a política quebra a página inteira.
      // É projeto próprio, não linha de config.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      // Clickjacking: hoje NENHUMA rota tem X-Frame-Options/CSP, então
      // qualquer site pode embedar até o /login. Política dividida por
      // negative lookahead (mesmo padrão do bloco de cache acima) — os dois
      // headers de frame NUNCA coexistem com valor conflitante na mesma rota.
      //
      // /p/* — Plantão de Dúvidas: PRECISA ser embedável na área de membros
      // da Hotmart (domínio próprio do Club incluso).
      //
      // ⚠️ `https://*.hotmart.com` é MAIS LARGO do que a intenção: esse
      // domínio é compartilhado por TODOS os produtores da plataforma, não só
      // pelo Grupo Participa. Qualquer outro produtor pode embedar
      // `/p/plantao` dentro do produto dele. Não vaza dado por si só, mas
      // abre superfície de clickjacking sobre o formulário — que desde
      // 08/09/2026 pede nome + e-mail (não mais senha nem documento: o login
      // saiu). Achado do `security-pentester`.
      //
      // Mantido POR ORA de propósito: o Club é servido em
      // `hm.nivelouro.com.br`, mas não foi possível confirmar de fora se
      // algum caminho da Hotmart (preview no editor, fallback de domínio)
      // ainda serve por `*.hotmart.com` — e derrubar isso às cegas tira 421
      // pessoas do ar. `frame-src` do lado deles não é observável daqui.
      //
      // 🔑 COMO FECHAR, no ensaio do passo 5 do ATIVAR-PLANTAO-AGORA.md:
      // abrir o plantão dentro do iframe da Hotmart e ler no DevTools →
      // Network → Headers o `Referer`/`Sec-Fetch-Site`, ou rodar
      // `document.referrer` no console do topo. Se vier só
      // `hm.nivelouro.com.br`, apagar as duas entradas `hotmart.com` daqui.
      //
      // ⚠️ `Referrer-Policy` é OBRIGATÓRIO aqui, não higiene: desde que o
      // login saiu, a identidade viaja na URL (`?e=<email>&n=<nome>`). Sem
      // esta política, qualquer recurso cross-origin carregado pela página
      // (analytics da Hotmart, pixel, fonte externa) receberia o e-mail do
      // comprador no header `Referer`. `strict-origin-when-cross-origin`
      // manda só a origem para fora, preservando a URL completa na navegação
      // interna. Achado do `security-pentester` em 08/09/2026.
      {
        source: "/p/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://hm.nivelouro.com.br https://*.hotmart.com https://hotmart.com",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Todo o resto — nunca deve ser embedado (login, área do aluno, admin).
      //
      // `frame-src` (demanda 5, 11/09/2026): biblioteca de vídeos do
      // `/materiais` embeda YouTube não listado
      // (`https://www.youtube-nocookie.com` — sem cookie de rastreio, ver
      // `src/lib/youtube.ts`; `https://www.youtube.com` cobre variação de
      // domínio do próprio player). Até aqui não existia NENHUM `frame-src`:
      // sem `default-src`, isso deixava o portal livre para embedar qualquer
      // origem — frouxo para um campo de URL que o admin digita. Em
      // allowlist, não `*`.
      //
      // `https://drive.google.com` saiu em 25/09/2026: o único consumidor era
      // a prévia embutida da aba "Pasta" (`embeddedfolderview`), removida
      // quando a aba passou a abrir o Drive direto (`/pasta/abrir`).
      //
      // Este é o inverso de `frame-ancestors` (que continua intocado): aqui é
      // o GPS embedando terceiro; lá é terceiro embedando o GPS.
      {
        source: "/((?!p/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // 🔴 A ROTA QUE SERVE DOCUMENTO INLINE — precisa vir DEPOIS do bloco
      // acima, e este é o único motivo de ela existir aqui.
      //
      // MEDIDO em 24/09/2026 (rota de sonda, `next dev`, Next 16.2.10): o
      // header de `next.config.ts` **SUBSTITUI** o que o Route Handler define
      // em `new Response(...)` — não é merge, não duplica. Uma sonda que
      // devolvia `Content-Security-Policy: sandbox` respondeu ao curl com o
      // `frame-ancestors 'none'; frame-src 'self' …` deste arquivo, e o
      // `Referrer-Policy: no-referrer` dela virou
      // `strict-origin-when-cross-origin`. Ou seja: sem esta entrada, DOIS
      // dos cabeçalhos de segurança da rota de documento (`sandbox` e
      // `no-referrer`) NÃO chegariam ao navegador, e o `route.ts` estaria
      // mentindo em comentário.
      //
      // `sandbox` sem token nenhum dá ao documento uma ORIGEM OPACA: PDF com
      // JavaScript embutido não executa, não vê cookie/`localStorage` do GPS
      // e não navega o topo. `no-referrer` impede que a URL — que carrega
      // `clienteId` e o id da minuta — vaze no `Referer` de qualquer recurso
      // que o documento tente buscar.
      //
      // 🔴 `X-Frame-Options: SAMEORIGIN` PRECISA estar AQUI, repetido.
      //
      // MEDIDO em Chrome 154 (24/09/2026): a substituição por chave do Next só
      // acontece para as chaves que a regra ESPECÍFICA declara. O bloco geral
      // `/((?!p/).*)` também casa esta URL e, como esta entrada não declarava
      // `X-Frame-Options`, o `DENY` dele sobrevivia na resposta — o `<iframe>`
      // da pré-visualização morria com `net::ERR_BLOCKED_BY_RESPONSE` e a
      // tela ficava branca. `SAMEORIGIN` mantém a proteção contra clickjacking
      // de terceiro e libera só a nossa própria ficha a emoldurar. A CSP vai
      // junto (`frame-ancestors 'self'`), porque navegador moderno prefere
      // `frame-ancestors` e `X-Frame-Options` é o fallback.
      //
      // ⚠️ `sandbox` CONTINUA na CSP: o isolamento do documento vem da
      // RESPOSTA, nunca do atributo `sandbox` do `<iframe>` (que desliga o
      // visor de PDF do Chrome — ver `visor-documento.tsx`). As três camadas
      // reais, em ordem de confiabilidade:
      //   (a) `Content-Type` decidido por MAGIC BYTES na rota + `nosniff` —
      //       o arquivo nunca vira `text/html`, então não há o que executar;
      //   (b) o viewer de PDF do Chrome roda em `chrome-extension://…`, fora
      //       da nossa origem — não alcança cookie nem `localStorage` do GPS;
      //   (c) `CSP: sandbox` como camada extra, onde o LiteSpeed da Hostinger
      //       deixar o header passar (ver a nota do `/p/plantao`: lá ele
      //       sobrescreve a CSP inteira em produção).
      {
        source: "/clientes/:clienteId/documento/:tipo/:id",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "sandbox; frame-ancestors 'self'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
