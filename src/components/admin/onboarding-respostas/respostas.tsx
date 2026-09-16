"use client";

/**
 * O corpo "respostas por extenso" do questionário inicial — MOVIDO de
 * `src/components/admin/central/secao-onboarding.tsx` (fatia A-4, 16/09/2026)
 * para dentro do diálogo `OnboardingRespostas` (`./index.tsx`).
 *
 * `secao-onboarding.tsx` foi APAGADO na fatia A-6 (16/09/2026): a Central
 * deixou de mostrar o questionário (saiu de lá e virou este diálogo), e o
 * corpo movido para cá já cobria o mesmo conteúdo. Este arquivo é a única
 * fonte que resta.
 *
 * Comentários originais preservados abaixo, sem reescrita de comportamento.
 */

import { useState, useTransition } from "react";
import { Download, FileSignature, Paperclip } from "lucide-react";
import type { OnboardingDaPessoa } from "@/lib/types";
import { FASES_CLIENTE1_UI } from "@/lib/etapa1";
import { formatarData } from "@/lib/datas";
import { brl } from "@/lib/moeda";
import { tamanhoLegivel } from "@/lib/chamados-tipos";
import { urlDoAnexoDoQuestionario } from "@/app/admin/onboarding-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Depois disto, "em andamento" deixa de ser normal e vira fila da equipe. */
const DIAS_PARADO = 7;

export const ROTULO_ORIGEM: Record<string, string> = {
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

type EstadoDaPessoa = {
  estado: "informacao" | "atencao";
  valor: string;
  detalhe: string;
};

export function estadoDaPessoa(p: OnboardingDaPessoa): EstadoDaPessoa {
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
export function AnexoDoQuestionario({
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
export function Respostas({ p }: { p: OnboardingDaPessoa }) {
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
