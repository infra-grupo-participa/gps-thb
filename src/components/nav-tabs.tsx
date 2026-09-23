"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  UsersRound,
  BookOpen,
  CalendarDays,
  FolderOpen,
  UserRound,
  NotebookPen,
  Wallet,
  LifeBuoy,
  Stethoscope,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useUrlDoPainel } from "@/components/admin/voltar-ao-painel";

export interface NavItem {
  href: string;
  label: string;
  /** chave do ícone (string, serializável entre server e client). */
  icon?:
    | "inicio"
    | "clientes"
    | "materiais"
    | "pasta"
    | "perfil"
    | "alunos"
    | "diario"
    | "financeiro"
    | "suporte"
    | "resolver"
    | "equipe"
    // 🔴 Exceção deliberada nº 2 à regra "não inventar chave nova de ícone"
    // (23/09/2026, pedido do Marcio: *"a aba da sessão tem que estar um pouco
    // mais visual e mais intuitiva"*). `BookOpen` (a chave "materiais") está
    // em uso em Materiais, Plantão e Vídeos — três abas com ícone de livro.
    // Com ele, "Sessões" não se distinguia de nenhuma delas de relance, que é
    // justamente como um ícone de aba é lido. `CalendarDays` diz o assunto
    // (marcar hora com a equipe jurídica) sem precisar do rótulo.
    //
    // ⚠️ A regra de não inventar chave continua valendo para o resto: ela
    // existe para o vocabulário de ícones não virar um por tela. O que a
    // suspende aqui é um pedido explícito, não conveniência.
    | "sessoes"
    // 🔴 Exceção deliberada à regra "não inventar chave nova de ícone"
    // (repetida 3× neste arquivo): esta é a aba FIXA à direita do header
    // (`app-header.tsx`), fora do trilho que rola — ela precisa de
    // distinção visual do resto das abas, e `BookOpen` (a chave "materiais")
    // já está em uso em Materiais, Plantão e Vídeos. Reaproveitar aqui faria
    // a aba fixa se camuflar entre as que rolam.
    | "tutoriais";
  /** casa exatamente (para o "Início"). */
  exact?: boolean;
  /** Item exclusivo do admin — some na pré-visualização. */
  adminOnly?: boolean;
  /**
   * A aba aparece, mas NÃO é link: vira um rótulo apagado com "em breve".
   *
   * 🔑 Existe para o que ainda não está pronto ficar VISÍVEL como promessa,
   * em vez de sumir. Esconder a aba faria o aluno não saber que aquilo vai
   * existir; deixá-la clicável o levaria a uma tela incompleta.
   */
  emBreve?: boolean;
  /**
   * Contador ao lado do rótulo (ex.: chamados esperando a equipe). `undefined`
   * = a página não sabe o número; 0 = sabe e é zero, e aí a pílula NÃO aparece
   * (badge com "0" é ruído: alerta é fila, não informação).
   *
   * 🔑 Quem passa é a página, e só quando já tem o número em mãos — nunca
   * vale uma consulta a mais só para pintar a aba.
   */
  badge?: number;
  /**
   * Só a aba "Parceiros" do painel do admin. O clique leva à **última URL do
   * painel** (aba, busca, ordem, filtros, lote) em vez de `/admin` pelado —
   * ver `components/admin/painel-url.ts`.
   *
   * `href` continua sendo `/admin`: é ele que decide qual aba está ATIVA
   * (`pathname` não conhece a consulta) e é ele que aparece antes da
   * montagem, quando o `sessionStorage` ainda não foi lido.
   */
  restauraPainel?: boolean;
}

const ICONES: Record<NonNullable<NavItem["icon"]>, LucideIcon> = {
  inicio: Home,
  clientes: Users,
  materiais: BookOpen,
  sessoes: CalendarDays,
  pasta: FolderOpen,
  perfil: UserRound,
  alunos: Users,
  diario: NotebookPen,
  financeiro: Wallet,
  suporte: LifeBuoy,
  resolver: Stethoscope,
  equipe: UsersRound,
  tutoriais: GraduationCap,
};

/**
 * Um item da navegação — link normal, "em breve" ou (via `restauraPainel`)
 * destino dinâmico. Extraído do corpo do `.map` para virar a MESMA função
 * usada pelo trilho que rola e pela aba FIXA (`app-header.tsx`): o item fixo
 * não é um `NavItem` diferente, é o item de sempre renderizado fora do
 * scroller. Refatoração pura — o markup de cada ramo não mudou.
 */
