import "server-only";

import { cookies } from "next/headers";

/**
 * Alternar entre contas — o "trocar de conta" do Gmail, aplicado ao portal.
 *
 * Pedido do Marcio (10/09/2026): "eu quero alternar entre contas existentes,
 * mudar rápido de um acesso pra outro". Não é entrar no ambiente de terceiro
 * (isso é o Modo Assistência, que já existe): é a MESMA pessoa tendo as
 * PRÓPRIAS contas à mão — admin e aluno de teste, por exemplo.
 *
 * ── COMO FUNCIONA ────────────────────────────────────────────────────────
 * Ao entrar numa conta, o refresh token dela é guardado num cookie próprio
 * deste navegador. Trocar de conta é reidratar a sessão a partir dele — sem
 * digitar senha de novo, enquanto o registro valer.
 *
 * 🔴 NADA DISSO VAI PARA O BANCO. Nenhuma linha, nenhuma tabela: o cofre é o
 * cookie, some quando o navegador some. O Marcio pediu explicitamente para
 * "não sobrecarregar o banco com múltiplas contas vinculadas".
 *
 * ── AS TRAVAS, E POR QUE CADA UMA ────────────────────────────────────────
 *
 * 1. **`httpOnly`.** JavaScript da página não lê este cookie. Sem isso, um
 *    XSS em qualquer tela levaria embora TODAS as contas de uma vez, em vez
 *    de só a sessão ativa.
 *
 * 2. **7 dias** (`MAX_IDADE_S`), decisão do Marcio. É prazo de INATIVIDADE:
 *    cada uso renova. Quem não volta em uma semana faz login de novo.
 *
 * 3. **Teto de 4 contas.** Um cookie cresce com o que se guarda nele, e
 *    cabeçalho grande é enviado em TODA requisição. Quatro cobre o caso real
 *    (admin + teste + eventual segunda conta) sem virar depósito.
 *
 * 4. **`sameSite: "lax"`.** O cookie não viaja em requisição de outro site.
 *
 * ⚠️ O QUE ISTO NÃO PROTEGE, e está aceito com o custo na mesa:
 *    quem tiver o navegador DESTRAVADO entra em todas as contas guardadas,
 *    sem senha. E como `auth.users` é compartilhado pelos 7 sistemas do
 *    grupo, a sessão vale em todos eles — não só no GPS. É o mesmo risco de
 *    deixar o Gmail logado, e a mitigação é a mesma: bloquear a máquina.
 */

const COOKIE = "gps_contas";

/** 7 dias de INATIVIDADE — cada uso renova o prazo. Decisão do Marcio. */
const MAX_IDADE_S = 7 * 24 * 60 * 60;

/** Cabeçalho grande vai em toda requisição; 4 cobre o caso real. */
const MAX_CONTAS = 4;

export interface ContaGuardada {
  /** `auth.users.id` — a identidade, e a chave de deduplicação. */
  userId: string;
  email: string;
  nome: string | null;
  /** Como a sessão é reidratada sem pedir senha. */
  refreshToken: string;
  /** Epoch em segundos. Serve ao expurgo e à ordem do menu. */
  em: number;
}

function agora(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * As contas guardadas neste navegador, da mais recente para a mais antiga.
 *
 * 🔑 Expurga o que passou do prazo NA LEITURA, não por job: o cofre é do
 * navegador, e não existe processo que o varra. Ler é o único momento em que
 * o vencimento pode ser percebido.
 *
 * Cookie corrompido (ou de uma versão antiga do formato) devolve lista
 * vazia, nunca erro: o pior caso é a pessoa fazer login de novo.
 */
export async function lerContas(): Promise<ContaGuardada[]> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return [];
  try {
    const bruto: unknown = JSON.parse(
      Buffer.from(c, "base64url").toString("utf8"),
    );
    if (!Array.isArray(bruto)) return [];
    const limite = agora() - MAX_IDADE_S;
    return bruto
      .filter(
        (x): x is ContaGuardada =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as ContaGuardada).userId === "string" &&
          typeof (x as ContaGuardada).email === "string" &&
          typeof (x as ContaGuardada).refreshToken === "string" &&
          typeof (x as ContaGuardada).em === "number" &&
          (x as ContaGuardada).em > limite,
      )
      .sort((a, b) => b.em - a.em)
      .slice(0, MAX_CONTAS);
  } catch {
    return [];
  }
}

async function gravar(contas: ContaGuardada[]): Promise<void> {
  const store = await cookies();
  if (contas.length === 0) {
    store.delete(COOKIE);
    return;
  }
  const valor = Buffer.from(JSON.stringify(contas), "utf8").toString(
    "base64url",
  );
  store.set(COOKIE, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_IDADE_S,
  });
}

/**
 * Guarda (ou renova) uma conta no cofre.
 *
 * 🔑 A chave é o `userId`, não o e-mail: e-mail muda, identidade não. Guardar
 * por e-mail deixaria duas entradas para a mesma pessoa depois de uma troca
 * de endereço — e o menu ofereceria uma sessão que não existe mais.
 */
export async function guardarConta(
  conta: Omit<ContaGuardada, "em">,
): Promise<void> {
  const atuais = await lerContas();
  const semEla = atuais.filter((x) => x.userId !== conta.userId);
  await gravar([{ ...conta, em: agora() }, ...semEla].slice(0, MAX_CONTAS));
}

/** Tira uma conta do cofre — o "sair desta conta" do menu. */
export async function esquecerConta(userId: string): Promise<void> {
  const atuais = await lerContas();
  await gravar(atuais.filter((x) => x.userId !== userId));
}

/** Esvazia o cofre. Usado no logout completo. */
export async function esquecerTodas(): Promise<void> {
  await gravar([]);
}
