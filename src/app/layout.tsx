import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ToasterLazy } from "@/components/ui/toaster-lazy";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";

// Fonte padrão dos sistemas do Grupo Participa: Inter (corpo) + Space Grotesk (títulos).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Programa de Implementação Assistida | Time Holding Brasil",
    // As páginas informam só o próprio nome (ex.: "Clientes").
    template: "%s | Programa de Implementação Assistida",
  },
  description:
    "Portal de implementação assistida da 1ª holding — Time Holding Brasil.",
  icons: { icon: "/logo-thb.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-muted/30">
        {/* Skip link (WCAG 2.4.1): com 5–6 abas no header, o teclado atravessa
            a navegação inteira em toda página. Fica invisível até receber
            foco. O alvo `#conteudo` entra nos `<main>` junto com o PageHeader,
            na Onda 2; enquanto isso o link já existe e o navegador simplesmente
            não move o foco — nunca leva a lugar errado. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-3 focus:ring-ring/50"
        >
          Pular para o conteúdo
        </a>
        {children}
        {/* O questionário inicial. Mora AQUI, e não em cada página do aluno,
            porque "assim que ele ingressar" pode ser em /clientes por um link
            do e-mail — e nove cópias garantiriam esquecer a décima página. O
            componente devolve `null` (sem custo de rede) para quem não tem
            cookie de sessão, para admin e para quem já concluiu; a razão
            completa está no cabeçalho dele. */}
        <OnboardingGate />
        <ToasterLazy />
      </body>
    </html>
  );
}
