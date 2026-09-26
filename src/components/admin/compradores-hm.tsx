"use client";

/**
 * "Compradores do HM aguardando acesso" — aba Solicitações do `/admin`
 * (26/09/2026, Imersão HT; migração `…317`).
 *
 * 🔑 O fluxo que o João desenhou, respeitando a regra do Marcio de 11/09 ("a
 * fila NUNCA cria login automático"):
 *   Hotmart aprova o HM cheio → o webhook cria card + cadastro na base →
 *   a pessoa aparece AQUI → a equipe autoriza → o sistema cria o login com o
 *   e-mail da compra e manda as credenciais pela Resend.
 *
 * Autorizar não é código novo: é o MESMO `criarAcessosEmLote` do painel
 * (`LoteDeAcesso`), que chama `criarAcessoAluno` por pessoa — senha temporária
 * individual, e-mail com botão de entrar, troca obrigatória no 1º acesso,
 * relatório por pessoa e linha de auditoria. Um caminho só para criar acesso.
 *
 * 🔴 Quem já tem login em outro portal do grupo (`temLogin`) NÃO tem a senha
 * trocada: volta como "precisa de decisão", como em todo lote. A tela avisa
 * ANTES de clicar.
 */

import { useState } from "react";
import { ShoppingBag } from "lucide-react";

import { LoteDeAcesso } from "@/components/admin/alunos-ativos-lista/lote-acesso";
import type { CompradorHmAguardando } from "@/lib/admin-acesso-tipos";
import { formatarDataHora } from "@/lib/datas";
import { brl } from "@/lib/moeda";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Secao } from "@/components/ui/secao";
import { AvisoInline } from "@/components/ui/aviso-inline";

const METODO: Record<string, string> = {
  CREDIT_CARD: "Cartão",
  PIX: "PIX",
  BILLET: "Boleto",
  HYBRID: "Cartão + PIX",
  HOTMART_INSTALLMENTS: "Parcelado Hotmart (valor da parcela)",
};

export function CompradoresHm({
  compradores,
  falhou,
}: {
  compradores: CompradorHmAguardando[];
  falhou: boolean;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  // Seção some quando está em dia — a aba continua sendo das solicitações.
  // Falha NUNCA vira "em dia": avisa.
  if (falhou) {
    return (
      <AvisoInline>
        Não foi possível conferir os compradores do HM aguardando acesso agora.
        Recarregue a página em instantes.
      </AvisoInline>
    );
  }
  if (compradores.length === 0) return null;

  const selecionados = compradores.filter((c) => marcados.has(c.alunoId));

  function alternar(id: string, marcar: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (marcar) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  return (
    <Secao
      icone={<ShoppingBag />}
      titulo={`Compradores do HM aguardando acesso (${compradores.length})`}
      descricao="Pagaram o Holding Masters cheio e já estão na base. Autorize para o sistema criar o login com o e-mail da compra e enviar as credenciais."
      classeConteudo="grid gap-3"
      className="mb-8"
    >
      <LoteDeAcesso
        selecionados={selecionados}
        candidatos={compradores}
        onLimpar={() => setMarcados(new Set())}
        onSelecionarAte={(n) =>
          setMarcados(new Set(compradores.slice(0, n).map((c) => c.alunoId)))
        }
        rotuloCandidatos="aguardando acesso"
        rotuloBotao="Autorizar e enviar acesso"
      />

      <ul className="grid gap-2">
        {compradores.map((c) => {
          const nome = c.aluno?.nome ?? c.aluno?.email ?? "Comprador sem nome";
          return (
            <li
              key={c.alunoId}
              className="flex items-start gap-3 rounded-xl border border-borda-fina bg-card px-4 py-3"
            >
              <Checkbox
                checked={marcados.has(c.alunoId)}
                onCheckedChange={(v) => alternar(c.alunoId, v === true)}
                aria-label={`Selecionar ${nome} para autorizar o acesso`}
                className="mt-1 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{nome}</span>
                  {c.temLogin ? (
                    <Badge variant="warning">Já tem login no grupo</Badge>
                  ) : null}
                </div>
                <p className="corpo-sm break-all text-muted-foreground">
                  {c.aluno?.email ?? "sem e-mail"}
                </p>
                <p className="corpo-sm text-muted-foreground">
                  Pagou{c.valor !== null ? ` ${brl(c.valor)}` : ""}
                  {c.metodoPagamento
                    ? ` · ${METODO[c.metodoPagamento] ?? c.metodoPagamento}`
                    : ""}{" "}
                  · {formatarDataHora(c.compradoEm)}
                </p>
                {c.temLogin ? (
                  <p className="corpo-sm text-atencao-foreground">
                    O e-mail já é usado em outro portal do grupo. Autorizar não
                    troca a senha: a pessoa volta como &ldquo;precisa de
                    decisão&rdquo;. Resolver depois (em Gerenciar acesso ou no
                    botão do relatório) troca a senha dela em todos os portais
                    do grupo.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}
