/**
 * Plantão de Dúvidas — Acelera Holding. Painel do ADMIN.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Server Component: abre o mês (por `?m=YYYY-MM` ou o mês corrente), busca
 * com `getSlotsDoMesAdmin()` e `getAlunosPlantao()`, renderiza o calendário
 * editável e a lista de acessos em abas.
 */

import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getSlotsDoMesAdmin,
  getAlunosPlantao,
  getInscritosDoSlot,
  getMentoras,
} from "@/lib/plantao-data";
import { mesAtualSaoPaulo } from "@/lib/plantao";
import type { InscritoAdmin } from "@/lib/plantao-tipos";
import { AppHeader } from "@/components/app-header";
import { adminNavItems } from "@/lib/nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlantaoCalendario } from "@/components/admin/plantao-calendario";
import { PlantaoAcessos } from "@/components/admin/plantao-acessos";

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
  searchParams: Promise<{ m?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { m } = await searchParams;
  const { ano, mes } = parseMes(m);

  const [slots, alunos, mentoras] = await Promise.all([
    getSlotsDoMesAdmin(ano, mes),
    getAlunosPlantao(),
    getMentoras(),
  ]);

  // Inscritos só dos slots que TÊM inscrito (evita leitura à toa nos vazios).
  // Teto natural: slots de um mês (dezenas, não milhares); 1 tela, em
  // paralelo — não é N telas = N queries, é 1 tela com N pequeno e fixo.
  const slotsComInscrito = slots.filter((s) => s.inscritosQtd > 0);
  const listasDeInscritos = await Promise.all(
    slotsComInscrito.map((s) => getInscritosDoSlot(s.slotId)),
  );
  const inscritosPorSlot: Record<string, InscritoAdmin[]> = {};
  slotsComInscrito.forEach((s, i) => {
    inscritosPorSlot[s.slotId] = listasDeInscritos[i];
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
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Plantão de Dúvidas</h1>
          <p className="text-muted-foreground">
            Acelera Holding — agenda das mentoras, inscritos e acesso dos
            alunos.
          </p>
        </div>

        <Tabs defaultValue="calendario">
          <TabsList>
            <TabsTrigger value="calendario">Calendário</TabsTrigger>
            <TabsTrigger value="acessos">Acessos</TabsTrigger>
          </TabsList>

          <TabsContent value="calendario" className="mt-4">
            <PlantaoCalendario
              ano={ano}
              mes={mes}
              slots={slots}
              mentoras={mentoras}
              inscritosPorSlot={inscritosPorSlot}
            />
          </TabsContent>

          <TabsContent value="acessos" className="mt-4">
            <PlantaoAcessos alunos={alunos} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
