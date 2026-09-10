import { cookies } from "next/headers";

import { getContextoSessao } from "@/lib/auth";
import { getMeuOnboarding } from "@/lib/data/onboarding";
import { navDoAluno } from "@/lib/nav";
import {
  concluirOnboarding,
  criarUploadAssinadoOnboarding,
  registrarAnexoOnboarding,
  removerAnexoOnboarding,
  salvarPassoOnboarding,
  trocarSenhaObrigatoria,
} from "@/app/onboarding/actions";
import { OnboardingPortal } from "./index";

/**
 * O portão do questionário inicial — **um lugar só, no `layout.tsx` da raiz**.
 *
 * ## Por que o layout da raiz, e não cada página
 *
 * O João disse *"assim que ele ingressar"*, e ingressar pode ser em
 * `/clientes` por um link do e-mail, ou em `/materiais` por um favorito. Um
 * `<OnboardingGate />` colado em cada `page.tsx` do aluno seriam nove arquivos
 * e a certeza de esquecer o décimo — é a lição literal de `navDoAluno` (CD7),
 * onde a regra do sócio estava copiada em nove páginas e uma nova nascia com a
 * aba errada por omissão.
 *
 * A alternativa era um layout de grupo (`src/app/(portal)/layout.tsx`), que
 * cobriria exatamente as rotas do aluno. Custaria mover nove diretórios,
 * `loading.tsx` e `error.tsx` incluídos, no meio de uma rodada com outro
 * agente escrevendo em `src/components/clientes/**` e nas páginas de clientes.
 * O ganho seria não montar este componente em `/login`, `/p/*` e `/admin` —
 * e é exatamente esse custo que as duas guardas abaixo zeram.
 *
 * ## As duas guardas, na ordem
 *
 * 1. **Sem cookie de sessão do Supabase, sai na hora.** É o caso de
 *    `/p/plantao` — rota PÚBLICA, embedada em iframe na Hotmart, sem login. Ler
 *    o cookie é síncrono; `getContextoSessao()` custaria um `auth.getUser()`,
 *    uma ida de rede ao GoTrue em sa-east-1 (~57 ms medidos neste projeto) em
 *    cada abertura da página mais pública do portal. **Isso é otimização, não
 *    segurança**: o portão não concede nada, só decide se desenha o pop-up.
 * 2. **`papel !== "aluno"` devolve `null`.** Admin, sócio sem vínculo e
 *    "sem_acesso" não respondem questionário nenhum — e o admin não tem
 *    `gps.pessoa_atual()`, então o pop-up nunca abre em modo assistência nem na
 *    prévia "como o aluno vê". A guarda de verdade é a RPC; esta é a da tela.
 *
 * Para quem É aluno, `getContextoSessao()` sai **de graça**: a sessão é
 * memoizada por requisição com `cache()` e a página já a chamou.
 * `precisaTrocarSenha` também não custa consulta — sai do
 * `user_metadata.gps_senha_temp_em` que já veio no mesmo `getUser()`.
 *
 * ## O que ele NÃO faz
 *
 * - **Não abre para quem já concluiu.** `getMeuOnboarding()` devolve
 *   `status: "concluido"` e o portão devolve `null` — sem montar diálogo, sem
 *   carregar o JS do questionário. É também o estado que a leitura assume
 *   quando a RPC falha, para o pop-up jamais reaparecer sobre quem já
 *   respondeu.
 * - **Não busca o próximo passo.** A tela final oferece "Ir para o meu próximo
 *   passo" quando recebe `proximoPasso`, e calcular isso exige `getEtapas`,
 *   `getClientesEtapa1` e `getProgressoAluno` — três consultas que rodariam em
 *   TODA página do aluno enquanto o questionário estivesse aberto, para
 *   aparecer numa única tela. O botão "Começar" fecha o diálogo e devolve a
 *   pessoa à página onde ela estava; o card "Continue de onde parou" da home
 *   já dá o próximo passo, calculado por quem carrega esses dados de qualquer
 *   forma.
 */
export async function OnboardingGate() {
  // Guarda 1 — sem cookie de sessão não há o que perguntar a ninguém.
  // `@supabase/ssr` grava a sessão em `sb-<ref>-auth-token` (e em pedaços
  // `.0`, `.1` quando o JWT é grande): o `includes` cobre os dois formatos.
  const jar = await cookies();
  const temSessao = jar
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!temSessao) return null;

  // Guarda 2 — só o ALUNO responde. Memoizado: para as páginas do aluno esta
  // chamada não custa nada, porque a página já a fez.
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno") return null;

  const dados = await getMeuOnboarding();
  if (!dados || dados.status === "concluido") return null;

  return (
    <OnboardingPortal
      dados={dados}
      // O tour itera as abas REAIS desta pessoa (o sócio não vê Financeiro),
      // nunca uma lista fixa.
      abas={navDoAluno(ctx)}
      actions={{
        salvarPasso: salvarPassoOnboarding,
        criarUploadAssinado: criarUploadAssinadoOnboarding,
        registrarAnexo: registrarAnexoOnboarding,
        removerAnexo: removerAnexoOnboarding,
        concluir: concluirOnboarding,
        trocarSenha: trocarSenhaObrigatoria,
      }}
      proximoPasso={null}
    />
  );
}
