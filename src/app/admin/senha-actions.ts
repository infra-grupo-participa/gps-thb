"use server";

import { emailParaIlike, emailValido } from "@/lib/texto";
import { gerarSenhaTemporaria } from "@/lib/senha-temporaria";
import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { enviarCredenciaisAcesso } from "@/lib/email";
import { traduzirErroBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { mapearStatusAcesso } from "@/lib/data/central";
import { MSG_SENHA_MINIMO, SENHA_MINIMO } from "@/lib/senha-regras";
import type { PapelMembro } from "@/lib/types";
import type { MembroAcesso, StatusAcesso } from "@/lib/acesso-tipos";

// `MembroAcesso`/`StatusAcesso` moraram aqui como `export interface` até
// 11/09/2026 (feature "trocar e-mail do login pela tela do admin") — bomba
// armada num módulo `"use server"`, que só pode exportar função async. Os
// tipos agora vivem em `@/lib/acesso-tipos`; os componentes cliente que só
// precisavam do tipo (dialogos.tsx, membros-view.tsx, painel.tsx,
// senha-de-membro.tsx) importam de lá com `import type`. Reexportado aqui
// só para não quebrar quem ainda importa `type { MembroAcesso } from
// "@/app/admin/senha-actions"` — preferir sempre `@/lib/acesso-tipos`.
export type { MembroAcesso, StatusAcesso };

/**
 * Gestão do acesso do aluno pelo painel — sem depender de e-mail e sem
 * `service_role`. O trabalho pesado (mexer em `auth.users`) fica em funções
 * SECURITY DEFINER no schema `gps`, liberadas só para admin
 * (`public.gp_is_admin()`): `admin_status_acesso`, `admin_definir_senha`,
 * `admin_definir_senha_membro`, `admin_excluir_acesso`,
 * `admin_adicionar_socio` e `admin_excluir_membro`.
 * Ver migração `gps_admin_gestao_de_acesso` (e a extensão para sócios), o
 * retrato em `...118` e `...132` (senha do membro).
 */

// A senha temporária (`Thb-7f3a-2b9c`) vem de `@/lib/senha-temporaria`: o
// MESMO gerador que `src/app/admin/actions.ts` usa ao criar o acesso. Um
// módulo `"use server"` não pode exportar função síncrona, por isso ela não
// mora aqui.

/** Diagnóstico do acesso: mostra exatamente onde o aluno trava. */
export async function statusAcessoAluno(
  alunoId: string,
): Promise<{ erro?: string; status?: StatusAcesso }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_status_acesso", { p_aluno_id: alunoId });

  if (error) {
    return { erro: traduzirErroBanco("admin/statusAcessoAluno", error) };
  }

  // O mapeamento vive em `src/lib/data/central.ts` (a Central de resolução lê a
  // MESMA RPC): um módulo `"use server"` só pode exportar função async, então o
  // mapeador puro não cabe aqui. Duas cópias do mapeamento seriam duas
  // verdades sobre o mesmo jsonb.
  return { status: mapearStatusAcesso(data) };
}

/**
 * Define a senha do aluno na hora e devolve as credenciais para o admin
 * repassar. Também confirma o e-mail, derruba as sessões antigas e garante o
 * vínculo aluno ⇄ login. O e-mail é só cortesia: se não sair, o acesso já
 * está valendo do mesmo jeito.
 *
 * 🔴 MESMA GUARDA CROSS-SISTEMA de `definirSenhaMembro` (war-room 10/09,
 * achado B2). Esta função endereça o AMBIENTE e cai sempre no TITULAR; a de
 * baixo endereça `gps.membros.id`. As duas trocam a senha da pessoa nos 7
 * portais que compartilham `auth.users` e derrubam as sessões dela — e só uma
 * avisava. Duas portas para o mesmo efeito com atritos opostos é o defeito;
 * agora as duas param, nomeiam os programas e esperam confirmação.
 *
 * Retorno com `precisaConfirmar: true` significa **nada foi alterado**: repita
 * a chamada com `confirmarOutrosSistemas: true`.
 */
