import Link from "next/link";

import { PERFIS_DISC } from "@/lib/etapa1";

/**
 * O perfil DISC do cliente, como LINHAS da ficha da sessão (FATIA E).
 *
 * PRD: `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md` §3 fatia E.
 *
 * 🔴 DENSO E CHAPADO. Isto NÃO é um card: são mais linhas da mesma `<dl>` que
 * `MinhaSessao` já monta. Hierarquia por POSIÇÃO — sem sombra, sem ícone, sem
 * fonte grande. A regra vale para o sistema inteiro; a única exceção do grupo
 * é a tela `/conduzir` ao vivo do SIC-HF, que é outro produto.
 *
 * 🔴 DISC AUSENTE NÃO VIRA TEXTO INVENTADO. Sem a letra, a tela diz "ainda não
 * informado" e aponta a ficha — nunca "Perfil D" por padrão, nunca um traço
 * sozinho. **27 dos 34 favoritos caem nesse caminho hoje** (medido em 23/09):
 * é o estado MAIS COMUM, não a exceção, e por isso ele é escrito com cuidado
 * igual ao do caminho feliz.
 *
 * 🔴 CAMPO RICO VAZIO SOME. Consciência, gatilhos e relacionamento só viram
 * linha quando têm texto: três rótulos com valor em branco leem como defeito
 * do sistema, não como informação ausente. E no dia do deploy **34 de 34**
 * estarão assim.
 *
 * Server Component: só lê props e renderiza. Sem estado, sem action, sem
 * `"use client"` — o bloco não escreve nada.
 */

/**
 * Linha rótulo/valor da ficha da sessão.
 *
 * Mora aqui (e não em `minha-sessao.tsx`) porque os dois arquivos precisam da
 * MESMA linha e duplicar a marcação faria as duas metades da mesma `<dl>`
 * divergirem no primeiro ajuste de espaçamento.
 */
export function LinhaDaFicha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
      <dt className="w-24 shrink-0 rotulo text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 flex-1 corpo">{children}</dd>
    </div>
  );
}

/** Rótulo da letra ("D — Dominância"). Letra fora do catálogo volta crua. */
function rotuloDoPerfil(letra: string): string {
  return PERFIS_DISC.find((p) => p.id === letra)?.rotulo ?? letra;
}

/** Texto que só conta como preenchido se tiver conteúdo depois do `trim`. */
function preenchido(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export function DiscDoCliente({
  perfilDisc,
  consciencia,
  gatilhos,
  relacionamento,
  clienteId,
  basePath = "",
}: {
  /** `gps.etapa1_clientes.perfil_disc` — a letra. `null` = não informado. */
  perfilDisc: string | null;
  consciencia: string | null;
  gatilhos: string | null;
  relacionamento: string | null;
  /**
   * Para onde mandar quem precisa preencher. `null` = não deu para saber qual
   * cliente é (a leitura do nome já falhou) — aí não se oferece um link que
   * levaria à ficha errada.
   */
  clienteId: string | null;
  /** `""` no portal do aluno; `/admin/aluno/<id>` no modo assistência. */
  basePath?: string;
}) {
  const letra = preenchido(perfilDisc);
  const ricos: { rotulo: string; texto: string }[] = [];

  const c = preenchido(consciencia);
  if (c) ricos.push({ rotulo: "Consciência", texto: c });
  const g = preenchido(gatilhos);
  if (g) ricos.push({ rotulo: "Gatilhos", texto: g });
  const r = preenchido(relacionamento);
  if (r) ricos.push({ rotulo: "Relacionamento", texto: r });

  const href = clienteId ? `${basePath}/clientes/${clienteId}` : null;

  return (
    <>
      <LinhaDaFicha rotulo="Perfil DISC">
        {letra ? (
          rotuloDoPerfil(letra)
        ) : (
          <>
            <span className="text-muted-foreground">
              Perfil DISC ainda não informado.
            </span>{" "}
            {href ? (
              <Link
                href={href}
                className="text-accent-foreground underline-offset-4 hover:underline"
              >
                Preencher na ficha do cliente
              </Link>
            ) : null}
          </>
        )}
      </LinhaDaFicha>

      {/* Campo vazio SOME — nada de rótulo com valor em branco. Quando os três
          estão vazios, esta lista não rende nenhuma linha, e o bloco fica só
          com a letra (ou com o aviso de ausência) acima. */}
      {ricos.map((linha) => (
        <LinhaDaFicha key={linha.rotulo} rotulo={linha.rotulo}>
          {/* `whitespace-pre-line`: o campo é texto livre de até 2000
              caracteres, escrito com quebras de linha pela doutora e pelo
              parceiro. Sem isto, tudo colapsa num parágrafo só. */}
          <span className="whitespace-pre-line">{linha.texto}</span>
        </LinhaDaFicha>
      ))}
    </>
  );
}
