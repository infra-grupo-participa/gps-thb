"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { destinoInterno } from "@/lib/nav";
import { normalizarEmail, normalizarSenhaColada } from "@/lib/texto";
import { guardarConta } from "@/lib/contas-do-navegador";
import { nomeDoUsuario } from "@/lib/nome-do-usuario";

export interface LoginState {
  erro?: string;
  /**
   * O e-mail digitado, devolvido para o formulário reexibir quando dá erro.
   *
   * 🔴 Sem isto o campo voltava VAZIO a cada tentativa: o React remonta o
   * formulário no retorno da action. Caso real de 10/09/2026 (Helton):
   * *"quando digito essa senha apaga o e-mail informado e diz senha ou
   * e-mail não confere"* — com a senha CERTA, provado direto no GoTrue.
   *
   * ⚠️ A SENHA NUNCA volta aqui. Só o e-mail.
   */
  email?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // 🔑 TOLERANTE AO QUE A PESSOA COLA. A equipe manda login e senha por
  // WhatsApp; o que chega vem com espaço no fim, espaço não separável
  // (U+00A0, que o WhatsApp insere), letra maiúscula do teclado do celular
  // e, às vezes, caracteres invisíveis de formatação.
  //
  // O GoTrue casa o e-mail em minúsculas, então normalizar aqui é o que faz
  // a diferença entre "entrou" e "e-mail ou senha inválidos" para alguém que
  // digitou tudo certo.
  const email = normalizarEmail(String(formData.get("email") ?? ""));
  // ⚠️ A SENHA NÃO é normalizada: espaço pode fazer parte dela de propósito.
  // Só os invisíveis de formatação saem, que ninguém digita por vontade.
  const senha = normalizarSenhaColada(String(formData.get("senha") ?? ""));
  // Campo oculto do formulário = input do cliente. Revalidar aqui, mesmo
  // que a página já tenha sanitizado ao montar o campo.
  const destino = destinoInterno(String(formData.get("redirect") ?? ""));

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    // ═══════════════════════════════════════════════════════════════════
    // 🔑 O CÓDIGO DO GRUPO VALE NO CAMPO DE SENHA (10/09/2026)
    // ═══════════════════════════════════════════════════════════════════
    //
    // Pedido do Marcio no meio do evento de acessos: *"ele coloca o e-mail
    // + senha de 1 a 8, e entra"*. A pessoa não precisa saber que existe
    // uma tela diferente — ela digita onde já estava digitando.
    //
    // ⚠️ A ORDEM É O QUE PROTEGE QUEM JÁ TEM SENHA. A tentativa real
    //    acontece PRIMEIRO, acima. Só quando ela falha é que o código é
    //    considerado — então:
    //      · quem tem senha própria entra por ela, sempre;
    //      · a senha de ninguém é trocada por engano;
    //      · e se alguém escolheu `12345678` como senha de verdade, o
    //        login normal já resolveu antes de chegar aqui.
    //
    // A RPC recusa conta de EQUIPE (o código é público no grupo) e registra
    // toda entrada em `gps.resgate_tentativas`.
    const entrou = await tentarEntrarPeloCodigo(email, senha);
    if (entrou.ok) {
      // A RPC trocou a senha por uma temporária e devolveu qual é: entra com
      // ela agora. O passo 0 do onboarding pede a senha nova em seguida.
      const r2 = await supabase.auth.signInWithPassword({
        email: entrou.email,
        password: entrou.senha,
      });
      if (!r2.error) {
        await guardarContaSilencioso(supabase, r2.data, entrou.email);
        redirect(destino);
      }
    }

    // O e-mail volta para o campo: quem errou a senha não redigita o e-mail,
    // e quem errou o e-mail vê o que de fato mandou.
    return { erro: "E-mail ou senha inválidos.", email };
  }

  // Entrou: a conta passa a ficar disponível no menu "trocar de conta" deste
  // navegador, por 7 dias de inatividade. Falha aqui NÃO derruba o login —
  // pior caso é a conta não aparecer no menu e a pessoa digitar a senha de
  // novo, que é exatamente o que acontecia antes desta feature existir.
  try {
    if (data.session?.refresh_token && data.user) {
      await guardarConta({
        userId: data.user.id,
        email: data.user.email ?? email,
        nome: await nomeDoUsuario(supabase, data.user.id),
        refreshToken: data.session.refresh_token,
      });
    }
  } catch {
    // silencioso por desenho — ver acima
  }

  // `destino` já passou por `destinoInterno()` — sempre caminho interno.
  redirect(destino);
}

/**
 * O código do grupo, tentado DEPOIS que a senha real falhou.
 *
 * Devolve `ok: false` em qualquer recusa — código errado, e-mail que não é
 * do Programa, conta da equipe. Nunca lança: uma falha aqui não pode virar
 * erro 500 no login de quem só digitou a senha errada.
 */
async function tentarEntrarPeloCodigo(
  email: string,
  codigo: string,
): Promise<
  { ok: true; email: string; senha: string } | { ok: false }
> {
  try {
    const anon = createStatelessClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const h = await headers();
    const bruto =
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      h.get("x-real-ip");
    const ip = bruto
      ? createHash("sha256").update(bruto).digest("hex").slice(0, 32)
      : null;

    const { data, error } = await anon
      .schema("gps")
      .rpc("entrada_pelo_codigo", {
        p_email: email,
        p_codigo: codigo,
        p_ip_hash: ip,
      });
    if (error) return { ok: false };
    const c = data as { email?: string; senha?: string } | null;
    if (!c?.email || !c?.senha) return { ok: false };
    return { ok: true, email: c.email, senha: c.senha };
  } catch {
    return { ok: false };
  }
}

/** Guarda a conta no menu "trocar de conta". Falhar aqui não derruba o login. */
async function guardarContaSilencioso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: { session: { refresh_token: string } | null; user: { id: string; email?: string | null } | null },
  emailFallback: string,
) {
  try {
    if (data.session?.refresh_token && data.user) {
      await guardarConta({
        userId: data.user.id,
        email: data.user.email ?? emailFallback,
        nome: await nomeDoUsuario(supabase, data.user.id),
        refreshToken: data.session.refresh_token,
      });
    }
  } catch {
    // silencioso por desenho
  }
}
