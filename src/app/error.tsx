"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";
import { whatsappSecretariaParaErro } from "@/app/erro-actions";
import { useEffect, useState } from "react";

/**
 * Boundary de erro da raiz. Pega qualquer falha de render abaixo do root
 * layout que não tenha boundary mais próximo — inclusive
 * `SessaoIndeterminadaError`, que `getContextoSessao()` lança quando a
 * consulta a `perfis`/`gps.membros` falha (16/09/2026).
 *
 * 🔴 NÃO tenta distinguir `SessaoIndeterminadaError` de qualquer outra falha
 * de render. **Medido em build de produção** (16/09/2026): o Next serializa o
 * erro na fronteira servidor→cliente e descarta TUDO exceto `digest` — nem
 * `name`, nem `message`, nem campo custom sobrevive. O payload RSC real de uma
 * rota que lançava `SessaoIndeterminadaError` chegou como
 * `{"digest":"1271518569"}`. É a mesma proteção que já vale para
 * `error.message` (comentário abaixo): o Next não deixa detalhe de servidor
 * atravessar. `error.name === "SessaoIndeterminadaError"` funcionaria em
 * `next dev` (o erro não é serializado) e falharia sempre em produção — bug
 * que passa no teste manual local e só aparece no ar. Não reintroduzir a
 * detecção sem uma forma provada de o `name`/`escopo` atravessar essa
 * fronteira (cogitado e descartado: `digest` customizado via
 * `onRequestError`/`generateDigest` — não investigado, ver CLAUDE.md se
 * alguém quiser tentar de novo).
 *
 * Por isso a copy é uma só, e vale para QUALQUER falha aqui: "não conseguimos
 * carregar agora" nunca afirma nada sobre a conta da pessoa, seja a causa
 * `SessaoIndeterminadaError` ou qualquer outro erro de render da raiz — e o
 * botão "Falar com a secretaria" aparece em todo erro desta tela, não só
 * nesse caso: quem está preso numa tela de erro quer um caminho para pedir
 * ajuda, e `whatsappSecretariaParaErro()` (`src/app/erro-actions.ts`) chama
 * `gps.whatsapp_secretaria()` DIRETO — sem `getContextoSessao()` nem
 * `BotaoSecretaria` — porque a RPC só lê `gps.config`, nunca as tabelas que
 * podem estar falhando. Falha fechado: sem sessão válida ou sem número
 * configurado, o link não renderiza e sobra só a frase (mesmo contrato do
 * `BotaoSecretaria`).
 *
 * O `error` era recebido e descartado: a tela não dizia nada e o log do
 * servidor não tinha como ser encontrado a partir da queixa. Agora o
 * `error.digest` aparece na tela. `error.message` continua fora — em produção
 * o Next já o substitui por texto genérico, mas em erro de cliente ele carrega
 * o texto cru da exceção, que não é para o aluno ler.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [zap, setZap] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    // `.catch` obrigatório: esta tela aparece justamente quando o servidor
    // está degradado, então a própria action pode rejeitar. Sem ele, a
    // rejeição fica sem tratamento DENTRO da tela de erro. Falhando, o botão
    // simplesmente não aparece e sobra a frase.
    whatsappSecretariaParaErro()
      .then((numero) => {
        if (!cancelado) setZap(numero);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <ErroPainel
      titulo="Não foi possível carregar"
      descricao="Isto não diz nada sobre a sua conta — só que a página não carregou agora. Tente de novo em alguns instantes; se continuar, fale com a equipe."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para o início
      </Link>
      {zap ? (
        <a
          href={zap}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <MessageCircle aria-hidden className="size-4" />
          Falar com a secretaria
        </a>
      ) : null}
    </ErroPainel>
  );
}
