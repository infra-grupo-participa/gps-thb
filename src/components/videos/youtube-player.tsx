// Player de YouTube responsivo, compartilhado pela pré-visualização do admin
// (`/admin/videos`) e pela biblioteca de gravações do aluno (`/materiais`).
//
// Proporção 16:9 por `aspect-video` (sem altura fixa — o `iframe` some
// junto se o container encolher). `title` é obrigatório: é o rótulo
// acessível do frame, não um "vídeo do YouTube" genérico repetido em cada
// card. `loading="lazy"` porque a lista pode ter vários vídeos na mesma
// página, e não faz sentido carregar todos de uma vez.

import { embedYoutube } from "@/lib/youtube";

export function YoutubePlayer({
  youtubeId,
  titulo,
  className,
}: {
  youtubeId: string;
  /** Vira o `title` do iframe (acessibilidade) — o nome do vídeo, não genérico. */
  titulo: string;
  className?: string;
}) {
  return (
    <div className={`aspect-video w-full overflow-hidden rounded-lg bg-black ${className ?? ""}`}>
      <iframe
        src={embedYoutube(youtubeId)}
        title={titulo}
        className="size-full"
        loading="lazy"
        // 🔴 Sem isto o navegador manda a URL COMPLETA da página do parceiro
        // para o Google ao carregar o player — `/materiais`, e com ela a
        // confirmação de que aquela pessoa está numa sessão do portal naquele
        // instante. Mesmo valor que o `next.config.ts` já aplica ao portal
        // inteiro: só a origem sai, nunca o caminho. (Achado MÉDIO do
        // pentest, 11/09/2026.)
        referrerPolicy="strict-origin-when-cross-origin"
        // O frame roda script de terceiro. `allow-scripts` e
        // `allow-same-origin` o player exige para funcionar; `allow-popups` e
        // `allow-popups-to-escape-sandbox` são do "assistir no YouTube";
        // `allow-presentation` é o Chromecast. O que NÃO está aqui é o que
        // importa: sem `allow-top-navigation`, o iframe não consegue trocar a
        // página do portal por outra.
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
