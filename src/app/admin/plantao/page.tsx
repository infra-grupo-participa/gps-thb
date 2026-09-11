/**
 * Plantão de Dúvidas — Acelera Holding. Painel do ADMIN.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Server Component: abre o mês (por `?m=YYYY-MM` ou o mês corrente), busca
 * com `getSlotsDoMesAdmin()` e `getAlunosPlantao()`, renderiza o calendário
 * editável e a aba "Parceiros" (ex-"Acessos" — a rota pública deixou de ter
 * login, então a aba não gerencia mais senha/sessão, só o cadastro do
 * aluno e o bloqueio por migração de programa).
 */

import { redirect } from "next/navigation";
import Image from "next/image";
import { getContextoSessao } from "@/lib/auth";
import {
  getSlotsDoMesAdmin,
  getAlunosPlantao,
  getInscritosDoSlot,
  getMentoras,
  lerInscricoesAbertas,
} from "@/lib/plantao-data";
import { mesAtualSaoPaulo } from "@/lib/plantao";
import type { InscritoAdmin } from "@/lib/plantao-tipos";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { adminNavItems } from "@/lib/nav";
import { PlantaoAbas } from "@/components/admin/plantao-abas";
import { PlantaoCalendario } from "@/components/admin/plantao-calendario";
import { PlantaoAcessos } from "@/components/admin/plantao-acessos";
import { PlantaoMentoras } from "@/components/admin/plantao-mentoras";

export const metadata = { title: "Admin — Plantão" };

function parseMes(m: string | undefined): { ano: number; mes: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [ano, mes] = m.split("-").map(Number);
    if (mes >= 1 && mes <= 12) return { ano, mes };
  }
  return mesAtualSaoPaulo();
}

export default async function AdminPlantaoPage({
  searchParams,
}: {
  /** `m` = mês do calendário; `aba` é lida no cliente por `PlantaoAbas`. */
  searchParams: Promise<{ m?: string; aba?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { m } = await searchParams;
  const { ano, mes } = parseMes(m);

  const [slots, alunos, mentoras, inscricoesAbertas] = await Promise.all([
    getSlotsDoMesAdmin(ano, mes),
    getAlunosPlantao(),
    getMentoras(),
    lerInscricoesAbertas(),
  ]);

  // Inscritos só dos slots que TÊM inscrito (evita leitura à toa nos vazios).
  // Teto natural: slots de um mês (dezenas, não milhares); 1 tela, em
  // paralelo — não é N telas = N queries, é 1 tela com N pequeno e fixo.
  const slotsComInscrito = slots.filter((s) => s.inscritosQtd > 0);
  const listasDeInscritos = await Promise.all(
    slotsComInscrito.map((s) => getInscritosDoSlot(s.slotId)),
  );
  // `getInscritosDoSlot` devolve `{ inscritos, total }`: o total é o número
  // REAL no banco, e `inscritos` vem cortado no teto de 500. A tela precisa
  // dos dois para dizer "mostrando 500 de N" em vez de mentir por omissão.
  const inscritosPorSlot: Record<string, InscritoAdmin[]> = {};
  const totalInscritosPorSlot: Record<string, number> = {};
  slotsComInscrito.forEach((s, i) => {
    inscritosPorSlot[s.slotId] = listasDeInscritos[i].inscritos;
    totalInscritosPorSlot[s.slotId] = listasDeInscritos[i].total;
  });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Plantão de Dúvidas"
          eyebrow="Produto: Acelera Holding"
          descricao="Só participa quem comprou o Acelera Holding — agenda das mentoras, inscritos e acesso dos parceiros."
          acao={
            // A logo do Acelera (public/logo-acelera.svg) foi desenhada para
            // fundo escuro: sobre branco a palavra "ACELERA" some (degradê
            // branco→prata). Por isso ela vive dentro de um cartão na cor de
            // marca do Acelera (#180b00), mesmo padrão de src/app/p/layout.tsx.
            // `unoptimized`: o otimizador do Next recusa SVG por padrão.
            <div className="flex items-center justify-center rounded-lg bg-[#180b00] px-3 py-2">
              <Image
                src="/logo-acelera.svg"
                alt="Acelera Holding"
                width={1664}
                height={345}
                unoptimized
                className="h-auto w-full max-w-[160px]"
              />
            </div>
          }
        />

        {/* 🔴 A aba vive em `?aba=` (allowlist em `PlantaoAbas`): com
            `defaultValue`, navegar o mês (`?m=`) recarregava este Server
            Component e devolvia o admin para "Calendário". */}
        <PlantaoAbas
          calendario={
            <PlantaoCalendario
              ano={ano}
              mes={mes}
              slots={slots}
              mentoras={mentoras}
              inscritosPorSlot={inscritosPorSlot}
              totalInscritosPorSlot={totalInscritosPorSlot}
              inscricoesAbertas={inscricoesAbertas}
            />
          }
          alunos={<PlantaoAcessos alunos={alunos} />}
          mentoras={<PlantaoMentoras mentoras={mentoras} />}
        />
      </main>
    </>
  );
}
