"use server";

import { emailParaIlike, emailValido } from "@/lib/texto";
import { LOTE_ACESSOS_MAXIMO, LOTE_PAUSA_MS } from "@/lib/acessos-lote";

import { gerarSenhaTemporaria } from "@/lib/senha-temporaria";
import { SENHA_MINIMO } from "@/lib/senha-regras";
import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { enviarCredenciaisAcesso, enviarAcessoLiberado } from "@/lib/email";
import {
  documentoValido,
  soDigitos,
  telefoneE164,
  tipoDocumento,
} from "@/lib/masks";
import { PLANOS_ALUNO } from "@/lib/types";
import type { Aluno, NovoAlunoInput, PlanoAluno, Turma } from "@/lib/types";

// A senha temporária vem de `@/lib/senha-temporaria` (`Thb-7f3a-2b9c`). O
// gerador local produzia `Gps-3f9a2b` e ia por e-mail e WhatsApp ao aluno —
// "GPS" é nome interno e não aparece para o usuário desde 09/07/2026.

export interface AlunoBusca extends Aluno {
  documento: string | null;
  jaNoGps: boolean;
}

/** Normaliza para comparação: minúsculas e sem acentos. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Saneia UMA palavra antes de ela entrar no `.or()` do PostgREST.
 *
 * 🔒 O `.or()` recebe uma STRING de filtros separada por vírgula, com
 * parênteses agrupando e aspas citando valor: `nome.ilike.%joão%`. Interpolar
 * o que o admin digitou sem tirar esses metacaracteres é injeção de FILTRO —
 * um termo com vírgula (`a,documento.not.is.null`) acrescenta um ramo ao OR e
 * varre `thb_alunos` (a base inteira, compartilhada com o sip) por um critério
 * que a tela nunca ofereceu. Hoje só admin chega aqui, mas "só admin" não é
 * argumento para deixar o parâmetro aberto.
 *
 * ESCOLHA: saneamento na fronteira, não RPC nova. É a menor mudança segura —
 * uma RPC exigiria migração aplicada pelo João e reescreveria a busca inteira
 * (ranqueamento em SQL) por um defeito que uma allowlist de caracteres fecha.
 *
 * O que sai: `,` `(` `)` `"` `\` `*` (metacaractere do PostgREST), `%` e `_`
 * (curingas do `ilike` — `_` casa qualquer caractere e alargava a busca em
 * silêncio) e controle. O que fica: letra, acento, dígito, espaço, `.`, `@`,
 * `-`, `'` — o que existe em nome e e-mail de verdade. Teto de 40 caracteres:
 * termo maior que isso não é busca, é payload.
 */
