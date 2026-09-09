"use client";

import { useState, useTransition } from "react";
import { Download, Eye, Paperclip, ShieldOff } from "lucide-react";
import { urlDeDownloadDoAnexo } from "@/app/chamados/anexo-actions";
import { tamanhoLegivel } from "@/lib/chamados-tipos";
import { formatarData } from "@/lib/datas";
import { Button } from "@/components/ui/button";

/**
 * O anexo de uma mensagem da thread.
 *
 * 🔑 A URL é assinada NO CLIQUE, nunca no render: ela vive 60 segundos, então
 * uma URL embutida no HTML já estaria morta na primeira vez que alguém
 * clicasse — e seria um portador (quem tem a URL entra) impresso em cada
 * mensagem, inclusive as que ninguém vai abrir.
 *
 * `anexo_expurgado_em` preenchido = a retenção de 180 dias apagou o arquivo.
 * O NOME fica (a conversa continua fazendo sentido), o link não existe. Sem
 * botão nenhum: oferecer um download que vai falhar é pior do que dizer que
 * o arquivo não está mais lá.
 */
export function AnexoLink({
  path,
  nome,
  mime,
  tamanho,
  expurgadoEm,
}: {
  path: string;
  nome: string | null;
  mime: string | null;
  tamanho: number | null;
  expurgadoEm: string | null;
}) {
  const rotulo = nome ?? "anexo";
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (expurgadoEm) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <ShieldOff aria-hidden className="size-3.5 shrink-0" />
        <span className="font-medium text-foreground">{rotulo}</span>
        <span>— arquivo removido por retenção em {formatarData(expurgadoEm)}</span>
      </p>
    );
  }

  const ehImagem = Boolean(mime?.startsWith("image/"));

  function comUrl(aoReceber: (url: string) => void) {
    setErro(null);
    startTransition(async () => {
      const r = await urlDeDownloadDoAnexo(path, rotulo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      aoReceber(r.url);
    });
  }

  function baixar() {
    comUrl((url) => {
      // Âncora programática (e não `window.open`) porque a URL só chega depois
      // de um `await`: nesse ponto o gesto do usuário já expirou e o bloqueador
      // de pop-up mataria a janela. A URL vem com `download=`, então o browser
      // baixa em vez de navegar.
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      document.body.append(a);
      a.click();
      a.remove();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
        <Paperclip aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {rotulo}
        </span>
        {tamanho ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {tamanhoLegivel(tamanho)}
          </span>
        ) : null}

        {ehImagem ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pendente}
            aria-expanded={previa ? true : false}
            aria-label={
              previa ? `Fechar prévia de ${rotulo}` : `Ver prévia de ${rotulo}`
            }
            onClick={() =>
              previa ? setPrevia(null) : comUrl((url) => setPrevia(url))
            }
          >
            <Eye aria-hidden /> {previa ? "Fechar prévia" : "Prévia"}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={pendente}
          aria-busy={pendente || undefined}
          aria-label={`Baixar anexo ${rotulo}`}
          onClick={baixar}
        >
          <Download aria-hidden /> {pendente ? "Abrindo…" : "Baixar"}
        </Button>
      </div>

      {previa ? (
        // `<img>` cru, não `next/image`: a origem é o domínio do Supabase com
        // URL assinada de 60 s — não há o que otimizar nem cachear, e o
        // otimizador exigiria liberar um host remoto no `next.config`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previa}
          alt={`Prévia do anexo ${rotulo}`}
          loading="lazy"
          className="max-h-64 w-fit rounded-lg bg-muted object-contain ring-1 ring-foreground/10"
          onError={() => {
            setPrevia(null);
            setErro(
              "Não foi possível mostrar a prévia. Use o botão Baixar para abrir o arquivo.",
            );
          }}
        />
      ) : null}

      <p role="alert" className="text-xs text-destructive empty:hidden">
        {erro}
      </p>
    </div>
  );
}
