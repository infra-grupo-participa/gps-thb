import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Esqueleto de `/admin/sessoes` com a altura real (nunca spinner) — mesma
 * regra do projeto desde o polimento de 09/09. Duas seções (Próximas /
 * Histórico), mesma forma da página real.
 */
export default function AdminSessoesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Sessões com a equipe"
          descricao="Entrevista Prévia e Reunião Preliminar marcadas pelos parceiros nos horários que a equipe publicou."
        />
        <div className="grid gap-8">
          <ListaSkeleton linhas={3} />
          <ListaSkeleton linhas={3} />
        </div>
      </main>
    </>
  );
}