export async function definirSenhaAluno(
  alunoId: string,
  opts?: {
    senha?: string;
    enviarEmail?: boolean;
    confirmarOutrosSistemas?: boolean;
  },
): Promise<{
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  telefone?: string | null;
  nome?: string | null;
  /** A conta tem papel em OUTRO sistema do grupo; nada foi alterado. Repita com `confirmarOutrosSistemas: true`. */
  precisaConfirmar?: boolean;
  programas?: string[];
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
  }

  const supabase = await createClient();

  // Antes de trocar a senha (e derrubar as sessões) de uma conta privilegiada
  // em OUTRO portal, o admin precisa saber — e confirmar. `admin_status_acesso`
  // é a MESMA RPC que a tela já usa: `email_login` é o e-mail do titular, que
  // é exatamente quem `admin_definir_senha` atinge. "GPS" sai da lista porque é
  // o portal em que o admin já está.
  if (opts?.confirmarOutrosSistemas !== true) {
    const { data: status } = await supabase
      .schema("gps")
      .rpc("admin_status_acesso", { p_aluno_id: alunoId });
    const emailLogin = (status as { email_login?: string | null } | null)
      ?.email_login;
    if (emailLogin) {
      const { data: prog, error: erroProg } = await supabase
        .schema("gps")
        .rpc("admin_programas_do_email", { p_email: emailLogin });
      // Falha FECHADA: sem saber em quais portais a conta tem papel, não se
      // troca senha nenhuma (Fable, war-room 10/09).
      if (erroProg) {
        return { erro: traduzirErroBanco("admin/definirSenhaAluno.programas", erroProg) };
      }
      const programas = (
        (prog as { programas?: { programa: string }[] } | null)?.programas ?? []
      )
        .map((x) => x.programa)
        .filter((nome) => nome !== "GPS");
      if (programas.length > 0) {
        return { precisaConfirmar: true, programas };
      }
    }
  }

  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_definir_senha", { p_aluno_id: alunoId, p_senha: senha });

  if (error) {
    return { erro: traduzirErroBanco("admin/definirSenhaAluno", error) };
  }

  const email = (data as { email?: string })?.email ?? null;
  if (!email) return { erro: "Não foi possível identificar o login do aluno." };

  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("nome, telefone")
    .eq("id", alunoId)
    .maybeSingle();

  let emailEnviado = false;
  if (opts?.enviarEmail !== false) {
    const envio = await enviarCredenciaisAcesso({
      para: email,
      nome: aluno?.nome ?? null,
      senha,
      precisaConfirmar: false,
    });
    emailEnviado = envio.ok;
  }

  revalidatePath("/admin", "layout");
  return {
    email,
    senha,
    emailEnviado,
    nome: aluno?.nome ?? null,
    telefone: aluno?.telefone ?? null,
  };
}

/**
 * Define a senha de UM MEMBRO do ambiente (o remédio que faltava para o
 * sócio — PL8). `definirSenhaAluno` acima endereça o AMBIENTE e sempre cai no
 * titular (`gps.admin_user_do_aluno`); esta endereça `gps.membros.id`, que é
 * exatamente a linha que o admin clicou em "Gerenciar acesso".
 *
 * Antes disso, a única saída para um sócio travado era removê-lo e
 * re-adicioná-lo — o que APAGA o login e o histórico dele.
 *
 * As guardas ficam todas no banco (`gps.admin_definir_senha_membro`,
 * migração ...132): admin, senha ≥ 8, o membro existe, tem login, não é
 * conta de equipe e não é quem está executando. O `ehAdmin()` daqui é a
 * primeira porta, não a única — quem decide é a RPC.
 *
 * Nome e telefone saem de `thb_alunos` pelo E-MAIL do login: para o sócio,
 * `gps.membros.aluno_id` é o id do AMBIENTE (o titular), então buscar por ele
 * traria o nome errado no e-mail e no link de WhatsApp. Sem cadastro
 * correspondente, os dois voltam nulos e a tela some com o botão de WhatsApp.
 */
