import { Map, Users, FolderOpen, BookOpen } from "lucide-react";
import { ThbLogo } from "@/components/thb-logo";
import { IconeChip } from "@/components/ui/kpi-card";
import { PadraoTrilha } from "@/components/ui/padrao-trilha";

const DESTAQUES = [
  { Icon: Map, texto: "Roteiro guiado das 6 etapas da holding" },
  { Icon: Users, texto: "Central para gerenciar seus clientes" },
  { Icon: FolderOpen, texto: "Documentos e pasta sempre à mão" },
  { Icon: BookOpen, texto: "Acervo de aulas e modelos" },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Painel de marca (desktop).
          Era gradiente laranja + dois blobs com `blur-2xl` — três dos clichês
          que aparecem igual em qualquer template e não dizem nada do produto.
          Agora é laranja SÓLIDO da marca com o padrão de trilha por cima: a
          decoração passou a ser o que o produto é (um roteiro com marcos). */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-marca-solida p-12 text-white lg:flex">
        <PadraoTrilha opacidade={0.18} />

        <div className="relative flex items-center gap-3">
          {/* Anel branco: o selo é laranja e sumiria no painel da mesma cor. */}
          <ThbLogo size="sm" className="size-11 ring-2 ring-white/80" />
          <div className="leading-tight">
            <div className="font-heading font-semibold">Time Holding Brasil</div>
            <div className="text-sm text-white/85">
              Implementação Assistida
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Texto de marca, não título do documento: o `h1` da página é o
              título do cartão de formulário (A11Y2). Era um `h2` sem `h1`
              acima dele no desktop — hierarquia quebrada. */}
          <p className="max-w-[22ch] titulo-xl text-balance">
            Sua 1ª holding, do primeiro contato à entrega.
          </p>
          <ul className="mt-10 grid gap-3.5">
            {DESTAQUES.map(({ Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 corpo">
                {/* Mesmo chip do resto do sistema (VIS2); aqui sobre o laranja
                    sólido, então a cor vem do override, não do token. */}
                <IconeChip className="bg-black/15 text-white">
                  <Icon />
                </IconeChip>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative corpo-sm text-white/85">
          Programa de Implementação Assistida
        </div>
      </div>

      {/* Formulário — é o conteúdo principal das 4 telas de entrada, e o alvo
          do skip link do layout raiz. */}
      <main
        id="conteudo"
        className="flex min-h-screen items-center justify-center p-4"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
