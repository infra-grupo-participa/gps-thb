import { Map, Users, FolderOpen, BookOpen } from "lucide-react";
import { ThbLogo } from "@/components/thb-logo";

const DESTAQUES = [
  { Icon: Map, texto: "Roteiro guiado das 6 etapas da holding" },
  { Icon: Users, texto: "Central para gerenciar seus clientes" },
  { Icon: FolderOpen, texto: "Documentos e pasta sempre à mão" },
  { Icon: BookOpen, texto: "Acervo de aulas e modelos" },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Painel de marca (desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-orange-700 p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-16 size-64 rounded-full bg-black/10 blur-2xl"
        />

        <div className="relative flex items-center gap-3">
          {/* Anel branco: o selo é laranja e sumiria no gradiente do painel. */}
          <ThbLogo size="sm" className="size-11 ring-2 ring-white/80" />
          <div className="leading-tight">
            <div className="font-semibold">Time Holding Brasil</div>
            <div className="text-sm text-primary-foreground/80">
              Implementação Assistida
            </div>
          </div>
        </div>

        <div className="relative">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight">
            Sua 1ª holding, do primeiro contato à entrega.
          </h2>
          <ul className="mt-8 grid gap-3">
            {DESTAQUES.map(({ Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-primary-foreground/70">
          Programa de Implementação Assistida
        </div>
      </div>

      {/* Formulário */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