function saneParaFiltro(v: string): string {
  return v
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[,()"\\*%_]/g, "")
    .trim()
    .slice(0, 40);
}

/**
 * Busca alunos (thb_alunos) de forma tolerante: quebra o termo em palavras e
 * casa cada uma em nome/e-mail/CPF/telefone (ordem não importa). Traz um
 * conjunto amplo do banco e ranqueia por quantas palavras casaram — assim
 * uma busca curta ("joao", parte do sobrenome ou do e-mail) já encontra.
 */
export async function buscarAlunos(termo: string): Promise<AlunoBusca[]> {
  // Server Action é endpoint HTTP: sem esta guarda, qualquer autenticado
  // enumeraria nome/e-mail/telefone/CPF de toda a base `thb_alunos`.
  if (!(await ehAdmin())) return [];

  const q = termo.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  // Palavras do texto + o bloco de dígitos (CPF/CNPJ/telefone).
  // ⚠️ `saneParaFiltro` roda ANTES de qualquer interpolação no `.or()`; o
  // ranqueamento abaixo usa as MESMAS palavras saneadas, para a ordem da lista
  // refletir o que o banco realmente casou.
  const palavras = q
    .split(/\s+/)
    .map(saneParaFiltro)
    .filter((t) => t.length >= 2);
  // `soDigitos` já devolve só `[0-9]`: nada a sanear.
  const digitos = soDigitos(q);

  // OR amplo: qualquer palavra em qualquer campo (redundante de propósito).
  const filtros: string[] = [];
  for (const p of palavras) {
    filtros.push(`nome.ilike.%${p}%`, `email.ilike.%${p}%`);
  }
  if (digitos.length >= 3) {
    filtros.push(`documento.ilike.%${digitos}%`, `telefone.ilike.%${digitos}%`);
  }
  // Termo que sobrou vazio depois do saneamento (só metacaractere, p. ex.
  // `,,,`) não vira consulta: devolver [] é mais honesto do que varrer a base.
  if (filtros.length === 0) return [];

  const { data } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio, documento",
    )
    .or(filtros.join(","))
    .limit(80);

  // Ranqueia por associação: nº de palavras que casam (nome vale mais), com
  // bônus para começo do nome e casamento de dígitos.
  const alvos = palavras.map(norm);
  const ranqueado = (data ?? [])
    .map((a) => {
      const nome = norm(a.nome);
      const email = norm(a.email);
      const doc = (a as { documento: string | null }).documento ?? "";
      const tel = (a as { telefone: string | null }).telefone ?? "";
      let score = 0;
      for (const t of alvos) {
        if (nome.includes(t)) score += nome.startsWith(t) ? 3 : 2;
        if (email.includes(t)) score += 1;
      }
      if (digitos.length >= 3) {
        if (soDigitos(doc).includes(digitos)) score += 3;
        if (soDigitos(tel).includes(digitos)) score += 2;
      }
      return { a, score };
    })
    .sort(
      (x, y) =>
        y.score - x.score || norm(x.a.nome).localeCompare(norm(y.a.nome)),
    )
    .slice(0, 20)
    .map((r) => r.a);

  const ids = ranqueado.map((a) => a.id);
  const { data: membros } = ids.length
    ? await supabase.schema("gps").from("membros").select("aluno_id").in("aluno_id", ids)
    : { data: [] as { aluno_id: string }[] };
  const idsNoGps = new Set((membros ?? []).map((m) => m.aluno_id));

  return ranqueado.map((a) => ({
    ...(a as Aluno),
    documento: (a as { documento: string | null }).documento,
    jaNoGps: idsNoGps.has(a.id),
  }));
}

