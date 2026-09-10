"use client";

/**
 * Trocar o próprio nome — aluno e equipe.
 *
 * Pedido do Marcio em 10/09/2026: "permita que ele possa mudar seu nome por
 * favor, livremente, incluindo adm e alunos". Até então o nome era só exibido:
 * ninguém tinha caminho na interface para corrigi-lo, nem o próprio dono.
 *
 * 🔑 O alvo NUNCA vem do cliente. A RPC `gps.trocar_meu_nome` resolve quem é
 * pelo `auth.uid()` do servidor e grava em `public.perfis` (equipe) e/ou
 * `public.thb_alunos` (aluno) conforme o cadastro. Não existe parâmetro de
 * "de quem" — então esta tela não tem como trocar o nome de terceiro, mesmo
 * numa chamada forjada.
 *
 * ⚠️ `thb_alunos` é COMPARTILHADA com o sip: o nome trocado aqui aparece nos
 * outros sistemas do grupo. O card avisa isso em texto.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Secao } from "@/components/ui/secao";
import { trocarMeuNome } from "@/app/perfil/actions";

export function TrocarNome({ nomeAtual }: { nomeAtual: string | null }) {
  const [nome, setNome] = useState(nomeAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const limpo = nome.trim();
  const mudou = limpo !== (nomeAtual ?? "").trim();
  const curto = limpo.length < 2;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await trocarMeuNome(limpo);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      toast.success("Nome atualizado.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        <Secao titulo="Seu nome" />
        <div className="grid gap-1.5">
          <Label htmlFor="perfil-nome">Nome completo</Label>
          <Input
            id="perfil-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            aria-invalid={erro ? true : undefined}
            disabled={pendente}
          />
          <p className="corpo-sm text-muted-foreground">
            É como você aparece para a equipe e nos e-mails. Ele vale para
            todos os sistemas do Grupo Participa.
          </p>
        </div>

        {erro ? (
          <p role="alert" className="corpo-sm text-risco-foreground">
            {erro}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            onClick={salvar}
            disabled={!mudou || curto || pendente}
            aria-busy={pendente || undefined}
          >
            {pendente ? "Salvando…" : "Salvar nome"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
