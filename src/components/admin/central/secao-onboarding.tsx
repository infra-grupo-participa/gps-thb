"use client";

/**
 * O bloco "Questionário inicial" da Central (§D.3) — o que cada pessoa do
 * ambiente respondeu ao entrar, por extenso.
 *
 * 🔑 Ele é LEITURA. Nenhuma escrita nasce aqui, e isso é regra da Central, não
 * economia: confirmar e liberar o acompanhamento moram na FICHA DO CLIENTE, no
 * Modo Assistência, que é onde o admin já está olhando o cliente. Daqui sai um
 * link para lá — nenhuma segunda porta para escrita que já existe.
 *
 * 🔴 O que esta tela nunca escreve: valor em reais do saldo do programa (B-S1
 * está pendente com o João). O chip diz "Contrato de honorários enviado", e só.
 * O valor que aparece é o dos HONORÁRIOS DO ALUNO com o cliente dele — resposta
 * do questionário, não cobrança.
 *
 * 🔴 O contrato anexado é documento de TERCEIRO (o cliente do aluno): não vai
 * por e-mail, não vai para o Slack, não entra em retorno agregado, e o link sai
 * sempre com `download=` (ver `anexo-actions.ts`).
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ClipboardList,
  Download,
  FileSignature,
  Paperclip,
  Star,
} from "lucide-react";
import type { OnboardingDaPessoa } from "@/lib/types";
import { FASES_CLIENTE1_UI } from "@/lib/etapa1";
import { formatarData } from "@/lib/datas";
import { brl } from "@/lib/moeda";
import { tamanhoLegivel } from "@/lib/chamados-tipos";
import { urlDoAnexoDoQuestionario } from "@/app/admin/aluno/[alunoId]/resolver/anexo-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Secao } from "@/components/ui/secao";
import { LinhaVerificacao } from "./linha-verificacao";
import type { EstadoLinha } from "./catalogo";

/** Depois disto, "em andamento" deixa de ser normal e vira fila da equipe. */
const DIAS_PARADO = 7;

const ROTULO_ORIGEM: Record<string, string> = {
  captacao: "Quer que a equipe faça desde a captação — o cliente virá de lá.",
  ja_tenho: "Já tem o cliente e quer começar por ele.",
};

/** Dias corridos entre a data e agora. `null` quando não há data. */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function estadoDaPessoa(p: OnboardingDaPessoa): {
  estado: EstadoLinha;
  valor: string;
  detalhe: string;
} {
  if (p.status === "concluido") {
    return {
      estado: "informacao",
      valor: p.concluidoEm
        ? `concluído em ${formatarData(p.concluidoEm)}`
        : "concluído",
      detalhe:
        "As respostas abaixo são o retrato do dia em que esta pessoa entrou. O estado vivo é o cliente na aba Clientes.",
    };
  }

  if (p.status === "em_andamento") {
    const dias = diasDesde(p.iniciadoEm);
    const parado = dias !== null && dias > DIAS_PARADO;
    return {
      // `ok: false` do plano. Aqui é AVISO e não problema: quem parou no meio
      // do questionário continua usando o portal inteiro — ninguém está preso.
      estado: parado ? "atencao" : "informacao",
      valor:
        dias === null
          ? "em andamento"
          : `em andamento há ${dias} ${dias === 1 ? "dia" : "dias"}`,
      detalhe: parado
        ? `Parou no passo ${p.passoAtual ?? 0} e não voltou há mais de ${DIAS_PARADO} dias. Vale um contato: o questionário é o que diz à equipe de onde vem o cliente 1.`
        : `Está no passo ${p.passoAtual ?? 0}. O questionário reabre no passo em que parou, no próximo acesso.`,
    };
  }

  return {
    estado: "informacao",
    valor: "não iniciado",
    detalhe:
      "O questionário abre sozinho no próximo acesso desta pessoa. Ninguém está bloqueado por isso.",
  };
}

