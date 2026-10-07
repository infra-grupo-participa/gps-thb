import Link from "next/link";
import { FRASES_DRIVE, TEXTO_AVISO } from "@/lib/drive-tipos";
import type { PendenciaDrive, PendenciasDrive } from "@/lib/data/drive";
import { formatarDataHora } from "@/lib/datas";
import { Secao } from "@/components/ui/secao";

/**
 * Card "Pastas do Drive" em /admin/configuracoes — andamento da criação
 * automática das pastas dos alunos (`gps.drive_pendencias`).
 *
 * Server Component, sem JS no cliente: a página lê UMA vez e passa por prop.
 * Público: equipe mais velha → texto em 16 px (`text-base`), frases curtas.
 * Visual chapado como o bloco de interruptores ao lado (`rounded-lg border`,
 * linhas com `divide-y`), sem card por item.
 *
 * `dados === null` = a leitura falhou: aviso no card, a página segue de pé.
 */

const AVISO_GENERICO = "A pasta foi criada, mas algo ficou faltando. Abra a pasta do aluno para ver.";
const ERRO_GENERICO = "Não deu para criar a pasta. Abra a pasta do aluno e tente de novo.";

/** Motivo em português: frase do erro, ou os avisos traduzidos, ou o genérico. */
function motivo(item: PendenciaDrive): string {
  if (item.erro) return FRASES_DRIVE[item.erro] ?? item.erro;
  if (item.aviso) {
    const textos = TEXTO_AVISO as Record<string, string>;
    const frases = [
      ...new Set(
        item.aviso
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => textos[c] ?? AVISO_GENERICO),
      ),
    ];
    if (frases.length) return frases.join(" ");
  }
  return ERRO_GENERICO;
}

const PLACAR: { chave: keyof PendenciasDrive["placar"]; rotulo: string }[] = [
  { chave: "feitas", rotulo: "Pastas criadas" },
  { chave: "naFila", rotulo: "Na fila" },
  { chave: "comErro", rotulo: "Com problema" },
  { chave: "faltando", rotulo: "Ainda sem pasta" },
];

export function PastasDriveAdmin({ dados }: { dados: PendenciasDrive | null }) {
  return (
    <Secao titulo="Pastas do Drive" className="mt-10">
      {dados === null ? (
        <p role="alert" className="rounded-lg border px-4 py-3 text-base text-destructive">
          Não deu para carregar as pastas agora. Recarregue a página daqui a pouco.
        </p>
      ) : (
        <div className="rounded-lg border">
          <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
            {PLACAR.map((p) => (
              <div key={p.chave} className="px-4 py-3">
                <dt className="text-base text-muted-foreground">{p.rotulo}</dt>
                <dd className="text-2xl font-semibold tabular-nums text-foreground">
                  {dados.placar[p.chave]}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-t">
            <p className="px-4 pt-3 text-base font-medium text-foreground">Alunos com problema</p>
            {dados.itens.length === 0 ? (
              <p className="px-4 pt-1 pb-3 text-base text-muted-foreground">Nenhum problema.</p>
            ) : (
              <ul className="mt-2 divide-y border-t">
                {dados.itens.map((item) => (
                  <li
                    key={item.alunoId}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-medium text-foreground">{item.nome}</p>
                      <p className="text-base text-muted-foreground">{motivo(item)}</p>
                      {item.atualizadoEm ? (
                        <p className="text-base text-muted-foreground">
                          Em {formatarDataHora(item.atualizadoEm)}
                        </p>
                      ) : null}
                    </div>
                    <Link
                      href={`/admin/aluno/${item.alunoId}/pasta`}
                      className="shrink-0 text-base font-medium text-primary underline underline-offset-4"
                    >
                      Abrir a pasta do aluno
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Secao>
  );
}
