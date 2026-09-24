import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { logErro } from "@/lib/log";
import { BUCKET_MINUTAS, MINUTA_PATH_REGEX } from "@/lib/minutas-tipos";
import { BUCKET_CROQUIS, CROQUI_PATH_REGEX } from "@/lib/croquis-tipos";
import {
  detectarTipoPorMagicBytes,
  ehTipoDocumento,
  nomeParaContentDisposition,
  LIMITE_DOCUMENTO_BYTES,
  type TipoDocumento,
} from "@/lib/documento-inline";

/**
 * Pré-visualização INLINE de documento da ficha do cliente
 * (contrato · minuta · croqui).
 *
 * 🔴 ESTA É A ÚNICA EXCEÇÃO do repo ao `download=` obrigatório. Todo o resto
 * (chamado, onboarding, contrato e minuta via URL assinada) continua baixando,
 * e deve continuar: lá o `Content-Type` sairia do metadado do Storage, que é o
 * que o CLIENTE declarou no PUT. Aqui o byte passa pelo SERVIDOR e o
 * `Content-Type` é decidido por `detectarTipoPorMagicBytes` — o arquivo que
 * não for comprovadamente PDF/PNG/JPEG/WEBP não é servido (415).
 *
 * Motivo do produto (Marcio): a equipe precisa LER minuta/contrato/croqui sem
 * baixar. Motivo técnico de ser rota e não URL assinada: a URL assinada aponta
 * para o domínio do Supabase, onde um HTML disfarçado rodaria com a origem
 * DELES; aqui a resposta sai do nosso domínio com `CSP: sandbox` + `nosniff`,
 * que tiram do navegador tanto o direito de adivinhar o tipo quanto o de
 * executar script/formulário caso algum dia a detecção erre.
 *
 * 🔑 BUFFER, NÃO STREAMING, de propósito. O `Content-Type` só pode ser
 * PROMETIDO depois de ler os primeiros bytes; com streaming o cabeçalho sairia
 * antes do corpo e a promessa seria baseada no metadado — exatamente o que
 * esta rota existe para não fazer. O custo de RAM é limitado por
 * `LIMITE_DOCUMENTO_BYTES`, conferido ANTES do download contra o tamanho
 * GRAVADO NO BANCO (que a RPC leu de `storage.objects.metadata`, não do
 * navegador).
 *
 * 🔑 NUNCA `service_role` — o repo inteiro não usa. O download sai com a
 * SESSÃO de quem pede: quem não pode ler o objeto recebe erro do Storage, e a
 * policy (`gps_onboarding_anexo_select` / `gps_minutas_select`) continua sendo
 * a fronteira real, não o código daqui.
 *
 * 🔴 TUDO QUE NÃO PODE SER SERVIDO É 404, com a MESMA frase. Sessão ausente,
 * tipo desconhecido, cliente de outro ambiente, minuta inexistente, feature
 * desligada: resposta idêntica. Distinguir transformaria a rota num oráculo
 * sobre documento de TERCEIRO ("401 aqui e 404 ali" já responde se o cliente
 * existe). Só 413 e 415 se distinguem, e só depois de a pessoa já ter provado
 * que pode ver aquele documento.
 *
 * ESCALA / FREQUÊNCIA (protocolo de sustentabilidade): uma requisição por
 * ABERTURA de documento, disparada por clique — não por render de lista, não
 * por troca de aba. Custo por requisição: 1 `auth.getUser` + 1 `select perfis`
 * (memoizados por `cache()` em `getContextoSessao`), 1 RPC do interruptor,
 * 1 `select` de UMA linha por chave primária e 1 download de no máximo 5 MB.
 * Nada varre tabela e nada cresce com o número de clientes.
 *
 * REVERSÃO: interruptor `documento_inline_ativo` em `gps.config` — ver
 * `inlineAtivo()` abaixo.
 */