/** Um anexo — a URL é assinada NO CLIQUE, nunca no render (vive 60 s). */
function AnexoDoQuestionario({
  path,
  nome,
  tamanho,
  contrato,
}: {
  path: string;
  nome: string;
  tamanho: number;
  contrato: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, baixando] = useTransition();

  function baixar() {
    setErro(null);
    baixando(async () => {
      const r = await urlDoAnexoDoQuestionario(path, nome);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // Âncora programática: a URL só chega depois do `await`, e nesse ponto o
      // gesto do usuário já expirou — `window.open` cairia no bloqueador de
      // pop-up. A URL vem com `download=`, então o browser baixa em vez de
      // navegar (nada de conteúdo de terceiro renderizado no nosso domínio).
      const a = document.createElement("a");
      a.href = r.url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      document.body.append(a);
      a.click();
      a.remove();
    });
  }

  return (
    <li className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
        {contrato ? (
          <FileSignature aria-hidden className="size-3.5 shrink-0 text-accent-foreground" />
        ) : (
          <Paperclip aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{nome}</span>
        {tamanho ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {tamanhoLegivel(tamanho)}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={pendente}
          aria-busy={pendente || undefined}
          aria-label={`Baixar ${nome}`}
          onClick={baixar}
        >
          <Download aria-hidden /> {pendente ? "Abrindo…" : "Baixar"}
        </Button>
      </div>
      <p role="alert" className="text-xs text-destructive empty:hidden">
        {erro}
      </p>
    </li>
  );
}

/** As respostas por extenso de quem já respondeu (ou começou a responder). */
function Respostas({ p }: { p: OnboardingDaPessoa }) {
  const fase = FASES_CLIENTE1_UI.find((f) => f.id === p.faseCliente1);
  const contrato = p.anexos.find((a) => a.tipo === "contrato_honorarios");
  const documentos = p.anexos.filter((a) => a.tipo === "documento");

  const nada =
    !p.origemCliente1 &&
    !p.faseCliente1 &&
    p.valorHonorarios == null &&
    !p.descricaoCaso &&
    !p.ajudaPronta &&
    p.anexos.length === 0;

  if (nada) {
    return (
      <p className="corpo-sm text-muted-foreground">
        Nada respondido ainda — não é falha da tela, é o estado desta pessoa.
      </p>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border border-borda-fina bg-card p-3">
      {p.origemCliente1 ? (
        <div>
          <p className="rotulo text-muted-foreground">De onde vem o cliente 1</p>
          <p className="corpo">{ROTULO_ORIGEM[p.origemCliente1] ?? p.origemCliente1}</p>
        </div>
      ) : null}

      {fase ? (
        <div>
          <p className="rotulo text-muted-foreground">Fase da implementação</p>
          {/* Rótulo LITERAL do questionário: a Central mostra o que a pessoa
              leu na tela, não a tradução para a fase de cliente. */}
          <p className="corpo">{fase.rotulo}</p>
        </div>
      ) : null}

      {p.clienteNome ? (
        <div>
          <p className="rotulo text-muted-foreground">Cliente 1</p>
          <p className="corpo">
            {p.clienteNome}
            {p.clienteId ? null : " (ainda não criado na aba Clientes)"}
          </p>
        </div>
      ) : null}

      {p.valorHonorarios != null ? (
        <div>
          <p className="rotulo text-muted-foreground">Honorários pactuados</p>
          {/* Honorários DO ALUNO com o cliente dele — resposta do questionário.
              Nada a ver com o saldo do programa, que nenhuma tela escreve
              enquanto o João não der o texto (B-S1). */}
          <p className="corpo tabular-nums">{brl(p.valorHonorarios)}</p>
        </div>
      ) : null}

      {p.descricaoCaso ? (
        <div>
          <p className="rotulo text-muted-foreground">O caso, nas palavras dele</p>
          <p className="corpo whitespace-pre-wrap break-words">{p.descricaoCaso}</p>
        </div>
      ) : null}

      {p.ajudaPronta ? (
        <div>
          <p className="rotulo text-muted-foreground">
            No que a equipe pode ajudar de pronto
          </p>
          <p className="corpo whitespace-pre-wrap break-words">{p.ajudaPronta}</p>
        </div>
      ) : null}

      {contrato ? (
        <div className="grid gap-1.5">
          <Badge variant="success" icone={FileSignature}>
            Contrato de honorários enviado
          </Badge>
          <ul className="grid gap-1.5">
            <AnexoDoQuestionario
              key={contrato.id}
              path={contrato.path}
              nome={contrato.nome}
              tamanho={contrato.tamanho}
              contrato
            />
          </ul>
        </div>
      ) : null}

      {documentos.length > 0 ? (
        <div className="grid gap-1.5">
          <p className="rotulo text-muted-foreground">
            {documentos.length === 1
              ? "1 documento anexado"
              : `${documentos.length} documentos anexados`}
          </p>
          <ul className="grid gap-1.5">
            {documentos.map((a) => (
              <AnexoDoQuestionario
                key={a.id}
                path={a.path}
                nome={a.nome}
                tamanho={a.tamanho}
                contrato={false}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SecaoOnboarding({
  pessoas,
  alunoId,
  favorito,
}: {
  pessoas: OnboardingDaPessoa[];
  alunoId: string;
  /** O cliente que o aluno marcou com a estrela — e se a equipe já o assumiu. */
  favorito: { id: string; nome: string; confirmadoEm: string | null } | null;
}) {
  const base = `/admin/aluno/${alunoId}`;

  /** Contagem de cabeçalho: "3 pessoas · 1 respondeu" é o que se lê de longe. */
  const concluidos = pessoas.filter((p) => p.status === "concluido").length;

  return (
    <Secao
      icone={<ClipboardList />}
      titulo="Questionário inicial"
      descricao={
        pessoas.length === 0
          ? "Nenhuma pessoa identificada neste ambiente."
          : `${pessoas.length} ${pessoas.length === 1 ? "pessoa" : "pessoas"} · ${concluidos} ${concluidos === 1 ? "respondeu" : "responderam"}. O questionário é por PESSOA: titular e sócio respondem cada um o seu.`
      }
    >
      <ul className="border-t border-borda-fina">
        {pessoas.map((p) => {
          const { estado, valor, detalhe } = estadoDaPessoa(p);
          const nome = p.nome ?? "Cadastro não identificado";
          return (
            <LinhaVerificacao
              key={p.membroId}
              estado={estado}
              rotulo={`${nome} · ${p.papel === "titular" ? "titular" : "sócio"}`}
              valor={valor}
              detalhe={detalhe}
            >
              {p.status === "nao_iniciado" ? null : <Respostas p={p} />}
            </LinhaVerificacao>
          );
        })}

        {/* Informação, não juízo: um ambiente sem acompanhamento confirmado é o
            estado NORMAL (os 25 favoritos de hoje nasceram livres). A escrita
            fica na ficha; aqui só o link. */}
        <LinhaVerificacao
          estado="informacao"
          rotulo="Acompanhamento confirmado pela equipe"
          valor={
            favorito?.confirmadoEm
              ? `sim, desde ${formatarData(favorito.confirmadoEm)}`
              : favorito
                ? "não"
                : "não — o parceiro ainda não escolheu a estrela"
          }
          detalhe={
            favorito?.confirmadoEm
              ? `Enquanto estiver confirmado, o parceiro não troca a estrela, não apaga ${favorito.nome || "o cliente"} e não volta a fase para Prospecção. Liberar é na ficha.`
              : favorito
                ? `O parceiro escolheu ${favorito.nome || "um cliente"}. Confirmar o acompanhamento trava a escolha dele — a porta é a ficha do cliente.`
                : "Sem estrela não há o que confirmar. Os passos 4 a 8 da Etapa 01 seguem travados para este parceiro."
          }
          acao={
            favorito ? (
              <Link
                href={`${base}/clientes/${favorito.id}`}
                className="foco-visivel inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
              >
                <Star aria-hidden className="size-3.5" />
                Abrir a ficha de {favorito.nome || "o cliente"}
              </Link>
            ) : (
              <Link
                href={`${base}/clientes`}
                className="foco-visivel inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
              >
                Ver os clientes deste parceiro
              </Link>
            )
          }
        />
      </ul>
    </Secao>
  );
}
