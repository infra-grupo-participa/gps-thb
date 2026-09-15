import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getContextoSessao, ehEquipeDaEsteira } from "@/lib/auth";
import { getDossieDoCliente } from "@/lib/data/operadores";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Dossie } from "@/components/admin/dossie";

export const metadata = { title: "Admin — Dossiê do cliente" };

/**
 * Dossiê de UM cliente (Fatia 5, ÚLTIMA da esteira, 15/09/2026) — o que o
 * advogado lê antes da reunião preliminar / o operador lê antes de ligar.
 *
 * 🔴 Guarda `ehEquipeDaEsteira()`, NÃO `ctx.papel !== "admin"`: a decisão do
 * Marcio é UM PAPEL SÓ — quem está em `gps.operadores` (ativo) vê a fila E
 * o dossiê, mesma pessoa. Um operador puro chega aqui com `ctx.papel ===
 * "sem_acesso"` (sem vínculo em `gps.membros` nem `public.perfis` — mesma
 * observação de `admin/fila/page.tsx`).
 *
 * 🔴 NÃO fica sob `admin/aluno/[alunoId]/**`: aquela árvore é o modo
 * assistência (Diário, Resolver ao lado) — o operador ficaria a um clique de
 * telas que não pode acessar. Este dossiê é uma rota própria, isolada, por
 * `clienteId`.
 *
 * 🔴 Cada abertura grava trilha em `gps.acessos_log` (`dossie_acessado`) —
 * a própria RPC `gps.dossie_do_cliente` já faz isso, sempre, mesmo em
 * leitura (é a guarda de LGPD, não um opt-in desta tela).
 *
 * 🔑 LGPD: a tela mostra SÓ o que a RPC devolve. `registro_contato`, CPF,
 * financeiro e o Diário do parceiro ficam fora de propósito — não buscar em
 * outro lugar para "completar" a ficha.
 */
export default async function DossieDoClientePage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  const souEquipe = await ehEquipeDaEsteira();
  if (!souEquipe) redirect("/");

  const souAdmin = ctx.papel === "admin";

  const { dossie, erro } = await getDossieDoCliente(clienteId);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo={souAdmin ? "Admin" : "Equipe da esteira"}
        homeHref="/admin/fila"
        navItems={adminNavItems({ souAdmin })}
      />
      <main
        id="conteudo"
        aria-label={
          dossie ? `Dossiê de ${dossie.clienteNome || "cliente sem nome"}` : "Dossiê do cliente"
        }
        className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16"
      >
        {erro || !dossie ? (
          <>
            <PageHeader titulo="Dossiê do cliente" />
            <EmptyState
              icone={<AlertTriangle aria-hidden />}
              titulo="Não foi possível abrir o dossiê"
              descricao={erro ?? "Cliente não encontrado."}
            />
          </>
        ) : (
          <>
            <PageHeader
              titulo={dossie.clienteNome || "Cliente sem nome"}
              eyebrow="Dossiê para a reunião preliminar"
              descricao={
                dossie.parceiroNome
                  ? `Cliente de ${dossie.parceiroNome}.`
                  : "Parceiro não identificado."
              }
            />
            <Dossie dossie={dossie} />
          </>
        )}
      </main>
    </>
  );
}
