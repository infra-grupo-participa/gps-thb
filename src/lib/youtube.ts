// YouTube: extrair o ID de 11 caracteres de qualquer forma de URL que o
// admin colar, e montar o embed sem cookie de rastreio.
//
// O banco guarda só o `youtube_id` (gps.videos.youtube_id) — nunca a URL
// inteira. Um ID que não bate com o formato do YouTube (exatamente 11
// caracteres em [A-Za-z0-9_-]) vira `src` de iframe direto, então a extração
// tem de FALHAR explicitamente (`null`) em vez de adivinhar: gravar lixo
// aqui é gravar um iframe quebrado que só aparece quando o aluno abre a aula.

/** Formato de um ID de vídeo do YouTube: sempre 11 caracteres. */
const RE_ID_YOUTUBE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extrai o `youtube_id` de qualquer forma de link do YouTube:
 * - https://www.youtube.com/watch?v=ID (com &list=, &si=, &t=... juntos)
 * - https://youtu.be/ID (com ?t=123 junto)
 * - https://www.youtube.com/embed/ID
 * - https://www.youtube.com/live/ID
 * - https://www.youtube.com/shorts/ID
 * - o próprio ID, colado sozinho (11 caracteres)
 *
 * Função pura, sem acesso a rede: só confere o FORMATO da URL/ID, não se o
 * vídeo existe. Devolve `null` quando não reconhece — nunca um palpite.
 */
export function extrairYoutubeId(entrada: string | null | undefined): string | null {
  const bruto = (entrada ?? "").trim();
  if (!bruto) return null;

  // Colou só o ID (11 chars, sem barra nem protocolo).
  if (RE_ID_YOUTUBE.test(bruto)) return bruto;

  let url: URL;
  try {
    // Aceita colar sem "https://" na frente (comum em copiar/colar de chat).
    url = new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname;

  // youtu.be/ID
  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0];
    return id && RE_ID_YOUTUBE.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    // /watch?v=ID
    if (path === "/watch") {
      const id = url.searchParams.get("v");
      return id && RE_ID_YOUTUBE.test(id) ? id : null;
    }
    // /embed/ID, /live/ID, /shorts/ID
    const partes = path.split("/").filter(Boolean);
    if (partes.length >= 2 && ["embed", "live", "shorts"].includes(partes[0])) {
      const id = partes[1];
      return id && RE_ID_YOUTUBE.test(id) ? id : null;
    }
  }

  return null;
}

/**
 * URL de embed sem cookie de rastreio — o domínio certo para um portal de
 * alunos (`youtube-nocookie.com`, não `youtube.com/embed`).
 *
 * `id` PRECISA já ter passado por `extrairYoutubeId`/`RE_ID_YOUTUBE`: esta
 * função não valida de novo, só monta a URL. Um `id` fora do formato vira
 * `src` de iframe que não carrega — por isso todo chamador tem de checar
 * `extrairYoutubeId` antes.
 */
export function embedYoutube(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