export async function definirSenhaMembro(
  membroId: string,
  opts?: { senha?: string; enviarEmail?: boolean; confirmarOutrosSistemas?: boolean },
): Promise<{
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  papel?: PapelMembro;
  telefone?: string | null;
  nome?: string | null;
  /** A conta tem papel em OUTRO sistema do grupo; nada foi alterado. Repita com `confirmarOutrosSistemas: true`. */
  precisaConfirmar?: boolean;
  programas?: string[];
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
  }

  const supabase = await createClient();

  // Pentest de 09/09 (MÉDIO): `gps.admin_alvo_e_equipe` só enxerga public.perfis,
  // mas auth.users é compartilhado por 7 sistemas. Antes de trocar a senha (e
  // derrubar as sessões) de uma conta que é privilegiada em OUTRO portal, o admin
  // precisa saber — e confirmar. Nada muda no banco até a confirmação.
  if (opts?.confirmarOutrosSistemas !== true) {
    const { data: membro } = await supabase
      .schema("gps")
      .from("membros")
      .select("aluno_id")
      .eq("id", membroId)
      .maybeSingle();
    if (membro?.aluno_id) {
      const { data: status } = await supabase
        .schema("gps")
        .rpc("admin_status_acesso", { p_aluno_id: membro.aluno_id });
      const emailDoMembro = (
        (status as { membros?: { membro_id: string; email: string | null }[] } | null)?.membros ?? []
      ).find((m) => m.membro_id === membroId)?.email;
      if (emailDoMembro) {
        const { data: prog, error: erroProg } = await supabase
          .schema("gps")
          .rpc("admin_programas_do_email", { p_email: emailDoMembro });
        if (erroProg) {
          return { erro: traduzirErroBanco("admin/definirSenhaMembro.programas", erroProg) };
        }
        const programas = (
          (prog as { programas?: { programa: string }[] } | null)?.programas ?? []
        )
          .map((x) => x.programa)
          .filter((nome) => nome !== "GPS");
        if (programas.length > 0) {
          return { precisaConfirmar: true, programas };
        }
      }
    }
  }
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_definir_senha_membro", {
      p_membro_id: membroId,
      p_senha: senha,
    });

  if (error) {
    return {
      erro: traduzirErroBanco("admin/definirSenhaMembro", error, { membroId }),
    };
  }

  const resultado = (data ?? {}) as {
    email?: string;
    papel?: PapelMembro;
  };
  const email = resultado.email ?? null;
  if (!email) {
    // A senha JÁ trocou (a RPC commitou); o que falta é o e-mail para exibir.
    // Dizer "não foi possível" aqui seria mentira que faz o admin repetir a
    // operação e trocar a senha duas vezes.
    return {
      erro: "Senha definida, mas este login não tem e-mail para exibir.",
    };
  }

  // `ilike` com o e-mail escapado, não `eq`: `thb_alunos.email` é base
  // compartilhada com o sip e guarda o que a pessoa digitou ("Fulano@X.com"),
  // enquanto o login vem sempre em minúsculas do GoTrue. Com `eq` o cadastro
  // não casava e o admin recebia a senha certa com nome e telefone vazios — a
  // tela some com o botão de WhatsApp exatamente quando ele é mais útil.
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("nome, telefone")
    .ilike("email", emailParaIlike(email))
    .maybeSingle();

  let emailEnviado = false;
  if (opts?.enviarEmail !== false) {
    const envio = await enviarCredenciaisAcesso({
      para: email,
      nome: aluno?.nome ?? null,
      senha,
      precisaConfirmar: false,
    });
    emailEnviado = envio.ok;
  }

  revalidatePath("/admin", "layout");
  return {
    email,
    senha,
    emailEnviado,
    papel: resultado.papel,
    nome: aluno?.nome ?? null,
    telefone: aluno?.telefone ?? null,
  };
}