/** Turmas para o cadastro manual (a atual primeiro). */
export async function listarTurmas(): Promise<Turma[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_turmas")
    .select("id, codigo, tipo, atual")
    .order("atual", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  return (data ?? []) as Turma[];
}

export interface AlunoDuplicado {
  id: string;
  nome: string | null;
  email: string | null;
  documento: string | null;
  motivo: "documento" | "email";
}

/**
 * Cadastra um aluno novo em `thb_alunos` — para quando a pessoa não está na
 * base (não veio da planilha nem da Hotmart). Só admin.
 *
 * `thb_alunos` é compartilhada com o sip, então o cadastro é conservador:
 * grava apenas os campos de identificação/contato e marca `fonte` para deixar
 * rastreável que a linha nasceu aqui. Os campos financeiros e de Hotmart ficam
 * nulos — eles pertencem ao centro de controle do sip.
 */
export async function cadastrarAluno(
  dados: NovoAlunoInput,
): Promise<{ erro?: string; duplicado?: AlunoDuplicado; aluno?: AlunoBusca }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const nome = dados.nome?.trim() ?? "";
  const email = dados.email?.trim().toLowerCase() ?? "";
  const documento = dados.documento?.trim() ?? "";

  if (nome.length < 3) return { erro: "Informe o nome completo do aluno." };
  // `emailValido` (`src/lib/texto.ts`) é a regra ÚNICA de e-mail do projeto —
  // a mesma que barra CR/LF e vírgula (vetor de injeção de cabeçalho) nas
  // listas de destinatário. A regex escrita à mão aqui aceitava
  // "a@b.c\nBcc: x@y.z" e era uma segunda verdade sobre a mesma pergunta.
  if (!emailValido(email)) return { erro: "E-mail inválido." };
  if (documento && !documentoValido(documento)) {
    return { erro: "CPF/CNPJ inválido — confira os dígitos." };
  }
  if (dados.plano && !PLANOS_ALUNO.includes(dados.plano as PlanoAluno)) {
    return { erro: "Plano inválido." };
  }

  const supabase = await createClient();

  // Duplicata por documento: mesma normalização do gatilho de vínculo
  // (lpad(dígitos,14,'0')), senão o login do aluno grudaria na linha errada.
  if (documento) {
    const { data: iguais } = await supabase
      .schema("gps")
      .rpc("aluno_por_documento", { p_doc: documento });
    const achado = ((iguais ?? []) as AlunoDuplicado[])[0] as
      | Omit<AlunoDuplicado, "motivo">
      | undefined;
    if (achado) {
      return {
        duplicado: {
          id: achado.id,
          nome: achado.nome,
          email: achado.email,
          documento: achado.documento,
          motivo: "documento",
        },
      };
    }
  }

  // Duplicata por e-mail (a tabela tem índice único em lower(trim(email))).
  const { data: mesmoEmail } = await supabase
    .from("thb_alunos")
    .select("id, nome, email, documento")
    .ilike("email", emailParaIlike(email))
    .limit(1)
    .maybeSingle();
  if (mesmoEmail) {
    return {
      duplicado: {
        id: mesmoEmail.id,
        nome: mesmoEmail.nome,
        email: mesmoEmail.email,
        documento: (mesmoEmail as { documento: string | null }).documento,
        motivo: "email",
      },
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limpo = (v?: string) => v?.trim() || null;
  const telefone = limpo(dados.telefone);

  const { data: criado, error } = await supabase
    .from("thb_alunos")
    .insert({
      nome,
      email,
      documento: documento ? soDigitos(documento) : null,
      tipo_documento: documento ? tipoDocumento(documento) : null,
      telefone,
      telefone_e164: telefone ? telefoneE164(telefone) : null,
      profissao: limpo(dados.profissao),
      turma_id: dados.turmaId ?? null,
      plano: dados.plano || "aluno",
      cep: limpo(dados.cep),
      cidade: limpo(dados.cidade),
      estado: limpo(dados.estado)?.toUpperCase().slice(0, 2) ?? null,
      bairro: limpo(dados.bairro),
      endereco_logradouro: limpo(dados.logradouro),
      endereco_numero: limpo(dados.numero),
      endereco_complemento: limpo(dados.complemento),
      instagram_url: limpo(dados.instagramUrl),
      site_profissional: limpo(dados.siteProfissional),
      link_facebook: limpo(dados.linkFacebook),
      fonte: "gps_cadastro_manual",
      atualizado_por: user?.id ?? null,
      atualizado_por_em: new Date().toISOString(),
    })
    .select("id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio, documento")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe um aluno com este e-mail na base." };
    }
    if (error.code === "42501") {
      return { erro: "Sem permissão para cadastrar alunos na base." };
    }
    return { erro: traduzirErroBanco("cadastrarAluno", error) };
  }

  revalidatePath("/admin");
  return {
    aluno: {
      ...(criado as Aluno),
      documento: (criado as { documento: string | null }).documento,
      jaNoGps: false,
    },
  };
}

/** Vincula um aluno ao GPS como TITULAR (cria o ambiente da Etapa 01). */
export async function adicionarAlunoGps(alunoId: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .insert({ aluno_id: alunoId, papel: "titular" });

  if (error) return { erro: traduzirErroBanco("adicionarAlunoGps", error) };
  revalidatePath("/admin");
  return {};
}

