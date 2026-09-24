import Link from "next/link";

import { DiscFicha } from "@/components/clientes/disc-ficha";

/**
 * O perfil DISC do cliente na tela da sessão — **a MESMA folha da ficha**.
 *
 * PRD: `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md` §3 fatia E.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 UMA VERDADE SÓ, NAS DUAS TELAS (24/09/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Até 24/09 este arquivo desenhava o DISC como LINHAS da `<dl>` de
 * `MinhaSessao`, e a ficha do cliente desenhava de outro jeito. Duas
 * marcações para o mesmo dado divergem no primeiro ajuste de espaçamento — e
 * divergiram. O pedido do Marcio ("cara de ficha… um C grandão… como se fosse
 * um papel") vale para o DISC onde quer que ele apareça, então este arquivo
 * passou a **delegar** para `DiscFicha` em vez de ter desenho próprio.
 *
 * ⚠️ MUDANÇA ESTRUTURAL QUE O CHAMADOR PRECISA SABER: isto **não é mais
 * `<LinhaDaFicha>` solta**. `DiscFicha` é uma `<section>`, e `<section>` não é
 * filho válido de `<dl>`. Por isso a folha saiu de `MinhaSessao` e passou a
 * morar na Zona 1 de `/sessoes` (`PreRequisitos`), uma vez só — é do CLIENTE,
 * não da sessão. Quem reintroduzir a chamada no meio de uma `<dl>` vai gerar
 * HTML inválido que nenhum `tsc` acusa.
 *
 * 🔴 DISC AUSENTE NÃO VIRA TEXTO INVENTADO. Sem a letra, a folha diz que não
 * foi apurado e aponta a ficha — nunca "Perfil D" por padrão, nunca um traço
 * sozinho. **27 dos 34 favoritos caem nesse caminho hoje** (medido em 23/09):
 * é o estado MAIS COMUM, não a exceção.
 *
 * ⚠️ A DATA NÃO É PASSADA AQUI, E É DE PROPÓSITO. O `select` de
 * `getDiscDosClientes` (`src/app/sessoes/page.tsx`) pede 6 colunas e **não
 * pede `disc_atualizado_em`**. Sem o dado lido, a folha omite a linha
 * "Apurado em …" em vez de inventar uma data. Quem quiser a procedência nesta
 * tela precisa **primeiro** acrescentar a coluna àquele `select` — o egress do
 * Supabase é teto da organização e a regra da casa é pedir só o que a tela
 * mostra.
 *
 * Server Component: só lê props e renderiza. Sem estado, sem action, sem
 * `"use client"` — o bloco não escreve nada.
 */

/**
 * Linha rótulo/valor da ficha da sessão.
 *
 * 🔑 CONTINUA MORANDO AQUI mesmo depois de o DISC virar folha: quem a usa é
 * `minha-sessao.tsx` (Sessão/Quando/Cliente) e `desfecho-da-sessao.tsx`.
 * Mover o arquivo seria mexer em dois importadores para ganhar nada.
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
  const href = clienteId ? `${basePath}/clientes/${clienteId}` : null;

  return (
    <DiscFicha
      perfilDisc={perfilDisc}
      consciencia={consciencia}
      gatilhos={gatilhos}
      relacionamento={relacionamento}
      href={href}
      /* 🔑 A AÇÃO É UM LINK PARA A FICHA, não um editor: esta tela é a do
         parceiro olhando a sessão marcada, e o DISC se edita na ficha do
         cliente. Só aparece quando o perfil JÁ existe — sem letra, a própria
         folha já oferece "Preencher na ficha do cliente" no cabeçalho, e dois
         links para o mesmo lugar a 40 px de distância viram ruído. */
      acoes={
        href && (perfilDisc ?? "").trim() !== "" ? (
          <Link
            href={href}
            className="foco-visivel rounded-xs corpo-sm font-medium text-accent-foreground underline underline-offset-2 hover:no-underline"
          >
            Abrir a ficha
          </Link>
        ) : null
      }
    />
  );
}