/**
 * Apaga o AMBIENTE INTEIRO: dados do GPS + login de TODOS os membros
 * (titular e sócios) em `auth.users`. O cadastro em `thb_alunos` de cada um
 * permanece — é base compartilhada com o sip. Não confundir com
 * `excluirMembroAluno`, que tira só uma pessoa (sócio) do ambiente.
 */
export async function excluirAcessoAluno(
  alunoId: string,
  /**
   * 🔴 A SEGUNDA CONFIRMAÇÃO, quando o ambiente tem trabalho dentro.
   *
   * Sem ela o banco RECUSA com P0004 e diz o que seria perdido — em vez de
   * apagar em silêncio, que foi o que custou os 30 clientes do Eder Fagundes
   * em 10/09/2026. Ambiente vazio continua saindo no primeiro clique.
   */
  confirmarPerda = false,
): Promise<{
  erro?: string;
  loginApagado?: boolean;
  email?: string | null;
  /** Preenchido quando o login FICOU (tem registros em outro portal do grupo) e só o ambiente foi apagado (…217). */
  loginPreservadoMotivo?: string | null;
  /** O que o ambiente tinha — devolvido quando o banco recusa, para a tela dizer. */
  conteudo?: { clientes: number; progresso: number; notas: number; chamados: number };
  /** `true` = o banco recusou porque há conteúdo; a tela pede a confirmação. */
  precisaConfirmarPerda?: boolean;
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_excluir_acesso", {
      p_aluno_id: alunoId,
      p_confirmar_perda: confirmarPerda,
    });

  if (error) {
    // P0004 = o ambiente tem conteúdo e ninguém confirmou a perda. Não é
    // falha: é a pergunta que faltava ser feita.
    if (error.code === "P0004") {
      const n = (error.message.match(/\d+/g) ?? []).map(Number);
      return {
        erro: error.message,
        precisaConfirmarPerda: true,
        conteudo: {
          clientes: n[0] ?? 0,
          progresso: n[1] ?? 0,
          notas: n[2] ?? 0,
          chamados: n[3] ?? 0,
        },
      };
    }
    return { erro: traduzirErroBanco("admin/excluirAcessoAluno", error) };
  }

  const r = data as {
    login_apagado?: boolean;
    email?: string;
    login_preservado_motivo?: string | null;
  } | null;
  revalidatePath("/admin", "layout");
  return {
    loginApagado: Boolean(r?.login_apagado),
    email: r?.email ?? null,
    loginPreservadoMotivo: r?.login_preservado_motivo ?? null,
  };
}

/**
 * Adiciona um sócio ao ambiente: vincula um `thb_aluno` já existente
 * (`p_socio_aluno_id`) como segundo membro do ambiente do titular
 * (`p_ambiente_aluno_id`), com login e senha próprios.
 */
