import { ExternalLink, Info } from "lucide-react";

import { AvisoInline } from "@/components/ui/aviso-inline";

/**
 * Aviso perto do botão de anexar (minuta e croqui): o anexo é só para a
 * equipe revisar; o documento definitivo fica na pasta do Drive do cliente.
 * Texto num lugar só — os dois anexos usam este componente.
 *
 * `linkDrive` = URL de `gps.cliente_links_drive` (um por cliente). Sem link
 * (null/vazio): só o texto. Reusa `AvisoInline` (par `atencao`, medido) com
 * 16 px para o público mais velho.
 */
export function AvisoRevisaoDrive({
  linkDrive,
}: {
  linkDrive?: string | null;
}) {
  return (
    <div className="grid gap-1">
      <AvisoInline icone={Info} className="text-base!">
        Anexo só para a equipe revisar. O definitivo fica na pasta do Drive.
      </AvisoInline>
      {linkDrive ? (
        <a
          href={linkDrive}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-accent-foreground underline underline-offset-2"
        >
          <ExternalLink aria-hidden className="size-5 shrink-0" />
          Abrir pasta do cliente
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      ) : null}
    </div>
  );
}