/** Aprova uma solicitação: vincula o usuário a um thb_aluno e cria o membro. */
export async function aprovarSolicitacao(
  solicitacaoId: string,
  userId: string,
  alunoId: string,
) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PL14 — o upsert abaixo tem `onConflict: "user_id"`: se este login JÁ for
  // membro de OUTRO ambiente, aprovar aqui o MOVERIA para cá, como titular, em
  // silêncio — apagando o vínculo (e o histórico) que ele tinha lá. São 13
  // sócios reais no sistema; o caso é improvável, não impossível. Ler antes e
  // recusar é mais barato que desfazer depois.
  const { data: vinculo, error: erroVinculo } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id, papel")
    .eq("user_id", userId)
    .maybeSingle();
  if (erroVinculo) {
    return {
      erro: traduzirErroBanco("aprovarSolicitacao.vinculo", erroVinculo),
    };
  }
  const jaVinculado = vinculo as { aluno_id: string; papel: string } | null;
  if (jaVinculado && jaVinculado.aluno_id !== alunoId) {
    // Sem dizer de QUEM é o outro ambiente: quem aprova não precisa do dado, e
    // a fila de solicitações não é lugar de expor vínculo de terceiro.
    return {
      erro:
        "Este login já participa de outro ambiente do programa" +
        (jaVinculado.papel === "socio" ? " (como sócio)" : "") +
        ". Remova o vínculo atual em “Gerenciar acesso” antes de aprovar esta solicitação.",
    };
  }
  if (jaVinculado && jaVinculado.papel !== "titular") {
    return {
      erro:
        "Este login já é sócio deste ambiente. Aprovar aqui o tornaria titular — " +
        "ajuste o papel em “Gerenciar acesso” se for essa a intenção.",
    };
  }

  const { error: erroMembro } = await supabase
    .schema("gps")
    .from("membros")
    .upsert(
      { aluno_id: alunoId, user_id: userId, papel: "titular" },
      { onConflict: "user_id" },
    );
  if (erroMembro) {
    return { erro: traduzirErroBanco("aprovarSolicitacao.membro", erroMembro) };
  }

  const { error } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .update({
      status: "aprovada",
      aluno_id: alunoId,
      decidido_em: new Date().toISOString(),
      decidido_por: user?.id ?? null,
    })
    .eq("id", solicitacaoId);
  if (error) return { erro: traduzirErroBanco("aprovarSolicitacao", error) };

  // Avisa o aluno que o acesso foi liberado (ele já tem senha própria).
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("nome, email")
    .eq("id", alunoId)
    .maybeSingle();
  if (aluno?.email) {
    await enviarAcessoLiberado({ para: aluno.email, nome: aluno.nome });
  }

  revalidatePath("/admin");
  return {};
}

/** Recusa uma solicitação de acesso. */
export async function recusarSolicitacao(
  solicitacaoId: string,
  observacao?: string,
) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .update({
      status: "recusada",
      // Teto no SERVIDOR (o maxLength do textarea é só do cliente) — pentest 09/09.
      observacao: observacao?.trim().slice(0, 500) || null,
      decidido_em: new Date().toISOString(),
      decidido_por: user?.id ?? null,
    })
    .eq("id", solicitacaoId);
  if (error) return { erro: traduzirErroBanco("recusarSolicitacao", error) };

  revalidatePath("/admin");
  return {};
}

/** Atualiza o e-mail do aluno no cadastro (thb_alunos). */
export async function atualizarEmailAluno(alunoId: string, email: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };
  const novo = email.trim().toLowerCase();
  // `emailValido` é a regex única do repo (texto.ts): barra `<>"'`, que a
  // frouxa aceitava (achado BAIXO do pentest da UI, 09/09).
  if (!emailValido(novo)) return { erro: "E-mail inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("thb_alunos")
    .update({ email: novo })
    .eq("id", alunoId);
  if (error) return { erro: traduzirErroBanco("atualizarEmailAluno", error) };
  revalidatePath("/admin");
  return { email: novo };
}

export interface ProgramaDoLogin {
  programa: string;
  detalhe: string | null;
}

export interface DiagnosticoLogin {
  temLogin: boolean;
  email: string | null;
  origem: string | null;
  ultimoAcesso: string | null;
  eEquipe: boolean;
  programas: ProgramaDoLogin[];
  temDireito: boolean;
  motivoDireito: string | null;
}

/**
 * Antes de criar o acesso: diz se já existe login com esse e-mail e em QUAIS
 * programas ele é usado — o `auth.users` é compartilhado entre GPS, Workbook
 * CNHF, Central, Rede, SIP e Holding Total. Reaproveitar o login troca a senha
 * que a pessoa usa nos outros programas, então o admin precisa ver isso antes.
 * Também informa se o aluno tem direito ao acesso (o direito vem do pagamento).
 */
