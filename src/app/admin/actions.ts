"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { enviarCredenciaisAcesso, enviarAcessoLiberado } from "@/lib/email";
import {
  documentoValido,
  soDigitos,
  telefoneE164,
  tipoDocumento,
} from "@/lib/masks";
import { PLANOS_ALUNO } from "@/lib/types";
import type { Aluno, NovoAlunoInput, PlanoAluno, Turma } from "@/lib/types";

async function ehAdmin(): Promise<boolean> {
  const ctx = await getContextoSessao();
  return ctx?.papel === "admin";
}

function gerarSenha(): string {
  // Senha temporária legível (ex.: Gps-3f9a2b).
  return "Gps-" + randomBytes(4).toString("hex");
}

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
 * Busca alunos (thb_alunos) de forma tolerante: quebra o termo em palavras e
 * casa cada uma em nome/e-mail/CPF/telefone (ordem não importa). Traz um
 * conjunto amplo do banco e ranqueia por quantas palavras casaram — assim
 * uma busca curta ("joao", parte do sobrenome ou do e-mail) já encontra.
 */
export async function buscarAlunos(termo: string): Promise<AlunoBusca[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  // Palavras do texto + o bloco de dígitos (CPF/CNPJ/telefone).
  const palavras = q.split(/\s+/).filter((t) => t.length >= 2);
  const digitos = q.replace(/\D/g, "");

  // OR amplo: qualquer palavra em qualquer campo (redundante de propósito).
  const filtros: string[] = [];
  for (const p of palavras) {
    filtros.push(`nome.ilike.%${p}%`, `email.ilike.%${p}%`);
  }
  if (digitos.length >= 3) {
    filtros.push(`documento.ilike.%${digitos}%`, `telefone.ilike.%${digitos}%`);
  }
  if (filtros.length === 0) filtros.push(`nome.ilike.%${q}%`);

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
        if (doc.replace(/\D/g, "").includes(digitos)) score += 3;
        if (tel.replace(/\D/g, "").includes(digitos)) score += 2;
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
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "E-mail inválido." };
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
    .ilike("email", email)
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
    return { erro: "Não foi possível cadastrar: " + error.message };
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

/** Vincula um aluno ao GPS (cria o ambiente da Etapa 01). */
export async function adicionarAlunoGps(alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .insert({ aluno_id: alunoId });

  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return {};
}

/** Aprova uma solicitação: vincula o usuário a um thb_aluno e cria o membro. */
export async function aprovarSolicitacao(
  solicitacaoId: string,
  userId: string,
  alunoId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: erroMembro } = await supabase
    .schema("gps")
    .from("membros")
    .upsert(
      { aluno_id: alunoId, user_id: userId },
      { onConflict: "aluno_id" },
    );
  if (erroMembro) return { erro: erroMembro.message };

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
  if (error) return { erro: error.message };

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
  revalidatePath("/admin/solicitacoes");
  return {};
}

/** Recusa uma solicitação de acesso. */
export async function recusarSolicitacao(
  solicitacaoId: string,
  observacao?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .update({
      status: "recusada",
      observacao: observacao?.trim() || null,
      decidido_em: new Date().toISOString(),
      decidido_por: user?.id ?? null,
    })
    .eq("id", solicitacaoId);
  if (error) return { erro: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/solicitacoes");
  return {};
}

/** Atualiza o e-mail do aluno no cadastro (thb_alunos). */
export async function atualizarEmailAluno(alunoId: string, email: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };
  const novo = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(novo)) return { erro: "E-mail inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("thb_alunos")
    .update({ email: novo })
    .eq("id", alunoId);
  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return { email: novo };
}

/**
 * Cria o acesso (login) do aluno na hora, a partir do cadastro no thb_alunos.
 * Usa o cadastro público (signUp) por um cliente isolado — não afeta a sessão
 * do admin. O gatilho vincula ao aluno (por CPF/e-mail) e cria gps.membros.
 * Retorna as credenciais para o admin repassar.
 */
export async function criarAcessoAluno(
  alunoId: string,
  opts?: { email?: string; senha?: string },
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
    if (eMail) return { erro: "Erro ao atualizar o e-mail: " + eMail.message };
  }
  if (!email) return { erro: "Este aluno não tem e-mail. Informe um e-mail." };

  const senha = opts?.senha?.trim() || gerarSenha();

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
    if (
      error.code === "user_already_exists" ||
      error.status === 422 ||
      /already/i.test(error.message)
    ) {
      return { erro: "Já existe um login com este e-mail." };
    }
    return { erro: "Não foi possível criar o acesso: " + error.message };
  }

  // Garante o vínculo com ESTE aluno (o gatilho já tenta por CPF/e-mail).
  const novoUserId = signUpData.user?.id;
  if (novoUserId) {
    await supabase
      .schema("gps")
      .from("membros")
      .upsert(
        { aluno_id: alunoId, user_id: novoUserId },
        { onConflict: "aluno_id" },
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
  revalidatePath("/admin/solicitacoes");
  return {
    email,
    senha,
    precisaConfirmar: !signUpData.session,
    emailEnviado: envio.ok,
  };
}

/** Define/atualiza o link da pasta do Google Drive do aluno (gps.membros). */
export async function salvarPastaDriveUrl(alunoId: string, url: string) {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };
  const valor = url.trim();
  if (valor && !/^https?:\/\/(drive|docs)\.google\.com\//.test(valor)) {
    return { erro: "Informe um link válido do Google Drive." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .update({ pasta_drive_url: valor || null })
    .eq("aluno_id", alunoId);
  if (error) return { erro: error.message };
  revalidatePath("/admin", "layout");
  return {};
}

/** Remove o vínculo do aluno com o GPS (apaga o ambiente da Etapa 01). */
export async function removerAlunoGps(alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .delete()
    .eq("aluno_id", alunoId);

  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return {};
}
