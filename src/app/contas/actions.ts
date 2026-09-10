"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import {
  esquecerConta,
  esquecerTodas,
  guardarConta,
  lerContas,
} from "@/lib/contas-do-navegador";
import { nomeDoUsuario } from "@/lib/nome-do-usuario";

/**
 * Trocar de conta — o "mudar rápido de um acesso pra outro" que o Marcio
 * pediu em 10/09/2026.
 *
 * A troca é uma REIDRATAÇÃO: pega o refresh token que este navegador guardou
 * quando a pessoa entrou naquela conta e pede uma sessão nova ao GoTrue. Não
 * há senha no caminho, e não há nada disso no banco.
 *
 * 🔴 SÓ TROCA PARA CONTA QUE ESTÁ NO COFRE DESTE NAVEGADOR. O parâmetro é um
 * `userId`, e ele é procurado na lista guardada — quem mandar um id qualquer
 * recebe "sessão expirada", não uma sessão. Sem essa busca, a action viraria
 * "me dê a sessão de quem eu apontar", que é escalada de privilégio pura.
 *
 * 🔑 Antes de trocar, a conta ATUAL é regravada no cofre: sem isso, sair de
 * A para B deixaria A de fora e a volta exigiria senha — o oposto do pedido.
 */
export async function trocarDeConta(userId: string): Promise<{ erro?: string }> {
  const alvo = (await lerContas()).find((c) => c.userId === userId);
  if (!alvo) {
    return { erro: "Sessão expirada. Entre nesta conta de novo." };
  }

  const supabase = await createClient();

  // Regrava a conta atual ANTES de trocar — senão a volta pediria senha.
  try {
    const { data: sessaoAtual } = await supabase.auth.getSession();
    const { data: userAtual } = await supabase.auth.getUser();
    if (sessaoAtual.session?.refresh_token && userAtual.user) {
      await guardarConta({
        userId: userAtual.user.id,
        email: userAtual.user.email ?? "",
        nome: await nomeDoUsuario(supabase, userAtual.user.id),
        refreshToken: sessaoAtual.session.refresh_token,
      });
    }
  } catch {
    // Não impede a troca: no pior caso a conta anterior sai do menu.
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: alvo.refreshToken,
  });

  if (error || !data.session || !data.user) {
    // O refresh token venceu ou foi revogado (troca de senha em qualquer um
    // dos 7 sistemas do grupo faz isso). Tira do cofre: oferecer uma conta
    // que não abre é pior do que não oferecer.
    await esquecerConta(userId);
    logErro("contas/trocar", error, { userId });
    return { erro: "Sessão expirada. Entre nesta conta de novo." };
  }

  // Renova o carimbo (e o nome, que pode ter mudado) da conta que passou a
  // ser a ativa.
  await guardarConta({
    userId: data.user.id,
    email: data.user.email ?? alvo.email,
    nome: (await nomeDoUsuario(supabase, data.user.id)) ?? alvo.nome,
    refreshToken: data.session.refresh_token,
  });

  // A home decide para onde cada papel vai (admin → /admin, aluno → /).
  redirect("/");
}

/** Tira uma conta do menu deste navegador. Não desloga de lugar nenhum. */
export async function esquecerContaDoMenu(
  userId: string,
): Promise<{ ok: true }> {
  await esquecerConta(userId);
  return { ok: true };
}

/**
 * As contas do menu, sem o segredo.
 *
 * 🔴 O `refreshToken` NUNCA sai daqui. O componente recebe id, e-mail e nome
 * — o suficiente para desenhar a lista. Mandar o token ao cliente anularia o
 * `httpOnly` do cofre.
 */
export async function contasDoMenu(): Promise<
  { userId: string; email: string; nome: string | null }[]
> {
  return (await lerContas()).map(({ userId, email, nome }) => ({
    userId,
    email,
    nome,
  }));
}

/** Logout de verdade: encerra a sessão e esvazia o cofre. */
export async function sairDeTodas(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await esquecerTodas();
  redirect("/login");
}