/** Bucket do contrato da ficha. Mesmo valor (e mesmo motivo) de
 * `BUCKET_ANEXOS` em `src/app/clientes/actions.ts`: o bucket do questionário
 * passou a significar "anexos do ambiente". Repetido aqui porque aquela
 * constante é privada do módulo de actions e não vou exportá-la (o arquivo
 * está sendo editado por outro executor nesta mesma fatia). */
const BUCKET_CONTRATO = "gps-onboarding";

/** `<ambiente_aluno_id>/<uuid>.<png|jpg|jpeg|webp|pdf>` — o formato que a
 * policy e o CHECK do bucket `gps-onboarding` exigem. Espelha o teste que
 * `urlAssinadaDoAnexo`/`ANEXO_PATH_REGEX` fazem antes de tocar no Storage:
 * caminho fora do formato não vai ao Storage, para o erro não voltar como
 * falha genérica de bucket. */
const CONTRATO_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg|webp)$/;

/** Uma frase só, em português, para TODO caminho que não serve o arquivo.
 * Nunca `error.message` cru: a mensagem do PostgREST/Storage conta estrutura
 * do banco e existência de linha. O motivo real vai para `logErro`. */
const MSG_INDISPONIVEL =
  "Não foi possível abrir este documento. Atualize a página e tente de novo.";