export async function adicionarSocioAluno(
  ambienteAlunoId: string,
  socioAlunoId: string,
  opts?: { email?: string; senha?: string; confirmarOutrosSistemas?: boolean },
): Promise<{
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  /** O e-mail já tem conta com papel em OUTRO sistema do grupo; nada foi alterado. Repita com `confirmarOutrosSistemas: true`. */
  precisaConfirmar?: boolean;
  programas?: string[];
  /**
   * O e-mail já tem login no grupo, mas SEM papel em portal nenhum — quem
   * recusou foi a RPC (`P0003`), não a guarda por `admin_programas_do_email`.
   * `programas` volta vazio de propósito: não há portal a nomear. A tela usa
   * este booleano para trocar a frase do `DialogoConfirmacao`.
   */
  loginExistente?: boolean;
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
  }
  const email = opts?.email?.trim().toLowerCase();
  if (!email || !emailValido(email)) {
    return { erro: "Informe um e-mail válido para o sócio." };
  }

  const supabase = await createClient();

  // Guarda cross-sistema (war-room 10/09, achado E1): quando o e-mail JÁ tem
  // conta em `auth.users`, `admin_adicionar_socio` TROCA a senha dela e derruba
  // as sessões — e `auth.users` é de 7 portais. Mesmo contrato de
  // `definirSenhaAluno`/`definirSenhaMembro`: devolve `precisaConfirmar` +
  // programas SEM tocar em nada; a UI repete com `confirmarOutrosSistemas`.
  if (opts?.confirmarOutrosSistemas !== true) {
    const { data: prog, error: erroProg } = await supabase
      .schema("gps")
      .rpc("admin_programas_do_email", { p_email: email });
    if (erroProg) {
      return { erro: traduzirErroBanco("admin/adicionarSocioAluno.programas", erroProg) };
    }
    const programas = (
      (prog as { programas?: { programa: string }[] } | null)?.programas ?? []
    )
      .map((x) => x.programa)
      .filter((nome) => nome !== "GPS");
    if (programas.length > 0) {
      return { precisaConfirmar: true, programas };
    }
  }

  const { data, error } = await supabase.schema("gps").rpc(
    "admin_adicionar_socio",
    {
      p_ambiente_aluno_id: ambienteAlunoId,
      p_socio_aluno_id: socioAlunoId,
      p_email: email,
      p_senha: senha,
      // A FRONTEIRA é a RPC (migração ...218), não a guarda acima: um login que
      // existe e não tem papel em portal NENHUM não aparece em
      // `admin_programas_do_email` e passava batido — com a senha trocada e as
      // sessões derrubadas em todos os portais do grupo.
      p_confirmar_login_existente: opts?.confirmarOutrosSistemas === true,
    },
  );

  if (error) {
    // P0003 = "esse e-mail já tem login" (migração ...218). Não é falha: é o
    // mesmo contrato da guarda acima — nada foi escrito e a tela confirma. Sem
    // portal a nomear, `programas` volta vazio.
    if (error.code === "P0003") {
      return { precisaConfirmar: true, programas: [], loginExistente: true };
    }
    return { erro: traduzirErroBanco("admin/adicionarSocioAluno", error) };
  }

  const { data: socio } = await supabase
    .from("thb_alunos")
    .select("nome")
    .eq("id", socioAlunoId)
    .maybeSingle();

  const envio = await enviarCredenciaisAcesso({
    para: email,
    nome: socio?.nome ?? null,
    senha,
    precisaConfirmar: false,
  });

  revalidatePath("/admin", "layout");
  return {
    email: (data as { email?: string })?.email ?? email,
    senha,
    emailEnviado: envio.ok,
  };
}

/**
 * Remove UM membro do ambiente (só sócio — a função recusa se `papel` for
 * titular). Apaga o login dele; o ambiente e os demais membros continuam.
 */
export async function excluirMembroAluno(
  membroId: string,
): Promise<{ erro?: string }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("admin_excluir_membro", { p_membro_id: membroId });

  if (error) {
    return { erro: traduzirErroBanco("admin/excluirMembroAluno", error, { membroId }) };
  }

  revalidatePath("/admin", "layout");
  return {};
}

/**
 * Troca o e-mail do LOGIN de um membro pela tela do admin (feature "trocar
 * e-mail do login", 11/09/2026) — resolve sem SQL manual o que só um dev
 * conseguia em 10-11/09/2026: Eder Fagundes (login `@adv.oabmg.org.br`, ele
 * usava o Gmail), Rubens Barros (typo `rubens.barros1967@gmai.coml` — o "l"
 * do gmail foi parar depois do ".com": ele ENTRAVA, mas nenhum e-mail do
 * sistema chegava nele) e Mauricio de Oliveira (login comercial, ele usava o
 * Gmail e acabou se auto-cadastrando de novo).
 *
 * 🔴 A troca GERA SENHA NOVA por padrão (pedido literal do Marcio, 11/09):
 * "isso irá gerar uma nova senha, que eles vão disponibilizar". Faz sentido
 * pelo caso real — se o e-mail estava errado, a pessoa nunca recebeu a
 * senha original mesmo. `opts.senha` deixado de fora (undefined) gera uma
 * com `gerarSenhaTemporaria()`, o MESMO gerador de `definirSenhaMembro`;
 * passar `opts.senha = null` explicitamente preserva a senha atual (o caso
 * do Rubens: ele já entrava bem, só não recebia e-mail — trocar a senha
 * dele à toa seria atrito sem motivo).
 *
 * MESMA GUARDA CROSS-SISTEMA das irmãs (`definirSenhaMembro`,
 * `adicionarSocioAluno`): antes de trocar o e-mail (e a senha) de uma conta
 * que é privilegiada em OUTRO portal do grupo, o admin confirma. Falha da
 * RPC de programas ⇒ falha FECHADA, nunca segue sem saber.
 */
