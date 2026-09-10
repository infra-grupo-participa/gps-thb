import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  contarChamadosDoBadge,
  getAnexosParaExpurgo,
  getChamadosConfig,
  getFilaChamados,
} from "@/lib/chamados-data";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChamadosFila,
  parseFiltroFila,
} from "@/components/admin/chamados-fila";
import { ChamadosConfig } from "@/components/admin/chamados-config";
import { ChamadosRetencao } from "@/components/admin/chamados-retencao";

export const metadata = { title: "Admin — Chamados" };

/**
 * Suporte do lado da equipe: a fila, o interruptor + lista de avisos e o
 * expurgo de anexos vencidos.
 *
 * 🔑 O badge da aba "Chamados" no header sai daqui, da fila que a página já
 * carregou — nenhuma consulta a mais. A CONTA é `contarChamadosDoBadge`
 * (`src/lib/chamados-data.ts`), a mesma que `/admin` usa sobre o Map de
 * `getAtendimentoPorAluno()`: uma definição só (não-fechados) para o mesmo
 * badge, cada tela alimentando-a com a fonte que já tem na mão.
 *
 * Três leituras em paralelo, todas com guarda de admin própria dentro de
 * `chamados-data.ts` (defesa em profundidade — a fronteira é a RLS).
 */
export default async function AdminChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { f } = await searchParams;
  const filtro = parseFiltroFila(f);

  const [fila, config, paraExpurgo] = await Promise.all([
    getFilaChamados(),
    getChamadosConfig(),
    getAnexosParaExpurgo(),
  ]);

  // A definição do badge mora em `contarChamadosDoBadge` e vale para as DUAS
  // telas do admin: NÃO-FECHADOS. Antes daqui saía só `status === "aberto"`,
  // enquanto `/admin` somava os não-fechados — o mesmo badge, dois números.
  const chamadosBadge = contarChamadosDoBadge({ fila });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems({ chamadosAbertos: chamadosBadge })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Chamados"
          descricao="Suporte do portal. O mais parado aparece primeiro — a fila existe para ninguém ficar sem resposta."
        />

        <Tabs defaultValue="fila" className="gap-6">
          <TabsList variant="line">
            <TabsTrigger value="fila">
              Fila
              {fila.length > 0 ? (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {fila.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
            <TabsTrigger value="retencao">
              Retenção
              {paraExpurgo.length > 0 ? (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {paraExpurgo.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fila">
            <ChamadosFila chamados={fila} filtro={filtro} />
          </TabsContent>

          <TabsContent value="config">
            <ChamadosConfig
              aberto={config.aberto}
              emailEquipe={config.emailEquipe}
              fallbackEnv={config.fallbackEnv}
            />
          </TabsContent>

          <TabsContent value="retencao">
            <ChamadosRetencao itens={paraExpurgo} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
