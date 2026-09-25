import { FolderOpen, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * O que o ALUNO vê da pasta: o link e o estado vazio.
 *
 * 25/09/2026 — a pré-visualização embutida saiu (ver `src/lib/pasta.ts`). A aba
 * do aluno abre o Drive direto por `/pasta/abrir`; esta tela é o destino de
 * quem ainda não tem link e o que a equipe vê na assistência.
 *
 * PF4 (09/09/2026) — este arquivo era um único client component que também
 * trazia o formulário de admin, renderizado sob `isAdmin`. O ramo nunca
 * executava para o aluno, mas o CÓDIGO ia no bundle dele — e junto a
 * referência da Server Action `salvarPastaDriveUrl`, que é de admin. Um `if`
 * de runtime não corta módulo: quem corta é o importador.
 *
 * Hoje isto é **Server Component** (zero JavaScript no cliente) e o
 * formulário mora em `pasta-config-form.tsx`, importado SÓ pela página de
 * admin. `isAdmin` continua aqui, mas só para escolher a frase do estado
 * vazio — quem lê "cole o link acima" é quem tem o campo acima.
 */
export function PastaView({
  pastaUrl,
  isAdmin,
}: {
  pastaUrl: string | null;
  isAdmin: boolean;
}) {
  if (!pastaUrl) {
    // UX6 — o vazio era um `Card` à mão, com `py-10` somando ao padding que
    // o `Card` já paga e fora do `EmptyState` do design system.
    return (
      <EmptyState
        icone={<FolderOpen />}
        titulo={
          isAdmin
            ? "Nenhuma pasta configurada para este parceiro"
            : "Sua pasta está sendo preparada pela equipe"
        }
        descricao={
          isAdmin
            ? "Cole o link da pasta do Drive no campo acima para disponibilizá-la ao parceiro."
            : "Nela ficam os modelos de contrato e os documentos do seu processo. Assim que estiver pronta, a aba Pasta abre direto no Drive — não é preciso fazer nada."
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-5 text-primary" />
          <div>
            <CardTitle className="text-base">Pasta do parceiro</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seus documentos, vídeos e minutas — sempre à mão.
            </p>
          </div>
        </div>
        {/* ⚠️ CONTRASTE — era um botão escrito à mão com `bg-primary`
            (#FF6300) e texto branco: **2,98:1**, reprova o WCAG 1.4.3 na ação
            principal da tela. `buttonVariants()` usa `marca-acao` (#C74600,
            4,88:1 medido) e traz junto o foco por outline, que o botão à mão
            também não tinha. */}
        <a
          href={pastaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants()}
        >
          Abrir no Drive <ExternalLink aria-hidden />
        </a>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          A pasta abre no Google Drive, em outra aba. Lá dá para ver e baixar
          os documentos.
        </p>
      </CardContent>
    </Card>
  );
}