export async function diagnosticarLoginAluno(
  alunoId: string,
  emailInformado?: string,
): Promise<{ erro?: string; diagnostico?: DiagnosticoLogin }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("email")
    .eq("id", alunoId)
    .maybeSingle();

  const email = (emailInformado?.trim() || aluno?.email || "").toLowerCase();
  if (!email) return { erro: "Este aluno não tem e-mail. Informe um e-mail." };

  const [{ data: progs }, { data: direito }] = await Promise.all([
    supabase.schema("gps").rpc("admin_programas_do_email", { p_email: email }),
    supabase.schema("gps").rpc("admin_direito_ao_acesso", { p_aluno_id: alunoId }),
  ]);

  const d = (progs ?? {}) as Record<string, unknown>;
  const dir = (direito ?? {}) as Record<string, unknown>;

  return {
    diagnostico: {
      temLogin: Boolean(d.tem_login),
      email: (d.email as string) ?? email,
      origem: (d.origem as string) ?? null,
      ultimoAcesso: (d.ultimo_acesso as string) ?? null,
      eEquipe: Boolean(d.e_equipe),
      programas: ((d.programas as Record<string, unknown>[]) ?? []).map((p) => ({
        programa: String(p.programa),
        detalhe: (p.detalhe as string) ?? null,
      })),
      temDireito: Boolean(dir.tem_direito),
      motivoDireito: (dir.motivo as string) ?? null,
    },
  };
}

/**
 * Cria o acesso (login) do aluno na hora, a partir do cadastro no thb_alunos.
 * Usa o cadastro público (signUp) por um cliente isolado — não afeta a sessão
 * do admin. O gatilho vincula ao aluno (por CPF/e-mail) e cria gps.membros.
 * Retorna as credenciais para o admin repassar.
 */
