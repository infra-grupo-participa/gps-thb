import { redirect } from "next/navigation";
import { getContextoSessao, ehEquipeDaEsteira } from "@/lib/auth";
import { getFilaDeLigacoes } from "@/lib/data/entrevistas";
import { MODOS_FILA, type ModoFila } from "@/lib/entrevista-tipos";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { FilaDeLigacoes } from "@/components/admin/fila";

export const metadata = { title: "Admin — Fila de ligações" };

/**
 * Fila de ligações da entrevista prévia (Fatia 3 da esteira, 15/09/2026;
 * três abas — Fatia C, 16/09/2026, migração `…266`).
 *
 * A equipe liga para os clientes que cada parceiro selecionou
 * (`selecionado_entrevista = true`) e registra resultado, DISC e decisores.
 * `gps.fila_de_ligacoes(p_modo)` tem 3 modos (`MODOS_FILA`): `fila` (quem
 * está para ligar, retorno vencido sobe ao topo, depois FIFO), `sem_contato`
 * (encerrados por 3 `nao_atendeu` seguidas) e `agendados` (retorno marcado
 * para o futuro).
 *
 * 🔑 **Estado da aba na URL** (`?modo=`), lido aqui no server — NUNCA
 * `useState`: trocar de aba é navegação. Com estado de cliente, as três abas
 * virariam três buscas no MOUNT (N+1 pela porta dos fundos); na URL, só o
 * modo pedido é buscado, e o componente client (`FilaDeLigacoes`) só decide
 * o `href` de cada aba.
 *
 * 🔑 **Contagem só da aba ativa, de propósito** (não as 3 de uma vez): a RPC
 * devolve `total_linhas` do modo pedido, e cada abertura desta página já é 1
 * chamada. Buscar os 3 totais viraria 3 chamadas por abertura — 3× o custo
 * medido (7,48 ms) para popular 2 números que o operador só usa como
 * indicação, não como decisão. Trade-off: as abas inativas não mostram
 * contagem até serem abertas. Se o Marcio quiser as 3 sempre visíveis, é
 * questão de decisão de produto, não de capacidade técnica — os 3 `explain`
 * já provaram que caberia.
 *
 * 🔴 LGPD: a RPC não devolve `entrevista_observacoes` nem decisores — eles só
 * existem na ficha/dossiê de UM cliente por vez, nunca nesta lista.
 *
 * 🔑 Guarda `ehEquipeDaEsteira()` (Fatia 5, 15/09/2026), NÃO `ctx.papel !==
 * "admin"`: a decisão do Marcio abriu esta página também ao OPERADOR puro
 * (`gps.operadores`, ativo) — a mesma pessoa que abre o dossiê. `gp_is_admin()`
 * continua valendo por baixo em toda outra rota `/admin/**`; SÓ esta página
 * troca de guarda.
 *
 * Um operador que não é admin nem aluno chega aqui com `ctx.papel ===
 * "sem_acesso"` (ele não tem vínculo em `gps.membros` nem em
 * `public.perfis` — `gps.operadores` referencia `auth.users` direto, ver a
 * migração `…264`). Por isso o rótulo do header e o destino do logo não usam
 * `ctx.papel === "admin"` como sinal de identidade — usam o resultado desta
 * própria guarda.
 */
function parseModo(bruto: string | undefined): ModoFila {
  return (MODOS_FILA as readonly string[]).includes(bruto ?? "")
    ? (bruto as ModoFila)
    : "fila";
}

const DESCRICAO_POR_MODO: Record<ModoFila, string> = {
  fila: "Os clientes selecionados pelos parceiros para a entrevista prévia, do mais antigo para o mais recente. Retorno vencido sobe ao topo. Ligue, registre o resultado e a linha sai da fila.",
  sem_contato:
    "Clientes que encerraram por 3 tentativas de “não atendeu” seguidas. Registrar um novo resultado tira a linha daqui.",
  agendados:
    "Clientes com retorno marcado para uma data futura. Somem desta lista quando a data chega e voltam para a fila.",
};

export default async function AdminFilaPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  const souEquipe = await ehEquipeDaEsteira();
  if (!souEquipe) redirect("/");

  const souAdmin = ctx.papel === "admin";

  const { modo: modoBruto } = await searchParams;
  const modo = parseModo(modoBruto);

  const { linhas, total, erro } = await getFilaDeLigacoes({ limite: 200, modo });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo={souAdmin ? "Admin" : "Equipe da esteira"}
        homeHref="/admin/fila"
        navItems={adminNavItems({ souAdmin })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Fila de ligações"
          descricao={DESCRICAO_POR_MODO[modo]}
        />

        {erro ? (
          <p role="alert" className="corpo-sm text-destructive">
            {erro}
          </p>
        ) : (
          <FilaDeLigacoes linhas={linhas} total={total} modo={modo} />
        )}
      </main>
    </>
  );
}