function NavTabLink({
  item,
  pathname,
  urlDoPainel,
}: {
  item: NavItem;
  pathname: string;
  urlDoPainel: string | undefined;
}) {
  const ativo = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon ? ICONES[item.icon] : null;
  // `ativo` sai do `href` declarado; o destino pode ser mais específico.
  const destino = item.restauraPainel ? urlDoPainel : item.href;

  if (item.emBreve) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          "-mb-px inline-flex shrink-0 cursor-default items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground/70",
          item.adminOnly && "previa-oculta",
        )}
      >
        {Icon ? <Icon className="size-4" aria-hidden /> : null}
        {item.label}
        <Badge
          variant="neutral"
          icone={false}
          className="h-5 px-1.5 text-[10px] font-normal"
        >
          em breve
        </Badge>
      </span>
    );
  }

  return (
    <Link
      href={destino ?? item.href}
      aria-current={ativo ? "page" : undefined}
      // Sem prefetch: as abas ficam visíveis em toda tela e o Next
      // pré-buscava todas de uma vez. Como as rotas são dinâmicas, cada
      // pré-busca roda o proxy (getUser) e renderiza a página inteira —
      // a home sozinha dispara ~10 queries. Medido nos logs do Supabase.
      // Nada muda para o usuário: a rota carrega ao clicar.
      prefetch={false}
      className={cn(
        // RÉGUA de 2 px, não pílula. A pílula `bg-accent` passava no
        // contraste mas a aba ativa e a inativa tinham quase o mesmo
        // peso visual a 1366 px — não dava para dizer onde se está.
        // A régua é inequívoca e some da área do texto.
        "foco-visivel -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
        ativo
          ? "border-primary font-semibold text-foreground [&>svg]:text-accent-foreground"
          : "border-transparent font-medium text-muted-foreground hover:border-borda-forte hover:text-foreground",
        item.adminOnly && "previa-oculta",
      )}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {item.label}
      {item.badge && item.badge > 0 ? (
        <Badge variant="danger" icone={false} className="h-5 px-1.5 text-[10px]">
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

/**
 * `items` é o que ROLA; `fixo` é o que NÃO rola (a aba fixa à direita do
 * header, ver `app-header.tsx`). Propositalmente duas props, não um item a
 * mais no array: `fixo` é renderizado por um `NavTabs` DIFERENTE (com
 * `items={[]}`), fora do contêiner `overflow-x-auto` — é isso que resolve o
 * defeito de `ml-auto` não ter folga para empurrar nada dentro de um
 * scroller `w-max`. Se `fixo` fosse só "o último item do array", toda função
 * de `nav.ts` teria de saber "o último é especial", e um item novo entraria
 * depois dele por acidente.
 */
export function NavTabs({ items, fixo }: { items: NavItem[]; fixo?: NavItem }) {
  const pathname = usePathname();
  // Uma leitura por montagem, para o único item que pede (`restauraPainel`).
  // Fora do painel do admin ninguém usa o valor — o hook custa um `useEffect`
  // e um `useState`, e some do caminho de quem não marcou a chave.
  const urlDoPainel = useUrlDoPainel();

  if (fixo) {
    // O `NavTabs` do bloco fixo (`items={[]}`) só renderiza o item fixo — sem
    // isto, o link apareceria DUAS VEZES no DOM (uma no trilho que rola, uma
    // no bloco fixo), dobrando-o na ordem de tabulação. É exatamente o
    // defeito A11Y4 que a remoção do `hidden md:block`/`md:hidden` já corrigiu
    // uma vez (comentário em `app-header.tsx`) — não reintroduzir por outra via.
    return (
      <nav className="flex items-stretch gap-0.5">
        <NavTabLink item={fixo} pathname={pathname} urlDoPainel={urlDoPainel} />
      </nav>
    );
  }

  return (
    // `w-max` para o contêiner rolável do header medir a largura real das abas
    // em vez de espremê-las (o pior caso é 8 abas em 360 px).
    <nav className="flex w-max items-stretch gap-0.5">
      {items.map((item) => (
        <NavTabLink key={item.href} item={item} pathname={pathname} urlDoPainel={urlDoPainel} />
      ))}
    </nav>
  );
}
