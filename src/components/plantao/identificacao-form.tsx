"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Formulário de identificação (nome +
 * e-mail) da rota PÚBLICA `/p/plantao`.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Não há mais login: qualquer um abre o calendário sem se identificar. Este
 * formulário só existe para o aluno DIZER quem é antes de se inscrever — a
 * confirmação de que o e-mail comprou o Acelera acontece no servidor, dentro
 * de `inscrever()`, nunca aqui. Navega para `?e=<email>&n=<nome>` (preservando
 * `?m=` se já houver um mês escolhido) — sem cookie, sem token, sem senha.
 * O nome vai na URL (não em `sessionStorage`) para sobreviver a refresh e a
 * abrir em nova aba, e porque é a mesma pessoa que acabou de digitá-lo.
 *
 * Mensagem propositalmente NEUTRA: a rota é pública, então o formulário
 * nunca confirma nem nega se um e-mail comprou o Acelera antes da tentativa
 * de inscrição em si.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRoundIcon } from "lucide-react";
import { emailValido } from "@/lib/plantao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IdentificacaoForm({
  emailInicial,
}: {
  /**
   * Preenche o e-mail quando a página chega com `?e=` mas sem `?n=` (ex.:
   * link direto salvo antes de se identificar) — evita a pessoa redigitar
   * o e-mail que já está na URL.
   */
  emailInicial?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState(emailInicial ?? "");
  const [erro, setErro] = useState<string | null>(null);

  function continuar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (nome.trim().length < 2) {
      setErro("Informe seu nome.");
      return;
    }
    if (!emailValido(email)) {
      setErro("Informe um e-mail válido.");
      return;
    }

    const params = new URLSearchParams();
    const mes = searchParams.get("m");
    if (mes) params.set("m", mes);
    params.set("e", email.trim().toLowerCase());
    params.set("n", nome.trim());

    router.push(`/p/plantao?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRoundIcon className="size-4 text-muted-foreground" aria-hidden />
          Identifique-se para se inscrever
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Use o e-mail da sua compra do Acelera Holding.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={continuar} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plantao-nome">Nome</Label>
            <Input
              id="plantao-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              placeholder="Seu nome"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plantao-email">E-mail</Label>
            <Input
              id="plantao-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="voce@email.com"
            />
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <Button type="submit" className="self-start">
            Continuar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