export async function trocarEmailLogin(
  membroId: string,
  emailNovo: string,
  opts?: { alinharCadastro?: boolean; confirmarOutrosSistemas?: boolean; senha?: string | null },
): Promise<{
  erro?: string;
  emailAntigo?: string;
  emailNovo?: string;
  papel?: PapelMembro;
  precisaConfirmar?: boolean;
  programas?: string[];
  emailJaEmUso?: boolean;
  cadastroAlinhado?: boolean;
  senha?: string;
  emailEnviado?: boolean;
  nome?: string | null;
  telefone?: string | null;
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const emailNovoNormalizado = emailNovo?.trim().toLowerCase();
  if (!emailNovoNormalizado || !emailValido(emailNovoNormalizado)) {
    return { erro: "Informe um e-mail válido." };
  }

  // `opts.senha === null` é o pedido explícito de PRESERVAR a senha atual
  // (caso Rubens). `undefined` (opts.senha não informado) é o caminho normal
  // desde 11/09: gera uma senha temporária nova.
  const gerarNova = opts?.senha !== null;
  const senha = gerarNova ? (opts?.senha?.trim() || gerarSenhaTemporaria()) : null;
  if (senha !== null && senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
  }

  const supabase = await createClient();

  // Pentest de 09/09 (MÉDIO), mesma guarda de `definirSenhaMembro`:
  // `gps.admin_alvo_e_equipe` só enxerga `public.perfis`, mas `auth.users` é
  // compartilhado por 7 sistemas. O e-mail ATUAL é quem importa aqui — é a
  // conta que vai levar o e-mail (e a senha) novos.
  if (opts?.confirmarOutrosSistemas !== true) {
    const { data: membro } = await supabase
      .schema("gps")
      .from("membros")
      .select("aluno_id")
      .eq("id", membroId)
      .maybeSingle();
    if (membro?.aluno_id) {
      const { data: status } = await supabase
        .schema("gps")
        .rpc("admin_status_acesso", { p_aluno_id: membro.aluno_id });
      const emailAtualDoMembro = (
        (status as { membros?: { membro_id: string; email: string | null }[] } | null)?.membros ?? []
      ).find((m) => m.membro_id === membroId)?.email;
      if (emailAtualDoMembro) {
        const { data: prog, error: erroProg } = await supabase
          .schema("gps")
          .rpc("admin_programas_do_email", { p_email: emailAtualDoMembro });
        // Falha FECHADA: sem saber em quais portais a conta tem papel, não se
        // troca e-mail (nem senha) nenhuma.
        if (erroProg) {
          return { erro: traduzirErroBanco("admin/trocarEmailLogin.programas", erroProg) };
        }
        const programas = (
          (prog as { programas?: { programa: string }[] } | null)?.programas ?? []
        )
          .map((x) => x.programa)
          .filter((nome) => nome !== "GPS");
        if (programas.length > 0) {
          return { precisaConfirmar: true, programas };
        }
      }
    }
  }

  const { data, error } = await supabase.schema("gps").rpc("admin_trocar_email_login", {
    p_membro_id: membroId,
    p_email: emailNovoNormalizado,
    p_confirmar_outros_sistemas: opts?.confirmarOutrosSistemas === true,
    p_senha: senha,
  });

  if (error) {
    // P0003 = e-mail já em uso por outra conta. SEM caminho de confirmação
    // (ao contrário de `adicionarSocioAluno`): esta função nunca funde
    // identidade.
    if (error.code === "P0003") {
      return {
        erro: traduzirErroBanco("admin/trocarEmailLogin", error, { membroId }),
        emailJaEmUso: true,
      };
    }
    return { erro: traduzirErroBanco("admin/trocarEmailLogin", error, { membroId }) };
  }

  const resultado = (data ?? {}) as {
    email_antigo?: string;
    email_novo?: string;
    papel?: PapelMembro;
    pessoa_aluno_id?: string | null;
    senha_definida?: boolean;
  };

  let cadastroAlinhado: boolean | undefined;
  if (opts?.alinharCadastro !== false) {
    // 🔑 SEMPRE por `pessoa_aluno_id`, nunca `aluno_id`: para o sócio,
    // `gps.membros.aluno_id` é o AMBIENTE (o titular) — gravar por ele
    // alinharia o cadastro da pessoa errada.
    if (resultado.pessoa_aluno_id) {
      const { error: erroAlunos } = await supabase
        .from("thb_alunos")
        .update({ email: emailNovoNormalizado })
        .eq("id", resultado.pessoa_aluno_id);
      // Falha do alinhamento NÃO desfaz a troca do login — o login já é o
      // efeito que importa; o cadastro pode ser corrigido depois.
      cadastroAlinhado = !erroAlunos;
      if (erroAlunos) {
        logErro("admin/trocarEmailLogin.alinharCadastro", erroAlunos, { membroId });
      }
    } else {
      cadastroAlinhado = false;
    }
  }

  // Nome/telefone para o `CredenciaisView`, pelo E-MAIL NOVO (é o que já foi
  // gravado no cadastro, quando alinhado) ou, na falta, pelo antigo — mesmo
  // `ilike`/`emailParaIlike` de `definirSenhaMembro` (thb_alunos guarda o que
  // a pessoa digitou; o login vem sempre em minúsculas do GoTrue).
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("nome, telefone")
    .ilike("email", emailParaIlike(emailNovoNormalizado))
    .maybeSingle();

  let emailEnviado: boolean | undefined;
  if (senha !== null) {
    // Manda para o endereço NOVO — é o que funciona; o antigo é justamente
    // o quebrado. Falha de envio não desfaz nada.
    const envio = await enviarCredenciaisAcesso({
      para: emailNovoNormalizado,
      nome: aluno?.nome ?? null,
      senha,
      precisaConfirmar: false,
    });
    emailEnviado = envio.ok;
  }

  revalidatePath("/admin", "layout");
  return {
    emailAntigo: resultado.email_antigo,
    emailNovo: resultado.email_novo,
    papel: resultado.papel,
    cadastroAlinhado,
    senha: senha ?? undefined,
    emailEnviado,
    nome: aluno?.nome ?? null,
    telefone: aluno?.telefone ?? null,
  };
}

/** Envia ao aluno o e-mail de redefinição de senha (fluxo do Supabase). */
export async function enviarRedefinicaoSenha(alunoId: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("email")
    .eq("id", alunoId)
    .maybeSingle();
  if (!aluno?.email) return { erro: "Este aluno não tem e-mail cadastrado." };

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://programa.timeholdingbrasil.com.br"
  ).replace(/\/+$/, "");

  const sb = createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await sb.auth.resetPasswordForEmail(aluno.email, {
    redirectTo: `${appUrl}/auth/confirm?next=/auth/redefinir`,
  });
  if (error) {
    // Erro do GoTrue, não do Postgres: `traduzirErroBanco` não o conhece. A
    // frase para a tela continua a mesma; o que faltava era a linha no log.
    logErro("admin/enviarRedefinicaoSenha", error, { alunoId });
    return { erro: "Não foi possível enviar o e-mail." };
  }
  return { email: aluno.email };
}
