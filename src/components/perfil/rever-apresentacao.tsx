"use client";

import { useState } from "react";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OnboardingPortal } from "@/components/onboarding";
import type { OnboardingActions } from "@/components/onboarding/tipos";
import type { MeuOnboarding } from "@/lib/types";

/**
 * As ações do portal em modo **só apresentação**.
 *
 * 🔑 No `soTour` o componente não salva passo, não anexa, não conclui e não
 * troca senha — a sequência é `[tour, fim]` e nenhum botão dela chama o
 * servidor. Passar um objeto inerte é mais honesto do que tornar `actions`
 * opcional: se um dia alguém acrescentar uma chamada dentro do tour, o
 * `console.error` daqui denuncia na hora, em vez de a tela falhar em silêncio.
 */
const ACOES_INERTES: OnboardingActions = {
  async salvarPasso() {
    return {};
  },
  async criarUploadAssinado() {
    return { ok: false as const, erro: "Indisponível nesta tela." };
  },
  async registrarAnexo() {
    return { erro: "Indisponível nesta tela." };
  },
  async removerAnexo() {
    return { erro: "Indisponível nesta tela." };
  },
  async concluir() {
    return { erro: "Indisponível nesta tela." };
  },
  async trocarSenha() {
    return { erro: "Indisponível nesta tela." };
  },
};

/**
 * "Rever a apresentação" — o botão que devolve o tour do onboarding.
 *
 * É a contrapartida de o tour ser **pulável** (B-T2): errar para o lado de
 * prender a pessoa custa caro (ela abandona a sessão), errar para o lado de
 * soltar custa um clique — desde que o clique exista, e ele mora aqui.
 *
 * O portal só é montado depois do clique: enquanto ninguém pede, nem o diálogo
 * nem o `Dialog` do Base UI entram na página do perfil.
 */
export function ReverApresentacao({
  dados,
  abas,
}: {
  dados: MeuOnboarding;
  abas: { href: string; label: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  // `key` nova a cada abertura: remonta o tour no primeiro slide, em vez de
  // reabrir onde a pessoa parou da última vez.
  const [vez, setVez] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setVez((v) => v + 1);
          setAberto(true);
        }}
      >
        <Compass aria-hidden />
        Rever a apresentação
      </Button>
      {aberto ? (
        <OnboardingPortal
          key={vez}
          soTour
          dados={dados}
          abas={abas}
          actions={ACOES_INERTES}
          proximoPasso={null}
          aoFechar={() => setAberto(false)}
        />
      ) : null}
    </>
  );
}
