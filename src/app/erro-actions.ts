"use server";

/**
 * Server Action de apoio ao `error.tsx` da raiz (16/09/2026).
 *
 * O boundary de erro da raiz é Client Component e por isso não pode chamar o
 * Supabase diretamente. Esta action é a única ponte — usada para QUALQUER
 * falha que caia no `error.tsx`, não só `SessaoIndeterminadaError`: medido em
 * build de produção que o `name`/campos custom da exceção não sobrevivem à
 * serialização servidor→cliente (ver o comentário em `error.tsx`), então não
 * há como nem vale a pena restringir o botão a um tipo de erro específico.
 *
 * 🔑 NÃO chama `getContextoSessao()`. Se a falha que trouxe a pessoa a esta
 * tela for justamente `perfis`/`gps.membros` fora do ar, chamar
 * `getContextoSessao()` aqui lançaria de novo. Basta `auth.getUser()`
 * (confere só que HÁ sessão válida; é o mesmo primeiro passo que
 * `getContextoSessao()` já faz, sem tocar nas duas consultas que podem estar
 * falhando).
 *
 * `gps.whatsapp_secretaria()` é a MESMA RPC de `BotaoSecretaria`
 * (`src/components/botao-secretaria.tsx`): `SECURITY DEFINER`, lê só
 * `gps.config` (nunca `perfis` nem `gps.membros`), executável por
 * `authenticated`. Quem vê esta tela pode ou não estar com o papel resolvido
 * — mas se HOUVER sessão, a RPC responde independente disso.
 *
 * **Falha fechado**, mesmo contrato do `BotaoSecretaria`: sem sessão, sem
 * número configurado, ou com qualquer erro na RPC, devolve `null` e a tela
 * mostra só a frase — nunca um link que abre conversa vazia ou expõe detalhe
 * interno.
 *
 * ⚠️ SEM RATE LIMIT, por decisão consciente (pentest de 16/09/2026 apontou
 * como MÉDIO; avaliado e aceito). O paralelo com `gps.plantao_revelar_link`
 * — que EXIGE `p_ip_hash` — não se aplica: aquela é alcançável por `anon`
 * (sem login), entrega o link do Zoom e **grava presença em nome de alguém**.
 * Esta exige sessão válida e devolve um número institucional público, o
 * mesmo que `BotaoSecretaria` já serve em TODA página de aluno desde 11/09,
 * também sem rate limit. Pôr limite só aqui não fecharia nada enquanto a
 * outra porta seguir aberta, e o pior caso é spam de uma RPC que lê uma
 * linha de `gps.config` por PK. Se um dia isso mudar, as DUAS entram juntas.
 */

import { createClient } from "@/lib/supabase/server";
import { linkWhatsapp } from "@/lib/whatsapp";

export async function whatsappSecretariaParaErro(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .schema("gps")
    .rpc("whatsapp_secretaria");
  if (error || typeof data !== "string" || !data) return null;

  // 🔴 A RPC devolve o NÚMERO CRU (`5521988656552`), não uma URL — conferido
  // no banco. Devolver `data` direto punha `href="5521988656552"` no `<a>`,
  // que o navegador lê como caminho RELATIVO: o clique abria
  // `/5521988656552` e caía em 404 — justamente o botão que esta tela existe
  // para oferecer. `linkWhatsapp` é o construtor único do repo (garante o DDI)
  // e é por onde os outros dois consumidores da mesma RPC já passam
  // (`botao-secretaria.tsx`, `page.tsx`); ele devolve `null` sem dígitos,
  // preservando o "falha fechado".
  //
  // A mensagem NÃO busca nome nem turma: isso tocaria `thb_alunos`, e aqui o
  // pressuposto é que alguma consulta está falhando.
  return linkWhatsapp(
    data,
    "Olá! Sou do Programa de Implementação Assistida e não consegui carregar o portal.",
  );
}