export async function criarAcessoAluno(
  alunoId: string,
  opts?: {
    email?: string;
    senha?: string;
    /**
     * Quando o e-mail já existe em `auth.users`, adotar o login preexistente?
     *
     * 🔴 Default `true` — é o comportamento de sempre, e os chamadores atuais
     * (o diálogo "Criar acesso", um aluno por vez, com o admin lendo o
     * resultado) não mudam.
     *
     * 🔴 `false` no LOTE, e isso NÃO é detalhe: `gps.admin_adotar_login_existente`
     * TROCA A SENHA DA PESSOA EM TODOS OS 7 PORTAIS DO GRUPO e derruba as
     * sessões dela. Fazer isso 19 vezes num clique é derrubar gente de sistemas
     * que não têm nada a ver com esta feature — a lição "ampliar escopo
     * compartilhado amplia todo consumidor". Com `false`, a pessoa volta em
     * "precisa de decisão", com os programas em que o login já é usado, e o
     * admin resolve uma a uma em Gerenciar acesso, que já confirma nomeando os
     * sistemas.
     */
    permitirAdocao?: boolean;
  },
) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { data: aluno } = await supabase
    .from("thb_alunos")
    .select("id, nome, email, documento, telefone")
    .eq("id", alunoId)
    .maybeSingle();
  if (!aluno) return { erro: "Aluno não encontrado." };

  // Atualiza o e-mail no cadastro, se informado e diferente.
  let email = (opts?.email?.trim() || aluno.email || "").toLowerCase();
  if (opts?.email && opts.email.trim().toLowerCase() !== (aluno.email ?? "")) {
    email = opts.email.trim().toLowerCase();
    const { error: eMail } = await supabase
      .from("thb_alunos")
      .update({ email })
      .eq("id", alunoId);
    if (eMail) {
      return { erro: traduzirErroBanco("criarAcessoAluno.email", eMail) };
    }
  }
  if (!email) return { erro: "Este aluno não tem e-mail. Informe um e-mail." };

  const senha = opts?.senha?.trim() || gerarSenhaTemporaria();

  // Cliente isolado (sem persistir sessão) para não trocar o login do admin.
  const sb = createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: signUpData, error } = await sb.auth.signUp({
    email,
    password: senha,
    options: {
      data: {
        documento: aluno.documento ?? undefined,
        nome: aluno.nome ?? undefined,
        telefone: aluno.telefone ?? undefined,
        origem: "gps",
      },
    },
  });

  if (error) {
    // Classificação por `code` do GoTrue — nunca pelo texto da mensagem, que
    // muda de versão para versão e é a regra da casa desde 09/09. O teste por
    // mensagem sobrou só como fallback para o servidor de auth que não manda
    // `code`.
    //
    // 🔴 `error.status === 422` SAIU da condição (war-room ciclo 3). O 422 do
    // GoTrue não significa "já existe": `weak_password`, `validation_failed` e
    // `signup_disabled` também voltam 422. Com o status na condição, uma senha
    // fraca caía no ramo de ADOÇÃO — o admin via a conta de outra pessoa ser
    // adotada (ou um erro de "aluno não encontrado" vindo da adoção) no lugar
    // de "senha fraca". Agora: 422 COM código decide pelo código (e cai nos
    // ramos de `weak_password`/rate limit abaixo); 422 SEM código nenhum vira
    // erro genérico traduzido, com `logErro` guardando status e mensagem.
    const codigo = error.code ?? null;
    if (
      codigo === "user_already_exists" ||
      codigo === "email_exists" ||
      (!codigo && /already/i.test(error.message ?? ""))
    ) {
      // A conta já existe (tipicamente lead do Workbook — o auth.users é
      // compartilhado). O gatilho do GPS só roda em INSERT, então esse login
      // nunca viraria membro sozinho: adota a conta em vez de recusar.
      // Mostra ao admin em quais programas esse login já é usado — o
      // auth.users é compartilhado (GPS, Workbook, Central, Rede, SIP, HT).
      const { data: diag } = await supabase
        .schema("gps")
        .rpc("admin_programas_do_email", { p_email: email });
      const programas =
        ((diag as { programas?: { programa: string }[] })?.programas ?? []).map(
          (p) => p.programa,
        );

      // 🔴 O LOTE PARA AQUI. Adotar troca a senha da pessoa em todos os portais
      // do grupo; isso exige uma decisão nomeada, uma a uma.
      if (opts?.permitirAdocao === false) {
        return {
          erro:
            "Este e-mail já tem login no grupo. Resolva em Gerenciar acesso, que confirma antes de trocar a senha nos outros portais.",
          precisaDecisao: true,
          programas,
        };
      }

      const { data: adotado, error: eAdocao } = await supabase
        .schema("gps")
        .rpc("admin_adotar_login_existente", {
          p_aluno_id: alunoId,
          p_senha: senha,
          p_forcar: false,
        });

      if (eAdocao) {
        // As mensagens de `gps.admin_adotar_login_existente` são texto NOSSO,
        // em português (ver `FRASES_DO_BANCO`); o resto vira frase genérica e o
        // detalhe fica no log.
        return {
          erro: traduzirErroBanco("criarAcessoAluno.adotar", eAdocao),
          programas,
        };
      }

      const envioAdocao = await enviarCredenciaisAcesso({
        para: email,
        nome: aluno.nome,
        senha,
        precisaConfirmar: false,
      });

      revalidatePath("/admin");
      return {
        email: (adotado as { email?: string })?.email ?? email,
        senha,
        precisaConfirmar: false,
        emailEnviado: envioAdocao.ok,
        loginAdotado: true,
        programas,
      };
    }
    // GoTrue, não Postgres: `traduzirErroBanco` não serve aqui. As duas causas
    // reais (senha fraca e limite de envio) precisam chegar ao admin com o que
    // fazer; o resto vira frase genérica, com o detalhe no log.
    logErro("criarAcessoAluno.signUp", error, {
      code: codigo,
      status: error.status ?? null,
    });
    if (codigo === "weak_password") {
      return { erro: `Senha fraca: use ao menos ${SENHA_MINIMO} caracteres.` };
    }
    if (
      error.status === 429 ||
      codigo === "over_request_rate_limit" ||
      codigo === "over_email_send_rate_limit"
    ) {
      return {
        erro:
          "Limite de envios atingido. Tente de novo em alguns minutos.",
      };
    }
    // Fallback por mensagem SÓ sem `code` (GoTrue antigo). Documentado de
    // propósito: é o único ponto do arquivo que ainda olha `error.message`.
    if (!codigo) {
      const msg = error.message ?? "";
      if (/password/i.test(msg)) {
        return { erro: `Senha fraca: use ao menos ${SENHA_MINIMO} caracteres.` };
      }
      if (/rate limit/i.test(msg)) {
        return {
          erro: "Limite de envios atingido. Tente de novo em alguns minutos.",
        };
      }
    }
    return { erro: "Não foi possível criar o acesso agora. Tente de novo." };
  }

  // Garante o vínculo com ESTE aluno, como TITULAR (o gatilho já tenta por
  // CPF/e-mail).
  const novoUserId = signUpData.user?.id;
  if (novoUserId) {
    await supabase
      .schema("gps")
      .from("membros")
      .upsert(
        { aluno_id: alunoId, user_id: novoUserId, papel: "titular" },
        { onConflict: "user_id" },
      );
  }

  // Envia as credenciais por e-mail (não bloqueia a criação se o envio falhar).
  const envio = await enviarCredenciaisAcesso({
    para: email,
    nome: aluno.nome,
    senha,
    precisaConfirmar: !signUpData.session,
  });

  revalidatePath("/admin");
  return {
    email,
    senha,
    precisaConfirmar: !signUpData.session,
    emailEnviado: envio.ok,
  };
}

