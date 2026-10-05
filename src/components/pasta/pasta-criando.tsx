"use client";

import {
  EstadoPasta,
  useAtualizarEnquantoCriando,
} from "@/components/pasta/estado-drive";
import type { EstadoPastaDrive } from "@/lib/drive-tipos";

/** O parceiro vê isto no lugar do campo de colar link enquanto a equipe cria a pasta. */
export function PastaCriando({ estado }: { estado: EstadoPastaDrive }) {
  const { parou, atualizarAgora } = useAtualizarEnquantoCriando(
    estado.situacao === "criando",
  );
  return (
    <section aria-label="Pasta do Drive" className="rounded-lg border p-4">
      <EstadoPasta
        estado={estado}
        parou={parou}
        onAtualizarAgora={atualizarAgora}
        textoCriando="Sua pasta está sendo preparada pela equipe. Esta tela se atualiza sozinha."
      />
    </section>
  );
}
