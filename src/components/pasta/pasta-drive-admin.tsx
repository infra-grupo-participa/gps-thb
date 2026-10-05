"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { provisionarPastaParceiro } from "@/app/drive/actions";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import type { EstadoDrive } from "@/lib/drive-tipos";
import {
  EstadoPasta,
  useAtualizarEnquantoCriando,
} from "@/components/pasta/estado-drive";

/**
 * Criação automática da pasta do parceiro (equipe). Importado SÓ pela página
 * de admin. Chave desligada (`ativo = false`) ou leitura falhada (`null`, não
 * dá para saber se a chave está ligada): não renderiza nada, a tela fica como
 * antes da feature. Nunca oferece criar sem estado lido.
 */
export function PastaDriveAdmin({
  alunoId,
  nome,
  estado,
  temLink,
}: {
  alunoId: string;
  nome: string;
  estado: EstadoDrive | null;
  temLink: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const criando =
    estado?.ativo === true && estado.parceiro.situacao === "criando";
  const { parou, atualizarAgora } = useAtualizarEnquantoCriando(criando);

  if (!estado || !estado.ativo) return null;

  const rotulo = temLink ? "Organizar pasta existente" : "Criar pasta no Drive";

  function pedir() {
    setErro(null);
    startTransition(async () => {
      const res = await provisionarPastaParceiro(alunoId);
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <Card size="sm" role="region" aria-label="Criar pasta no Drive">
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-11 px-4 text-base"
            disabled={criando || pending}
            onClick={() => {
              setErro(null);
              setConfirmando(true);
            }}
          >
            {rotulo}
          </Button>
          <p className="text-base text-muted-foreground">
            {temLink
              ? "Cria as subpastas que faltam e compartilha com o titular."
              : "Cria a pasta do parceiro e compartilha com o titular."}
          </p>
        </div>
        <EstadoPasta
          estado={estado.parceiro}
          textoCriando="Criando a pasta no Drive. Leva de 30 a 60 segundos; pode ficar nesta tela."
          mostrarLink={false}
          mostrarAvisos
          parou={parou}
          onAtualizarAgora={atualizarAgora}
        />
        {estado.parceiro.revogacaoPendente ? (
          <AvisoInline className="mt-3 text-base!">
            Há acesso ao Drive que precisa ser retirado (titular ou e-mail
            trocado) e o sistema ainda não conseguiu. Ele tenta de novo a cada
            hora; se continuar, confira a conexão com o Google.
          </AvisoInline>
        ) : null}
      </CardContent>

      <DialogoConfirmacao
        aberto={confirmando}
        titulo={rotulo}
        descricao={nome || undefined}
        consequencia={
          temLink
            ? "O sistema confere a pasta já vinculada, cria o que falta e compartilha com o titular. Nada é apagado."
            : "O sistema cria a pasta no Drive e compartilha com o titular. Leva de 30 a 60 segundos."
        }
        rotuloConfirmar={rotulo}
        rotuloConfirmando="Enviando…"
        destrutivo={false}
        confirmando={pending}
        erro={erro}
        onConfirmar={pedir}
        onCancelar={() => {
          if (!pending) setConfirmando(false);
        }}
      />
    </Card>
  );
}
