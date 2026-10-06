import { FolderOpen, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarData } from "@/lib/datas";

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
 * vazio — quem lê "cole o link acima" é quem tem o campo acima — e o destino
 * do botão.
 *
 * 30/09/2026 — o link passa a poder ser gravado pela equipe OU pelo parceiro
 * (titular ou sócio). A tela mostra a procedência; o campo do parceiro mora em
 * `pasta-parceiro-form.tsx`, importado só por `app/pasta/page.tsx`.
 */
export type OrigemPasta = "equipe" | "parceiro";

/**
 * "Link inserido por Ana Souza (parceiro) em 30/09/2026."
 *
 * Origem `equipe` sai sempre como "pela equipe": o backend grava o nome
 * literal "Equipe", e "por Equipe (equipe)" repetiria a mesma palavra. Links
 * antigos (nome e data nulos) caem em "pela equipe", sem data.
 */
function textoProcedencia(
  origem: OrigemPasta,
  nome: string | null | undefined,
  em: string | null | undefined,
): string {
  const quem =
    origem === "equipe"
      ? "pela equipe"
      : nome?.trim()
        ? `por ${nome.trim()} (parceiro)`
        : "pelo parceiro";
  return `Link inserido ${quem}${em ? ` em ${formatarData(em)}` : ""}.`;
}

export function PastaView({
  pastaUrl,
  isAdmin,
  origem,
  porNome,
  em,
}: {
  pastaUrl: string | null;
  isAdmin: boolean;
  /** Quem gravou o link. Opcional: a tela de admin ainda não passa. */
  origem?: OrigemPasta | null;
  /** Nome de quem gravou (`pasta_drive_por_nome`). */
  porNome?: string | null;
  /** Quando gravou (`pasta_drive_em`, timestamptz ISO). */
  em?: string | null;
}) {
  if (!pastaUrl) {
    // UX6 — o vazio era um `Card` à mão, com `py-10` somando ao padding que
    // o `Card` já paga e fora do `EmptyState` do design system.
    return (
      <EmptyState
        icone={<FolderOpen />}
        titulo={
          isAdmin
            ? "Nenhuma pasta vinculada a este parceiro"
            : "Sua pasta do Drive ainda não foi vinculada"
        }
        descricao={
          isAdmin
            ? "Cole o link da pasta do Drive no campo acima, ou aguarde o parceiro inserir pela tela dele."
            : "Cole o link da sua pasta no campo abaixo, ou aguarde a equipe inserir. Depois disso, a aba Pasta abre direto no Drive."
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
        {/* Aluno abre por `/pasta/abrir`, que reconfere `ehUrlDoDrive` antes
            do redirect — o link agora também é gravado pelo parceiro. Admin
            usa o link direto: `/pasta/abrir` manda admin para `/admin`. */}
        <a
          href={isAdmin ? pastaUrl : "/pasta/abrir"}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants()}
        >
          Abrir pasta no Drive <ExternalLink aria-hidden />
        </a>
      </CardHeader>
      <CardContent className="grid gap-1">
        {origem ? (
          <p className="text-sm text-muted-foreground">
            {textoProcedencia(origem, porNome, em)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