function resposta(status: number, mensagem: string): Response {
  return new Response(mensagem, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Interruptor de reversão. AUSENTE = LIGADO (`true`): o default tem de ser
 * funcionar, igual a `gps.chamados_abertos()` / `gps.videos_ativo()`.
 *
 * 🔴 DIVERGÊNCIA DO PLANO, deliberada (ver "Decisão minha" no relatório). O
 * plano mandava ler `select valor from gps.config where chave =
 * 'documento_inline_ativo'`. NÃO se lê `gps.config` direto: a única policy da
 * tabela é `gps_config_admin` (`gp_is_admin()`, migração …110), então para o
 * ALUNO a tabela responde VAZIO — medido em 11/09/2026 com JWT de titular
 * real, ver `gps.convite_socio_ativo` (…245) e `src/lib/data/equipe.ts`. Com
 * `default true` no ausente, a leitura direta devolveria `true` para todo
 * não-admin SEMPRE: o botão de pânico existiria no código e não desligaria
 * nada justamente para o público que ele precisa desligar. Além disso
 * `gps.config` guarda `resend_api_key`/`email_from` na mesma tabela.
 *
 * Este código falha ABERTO de propósito (erro → `true`), que é o mesmo
 * comportamento de `getSuporteAberto()`: erro de rede não pode derrubar a
 * feature. A trava real continua sendo a RLS do Storage
 * (`gps_minutas_select` / `gps_onboarding_anexo_select`) — este interruptor é
 * botão de pânico do produto, não fronteira de acesso. Se ele falhasse
 * FECHADO, uma instabilidade de rede tiraria a pré-visualização da equipe
 * sem proteger nada que a RLS já não proteja.
 *
 * ✅ A RPC EXISTE desde a migração `20260924000310_gps_documento_inline_ativo`
 * (24/09/2026): `sql`, `stable`, `security definer`, `search_path ''`,
 * `revoke execute from public, anon` + `grant execute to authenticated`, com
 * `coalesce(…, 'true') <> 'false'` no corpo (LIGADO por ausência, ao contrário
 * de `gps.convite_socio_ativo()`, que libera feature nova e falha fechado). A
 * mesma migração pôs `documento_inline_ativo` na allowlist de
 * `gps.config_definir` (16 chaves) e em `INTERRUPTORES_CONFIG`
 * (`src/lib/config-tipos.ts`), que é o que faz o botão aparecer em
 * `/admin/configuracoes` — interruptor novo toca os TRÊS lugares.
 *
 * 🔴 ATÉ A …310, A RPC NÃO EXISTIA e TODA requisição caía em `42883`
 * (undefined_function), logava e devolvia `true`: o interruptor de reversão
 * prometido no cabeçalho desta rota era FALSO e o log enchia a cada abertura
 * de documento. Achado MÉDIO do pentester em 24/09/2026. A partir da …310 o
 * `42883` não acontece mais — se ele voltar a aparecer no log, a migração não
 * foi aplicada naquele ambiente; se aparecer `42501` no lugar, é o
 * `grant execute to authenticated` que ficou faltando.
 */
async function inlineAtivo(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("documento_inline_ativo");

  if (error) {
    // 🔑 AUSÊNCIA DE LINHA EM `gps.config` NÃO CHEGA AQUI: quem trata o
    // ausente é o `coalesce` DENTRO da função, que devolve `true` sem erro.
    // Um `error` aqui é falha de infraestrutura — rede, PostgREST fora,
    // migração não aplicada (`42883`) ou grant faltando (`42501`) — e por
    // isso continua valendo a pena logar: depois da …310 este log deve ser
    // RARO. Se voltar a ser constante, é sinal de ambiente desatualizado, não
    // de configuração.
    logErro("documento/inlineAtivo", error, {
      rpc: "gps.documento_inline_ativo",
    });
    return true;
  }
  return data !== false;
}

type DocumentoResolvido = {
  bucket: string;
  path: string;
  nome: string;
  /** Tamanho GRAVADO (bytes), lido de `storage.objects.metadata` pela RPC no
   * momento do upload. `null` quando a linha é antiga e não tem o dado. */
  tamanho: number | null;
};

/**
 * Descobre bucket/caminho/nome/tamanho do documento pedido, SEMPRE com a
 * sessão de quem chama — a RLS é que decide, não uma comparação de `alunoId`
 * feita aqui.
 *
 * `null` = não existe, não é seu, ou o caminho gravado está fora do formato.
 * Os três colapsam de propósito (ver o comentário do 404 no topo).
 *
 * ⚠️ `switch` EXAUSTIVO sobre `TipoDocumento`: acrescentar `"croqui"` a
 * `TIPOS_DOCUMENTO` sem acrescentar o ramo aqui QUEBRA O BUILD (o `never` no
 * default). É a extensibilidade que a fatia 6 vai usar.
 */
async function resolverDocumento(
  tipo: TipoDocumento,
  clienteId: string,
  id: string,
): Promise<DocumentoResolvido | null> {
  const supabase = await createClient();

  switch (tipo) {
    case "contrato": {
      // O contrato é UM anexo por ficha (colunas `contrato_*` de
      // `gps.etapa1_clientes`, migração …214) — não tem id próprio. O `[id]`
      // da URL é literalmente "contrato"; VALIDAR em vez de ignorar, para que
      // `/documento/contrato/<uuid-de-outra-coisa>` não vire um segundo
      // endereço para o mesmo recurso.
      if (id !== "contrato") return null;

      // Mesma leitura de `fichaDoCliente` (`src/app/clientes/actions.ts`): a
      // RLS de `gps.etapa1_clientes` só devolve linha para o dono do ambiente
      // (`gps.aluno_atual()`) ou para o admin — que é a regra de permissão do
      // `urlDeDownloadDoContratoCliente` copiada sem reescrever.
      // Colunas nomeadas, nunca `select("*")`.
      const { data, error } = await supabase
        .schema("gps")
        .from("etapa1_clientes")
        .select("id, contrato_path, contrato_nome, contrato_tamanho")
        .eq("id", clienteId)
        .maybeSingle();

      if (error) {
        logErro("documento/resolverDocumento", error, { tipo, tabela: "etapa1_clientes" });
        return null;
      }
      const path = (data?.contrato_path as string | null) ?? null;
      if (!path || !CONTRATO_PATH_REGEX.test(path)) return null;

      return {
        bucket: BUCKET_CONTRATO,
        path,
        nome: (data?.contrato_nome as string | null) ?? "contrato",
        tamanho: (data?.contrato_tamanho as number | null) ?? null,
      };
    }

    case "minuta": {
      // Mesma leitura de `urlDeDownloadDaMinutaCliente`
      // (`src/app/clientes/minuta-actions.ts`): filtra por `id` **e**
      // `cliente_id`. O par importa — sem o `cliente_id`, um id de minuta de
      // OUTRO cliente do mesmo ambiente seria servido sob a URL deste, e a
      // RLS (que é por ambiente) não reclamaria.
      const { data, error } = await supabase
        .schema("gps")
        .from("cliente_minutas")
        .select("id, cliente_id, path, nome, tamanho")
        .eq("id", id)
        .eq("cliente_id", clienteId)
        .maybeSingle();

      if (error) {
        logErro("documento/resolverDocumento", error, { tipo, tabela: "cliente_minutas" });
        return null;
      }
      if (!data) return null;

      const path = data.path as string;
      if (!MINUTA_PATH_REGEX.test(path)) return null;

      return {
        bucket: BUCKET_MINUTAS,
        path,
        nome: (data.nome as string) || "minuta.pdf",
        tamanho: (data.tamanho as number | null) ?? null,
      };
    }

    case "croqui": {
      // Molde LITERAL do ramo `minuta` acima — mesmo par de filtros (`id` E
      // `cliente_id`), mesmo motivo: a RLS de `gps.cliente_croquis`
      // (`cliente_croquis_select`) é por AMBIENTE, então sem o `cliente_id`
      // um croqui de OUTRO cliente do mesmo ambiente seria servido sob a URL
      // deste e a policy não reclamaria. A policy continua sendo a fronteira
      // (admin via `gp_is_admin()` OU dono do ambiente via `gps.aluno_atual()`);
      // o par de filtros é o que impede a TROCA de cliente dentro do que a
      // policy já autoriza.
      //
      // Colunas nomeadas, nunca `select("*")`: `getCroquisDoCliente` precisa
      // de 10 colunas para a LISTA; aqui só 5 servem à resposta HTTP.
      const { data, error } = await supabase
        .schema("gps")
        .from("cliente_croquis")
        .select("id, cliente_id, path, nome, tamanho")
        .eq("id", id)
        .eq("cliente_id", clienteId)
        .maybeSingle();

      if (error) {
        logErro("documento/resolverDocumento", error, { tipo, tabela: "cliente_croquis" });
        return null;
      }
      if (!data) return null;

      const path = data.path as string;
      // Mesmo teste que o ramo `minuta` faz com `MINUTA_PATH_REGEX`: caminho
      // fora do formato `<ambiente>/<uuid>.pdf` não vai ao Storage, para o
      // erro não voltar como falha genérica de bucket. O CHECK
      // `chk_cliente_croquis_path` já garante isso no banco — aqui é a
      // segunda leitura da mesma regra, do lado de quem monta a requisição.
      if (!CROQUI_PATH_REGEX.test(path)) return null;

      return {
        bucket: BUCKET_CROQUIS,
        path,
        nome: (data.nome as string) || "croqui.pdf",
        tamanho: (data.tamanho as number | null) ?? null,
      };
    }

    default: {
      const _exaustivo: never = tipo;
      return _exaustivo;
    }
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clienteId: string; tipo: string; id: string }> },
): Promise<Response> {
  const { clienteId, tipo, id } = await params;

  // 1. Allowlist FECHADA. Fora dela é 404, não 400 — um 400 confirmaria que a
  //    rota existe e que só o vocabulário estava errado.
  if (!ehTipoDocumento(tipo)) return resposta(404, MSG_INDISPONIVEL);
  if (!clienteId || !id) return resposta(404, MSG_INDISPONIVEL);

  // 2. Sessão. Sem sessão é 404, NÃO 401 nem redirect: 401 numa URL de
  //    documento de terceiro já é informação ("este endereço existe"), e
  //    redirect para /login faria um `<iframe>` renderizar a tela de login
  //    dentro da ficha. `getContextoSessao` é memoizada por requisição.
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    // Sessão INDETERMINADA (a consulta de papel falhou) nunca vira "pode ver":
    // o modo de falha é fechado.
    logErro("documento/GET", e, { etapa: "sessao" });
    return resposta(404, MSG_INDISPONIVEL);
  }
  if (!ctx || ctx.papel === "sem_acesso") return resposta(404, MSG_INDISPONIVEL);

  // 3. Interruptor de reversão (desligar sem deploy).
  if (!(await inlineAtivo())) return resposta(404, MSG_INDISPONIVEL);

  // 4. Resolver o documento COM A SESSÃO (a RLS decide). Uma URL só para aluno
  //    e admin: a guarda de hoje já aceita admin (modo assistência), então o
  //    admin no modo assistência usa exatamente este endereço.
  const doc = await resolverDocumento(tipo, clienteId, id);
  if (!doc) return resposta(404, MSG_INDISPONIVEL);

  // 4-bis. 🔴 TRILHA LGPD — só quando quem lê é a EQUIPE (admin).
  //
  //   POR QUE SÓ ADMIN: o evento que interessa registrar é ACESSO
  //   ADMINISTRATIVO a documento de terceiro. O parceiro abrindo o próprio
  //   croqui/minuta/contrato está lendo o que ele mesmo produziu na própria
  //   ficha — isso não é acesso administrativo, é uso do produto. Gravar
  //   também esse caso teria dois custos e nenhum ganho: encheria o Diário do
  //   ambiente com N linhas por minuto (abrir documento é clique repetido,
  //   não ato raro), escondendo justamente a linha que importa — a da equipe;
  //   e `gps.aluno_eventos` é a trilha lida PELO admin sobre o ambiente, não
  //   um log de navegação do dono.
  //
  //   A RPC já ignora não-admin sozinha (retorna em silêncio, sem gravar):
  //   a guarda de verdade é `coalesce(public.gp_is_admin(), false)` DENTRO
  //   dela, nunca este `if`. O `if` aqui é só para POUPAR A IDA AO BANCO do
  //   parceiro — não é fronteira, e não pode ser lido como tal.
  //
  //   `ctx.papel === "admin"` em vez de `await ehAdmin()`: `ehAdmin()` chama
  //   `getContextoSessao()` e devolve exatamente esta comparação; o `ctx` já
  //   está na mão desde o passo 2. Zero round-trip a mais.
  //
  // 🔑 FALHA NA TRILHA NÃO BLOQUEIA A RESPOSTA — e esta é uma DIVERGÊNCIA
  //   consciente do precedente `getBriefingDaSessao`
  //   (`src/lib/data/sessoes.ts`), que devolve `briefing: null` + `erro`
  //   quando a RPC falha. Lá isso é a única saída possível: trilha e LEITURA
  //   são a MESMA chamada (`gps.sessao_briefing_ler` grava `acessos_log` e
  //   devolve o briefing no mesmo `rpc`) — não há como entregar o dado sem a
  //   trilha, porque é um só round-trip indivisível. Aqui são DUAS chamadas
  //   separadas, e a leitura já foi autorizada pela RLS no passo 4. Derrubar
  //   a resposta por falha de rede na trilha tiraria a equipe de um documento
  //   que ela pode ver, sem proteger nada.
  //
  //   ⚠️ O preço está declarado: uma falha desta RPC é uma leitura de admin
  //   que NÃO entra na trilha. Por isso ela é logada com `logErro` —
  //   `gps.cliente_documento_registrar_leitura` só erra por infraestrutura
  //   (rede, PostgREST fora, `42883` de migração não aplicada, `42501` de
  //   grant faltando); linha inexistente vira `P0002` e é caso REAL de dado
  //   sumindo entre o passo 4 e aqui. Log constante = ambiente desatualizado.
  if (ctx.papel === "admin") {
    const supabaseTrilha = await createClient();
    const { error: erroTrilha } = await supabaseTrilha
      .schema("gps")
      .rpc("cliente_documento_registrar_leitura", {
        p_cliente_id: clienteId,
        p_tipo: tipo,
        // 🔴 `p_documento_id` é `uuid` no banco, e o `[id]` do CONTRATO é a
        //    string literal `"contrato"` (o contrato é UM anexo por ficha,
        //    colunas `contrato_*`, sem id próprio — ver o ramo `contrato` de
        //    `resolverDocumento`). Mandar `"contrato"` num parâmetro `uuid`
        //    dá `22P02` (invalid_text_representation) e a trilha falharia em
        //    TODA leitura de contrato por admin. `null` é o valor correto —
        //    não há documento_id — e a RPC aceita nulo de propósito: o `tipo`
        //    já diz qual documento é, e `entidade_id` é o CLIENTE.
        p_documento_id: tipo === "contrato" ? null : id,
      });
    if (erroTrilha) {
      // Sem PII: nem nome de arquivo nem caminho (o caminho carrega o id do
      // ambiente). Só o tipo e o cliente, que `logErro` já admite.
      logErro("documento/trilha", erroTrilha, {
        rpc: "gps.cliente_documento_registrar_leitura",
        tipo,
        clienteId,
      });
    }
  }

  // 5. 🔴 TETO ANTES DE BAIXAR. O tamanho vem do BANCO (escrito pela RPC a
  //    partir de `storage.objects.metadata`), não do navegador e não do
  //    `Content-Length` do Storage. Conferir depois do download não protegeria
  //    a RAM — o custo já teria sido pago.
  //
  //    `tamanho` nulo (linha antiga) NÃO passa livre: segue para o download,
  //    onde o tamanho REAL do buffer é conferido logo depois. Deixar passar
  //    sem nenhum teto era a única forma de o limite ser contornável.
  if (doc.tamanho !== null && doc.tamanho > LIMITE_DOCUMENTO_BYTES) {
    return resposta(
      413,
      "Este documento é grande demais para pré-visualizar. Baixe o arquivo para abrir.",
    );
  }

  // 6. Download no SERVIDOR, com a sessão do usuário — nunca `service_role`.
  const supabase = await createClient();
  const { data: blob, error: erroDownload } = await supabase.storage
    .from(doc.bucket)
    .download(doc.path);

  if (erroDownload || !blob) {
    // Sem PII e sem `path` (o caminho carrega o id do ambiente): só o tipo e o
    // cliente, que `logErro` já admite.
    logErro("documento/GET", erroDownload ?? "download sem corpo", {
      tipo,
      clienteId,
      bucket: doc.bucket,
    });
    return resposta(404, MSG_INDISPONIVEL);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  // Teto conferido de novo contra o tamanho REAL — cobre a linha sem
  // `tamanho` gravado e o caso de o byte no bucket ter divergido do metadado.
  if (bytes.byteLength > LIMITE_DOCUMENTO_BYTES) {
    return resposta(
      413,
      "Este documento é grande demais para pré-visualizar. Baixe o arquivo para abrir.",
    );
  }

  // 7. 🔴 O TIPO SAI DOS BYTES, NUNCA DE `metadata.mimetype`. Este é o motivo
  //    de a rota existir.
  const tipoReal = detectarTipoPorMagicBytes(bytes);
  if (!tipoReal) {
    // Barulhento de propósito: arquivo que não é nenhum dos 4 tipos, num
    // bucket que só aceita esses 4, é ou corrupção ou tentativa de contornar
    // a allowlist do PUT. Sem PII — nada de nome de arquivo nem caminho.
    logErro("documento/GET", "magic bytes não reconhecidos", {
      tipo,
      clienteId,
      bucket: doc.bucket,
      bytes: bytes.byteLength,
    });
    return resposta(
      415,
      "Este arquivo não pode ser pré-visualizado. Baixe o arquivo para abrir.",
    );
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      // Do magic byte. Se algum dia divergir do metadado do Storage, o magic
      // byte é que está certo — o metadado é declaração do cliente.
      "Content-Type": tipoReal,
      "Content-Disposition": nomeParaContentDisposition(doc.nome),
      // Tira do navegador o direito de adivinhar o tipo. Sem isto, o
      // `Content-Type` correto ainda poderia ser ignorado por sniffing.
      "X-Content-Type-Options": "nosniff",
      // `sandbox` sem token nenhum: sem script, sem formulário, sem plugin,
      // sem navegação de topo, e origem OPACA (o conteúdo não enxerga cookie
      // nem `localStorage` do GPS). É a rede de segurança para o dia em que a
      // detecção de tipo errar — PDF pode conter JavaScript.
      // ⚠️ NÃO é este o valor que chega ao navegador: o header de
      // `next.config.ts` SUBSTITUI por chave, e lá a regra da rota manda
      // `sandbox; frame-ancestors 'self'` (o `frame-ancestors` é o que deixa
      // a nossa própria ficha emoldurar o documento). Medido por curl em
      // 24/09/2026. Mudança de política de CSP desta rota é LÁ, não aqui.
      "Content-Security-Policy": "sandbox",
      // Documento de terceiro não entra em cache de disco nem de proxy.
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Length": String(bytes.byteLength),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// TRILHA LGPD — IMPLEMENTADA na fatia 6 (24/09/2026). Este bloco era o
// "ponto de extensão nomeado"; ficou como REGISTRO das travas que valeram.
//
// A gravação está no passo 4-bis do `GET` acima, e NÃO é um `.insert()`:
// `gps.aluno_eventos` tem RLS SEM POLICY DE INSERT — escrita direta daqui
// falharia CALADA (0 linhas) e a trilha mentiria (tela dizendo que registra,
// tabela vazia). A porta é a RPC `gps.cliente_documento_registrar_leitura`
// (migração `20260924000311_gps_cliente_documento_lido`), `SECURITY DEFINER`,
// `search_path ''`, **volatile** (função que GRAVA não pode ser `stable` — o
// Postgres RECUSA o INSERT), com `revoke execute … from public, anon`
// (⚠️ revogar de `anon` sozinho NÃO basta quando a permissão vem de `PUBLIC`)
// e `grant execute to authenticated`.
//
// 🔑 A guarda de gravação é `coalesce(public.gp_is_admin(), false)` DENTRO da
// RPC. O `if (ctx.papel === "admin")` da rota é ECONOMIA DE ROUND-TRIP, não
// fronteira: tirá-lo faz o parceiro pagar uma ida ao banco que não grava
// nada, nunca abre a trilha para ele.
//
// ✅ CATÁLOGO FECHADO (conferido em 24/09/2026): `cliente_documento_lido`
// entra no CHECK de `gps.aluno_eventos.tipo` pela …311 **e** está em
// `TIPOS_EVENTO` (`src/lib/types.ts`) com rótulo em `ROTULO_TIPO_EVENTO`
// (`src/components/admin/diario-labels.ts`). Medido: 39 valores no catálogo
// TS e 39 rótulos — nenhum tipo sem rótulo. `cliente_entrevista_sem_contato`,
// `cliente_croqui_anexado` e `cliente_croqui_removido` também já entraram nos
// dois lados; a dívida dos "35 × 38" que este comentário descrevia não existe
// mais.
//
// ⚠️ A regra que continua valendo: `ROTULO_TIPO_EVENTO` é
// `Record<TipoEvento, string>`, então **tipo novo obriga rótulo no mesmo
// commit** (sem ele o build quebra com TS2741) — e o CHECK do banco é um
// TERCEIRO lugar, que nada no build compara com o TS. Tipo de evento novo
// toca os três.
// ─────────────────────────────────────────────────────────────────────────