/**
 * Define/atualiza o link da pasta do Google Drive do ambiente (gps.ambientes).
 * A pasta é do AMBIENTE, compartilhada entre titular e sócios — não vive mais
 * em `gps.membros` (que agora tem N linhas por ambiente).
 */
export async function salvarPastaDriveUrl(alunoId: string, url: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };
  const valor = url.trim();
  if (valor && !/^https?:\/\/(drive|docs)\.google\.com\//.test(valor)) {
    return { erro: "Informe um link válido do Google Drive." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("ambientes")
    .update({ pasta_drive_url: valor || null })
    .eq("aluno_id", alunoId);
  if (error) return { erro: traduzirErroBanco("salvarPastaDriveUrl", error) };
  revalidatePath("/admin", "layout");
  return {};
}

// `removerAlunoGps` foi APAGADA (war-room 10/09): 0 chamadores e cópia literal
// de `excluirAcessoAluno` (`src/app/admin/senha-actions.ts`) — as duas batiam
// na MESMA RPC `gps.admin_excluir_acesso`. Server Action exportada é endpoint
// HTTP: uma que apaga ambiente inteiro sem nenhuma tela por trás é superfície
// de ataque sem contrapartida. Quem exclui ambiente é "Gerenciar acesso".

// ─────────────────────────────────────────────────────────────────────────
// Criar acesso EM LOTE — C.2 da mega feature (10/09/2026)
// ─────────────────────────────────────────────────────────────────────────
/**
 * O pedido do João foi "garantir o acesso de todos os alunos (senha padrão para
 * os que não tiverem acesso)". A **senha padrão não passa** — `auth.users` é
 * compartilhado por 7 sistemas do grupo, e uma senha igual para 19 pessoas
 * significa que qualquer uma delas entra na conta das outras enquanto ninguém
 * trocar. O Plantão já viveu esse modelo (422 pessoas, a mesma senha, ninguém
 * trocou) e foi abandonado.
 *
 * **A intenção passa inteira**: cada pessoa recebe uma senha temporária
 * INDIVIDUAL (`gerarSenhaTemporaria()`, de `@/lib/senha-temporaria`), o e-mail de credenciais sai como
 * sempre e o portal pede uma senha própria no primeiro acesso (a marca
 * `gps_senha_temp_em`, migração ...208). Ninguém fica de fora.
 *
 * 🔴 TETO DE 20 POR CLIQUE E PAUSA DE 150 ms. A Resend limita **10 req/s**, e o
 * war-room de 09/09 perdeu 11 de 20 e-mails exatamente aqui — com o banco
 * reportando `succeeded, 20 rows`. A regra da casa: fila com teto exige
 * conferir `teto × intervalo` contra o tamanho real da fila ANTES de começar.
 * 20 × 150 ms ≈ 3 s de envio, ~6,7 req/s — abaixo do limite, com folga.
 *
 * 🔴 RELATÓRIO POR PESSOA, nunca um "19 acessos criados" agregado. Falha
 * silenciosa é a pior espécie: ninguém investiga o que diz ter funcionado.
 *
 * 🔴 `permitirAdocao: false`: quem já tem login em outro portal do grupo volta
 * em `precisaDecisao`, com a lista de programas, **sem nada ter sido alterado**.
 *
 * Reaproveita `criarAcessoAluno` sem reescrevê-la — em SÉRIE, de propósito:
 * `Promise.all` daria 20 requisições simultâneas à Resend e ao GoTrue, que é
 * precisamente o que a pausa existe para evitar.
 */
/*
 * ⚠️ `LOTE_ACESSOS_MAXIMO` e `LOTE_PAUSA_MS` moram em `src/lib/acessos-lote.ts`
 * e são IMPORTADOS aqui. Um arquivo `"use server"` só pode exportar função
 * async: com `export const LOTE_ACESSOS_MAXIMO = 20` nesta linha, o módulo
 * inteiro deixava de expor exports para o cliente e `/admin` respondia 500
 * ("Export criarAcessosEmLote doesn't exist in target module"). `tsc --noEmit`
 * passa limpo nesse estado — quem acusa é o bundler.
 */
export interface ResultadoAcessoEmLote {
  alunoId: string;
  ok: boolean;
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  /** Login já existe em outro portal: exige decisão nomeada, uma a uma. */
  precisaDecisao?: boolean;
  programas?: string[];
}

export async function criarAcessosEmLote(alunoIds: string[]): Promise<{
  erro?: string;
  resultados: ResultadoAcessoEmLote[];
}> {
  if (!(await ehAdmin())) return { erro: "Sem permissão.", resultados: [] };

  const ids = [...new Set(alunoIds ?? [])].filter(
    (id) => typeof id === "string" && id.length > 0,
  );
  if (ids.length === 0) return { erro: "Selecione ao menos um aluno.", resultados: [] };
  if (ids.length > LOTE_ACESSOS_MAXIMO) {
    return {
      erro: `Selecione no máximo ${LOTE_ACESSOS_MAXIMO} alunos por vez — o envio de e-mail tem limite por segundo.`,
      resultados: [],
    };
  }

  const resultados: ResultadoAcessoEmLote[] = [];

  for (let i = 0; i < ids.length; i += 1) {
    const alunoId = ids[i];
    // Pausa ENTRE envios (não antes do primeiro): ~6,7 req/s.
    if (i > 0) await new Promise((r) => setTimeout(r, LOTE_PAUSA_MS));

    try {
      const r = await criarAcessoAluno(alunoId, { permitirAdocao: false });
      const erro = (r as { erro?: string }).erro;
      if (erro) {
        resultados.push({
          alunoId,
          ok: false,
          erro,
          precisaDecisao: Boolean((r as { precisaDecisao?: boolean }).precisaDecisao),
          programas: (r as { programas?: string[] }).programas,
        });
      } else {
        resultados.push({
          alunoId,
          ok: true,
          email: (r as { email?: string }).email,
          senha: (r as { senha?: string }).senha,
          emailEnviado: Boolean((r as { emailEnviado?: boolean }).emailEnviado),
        });
      }
    } catch (e) {
      // Uma pessoa não pode derrubar o lote inteiro: quem falhou aparece
      // como falha, e as outras 19 seguem.
      logErro("criarAcessosEmLote", e, { alunoId });
      resultados.push({
        alunoId,
        ok: false,
        erro: "Não foi possível criar o acesso agora.",
      });
    }
  }

  // Auditoria: UMA linha por clique, com o resumo (a linha por pessoa é a que
  // cada criação já gera). Escrita por RPC porque `gps.acessos_log` não tem
  // policy de insert — um `.insert()` daqui voltaria SEM ERRO e sem linha.
  const criados = resultados.filter((r) => r.ok).length;
  const decisao = resultados.filter((r) => r.precisaDecisao).length;
  const supabase = await createClient();
  const { error: eLog } = await supabase
    .schema("gps")
    .rpc("admin_registrar_lote_de_acessos", {
      p_total: resultados.length,
      p_criados: criados,
      p_falhas: resultados.length - criados - decisao,
      p_precisa_decisao: decisao,
    });
  if (eLog) {
    // O lote FOI feito; só a linha de auditoria falhou. Registra e segue —
    // desfazer 20 acessos por causa de um log seria pior.
    logErro("criarAcessosEmLote.log", eLog, { total: resultados.length });
  }

  revalidatePath("/admin", "layout");
  return { resultados };
}
