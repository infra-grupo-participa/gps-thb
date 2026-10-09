"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { definirAdminDoPrograma } from "@/app/admin/admins-actions";
import type { AdminDoPrograma, EventoAdmin } from "@/lib/admins-tipos";
import { formatarData } from "@/lib/datas";

import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Secao } from "@/components/ui/secao";
import { AdicionarAdmin } from "./adicionar";
import { CampoMotivo, motivoValido } from "./campo-motivo";
import { HistoricoAdmins } from "./historico";

/**
 * "Admins do programa" (08/10/2026) — quem vê e edita todos os alunos do
 * Programa. Lista densa (uma linha por pessoa, sem card por item), removidos
 * recolhidos, histórico fechado.
 *
 * 🔑 `meuEmail` vem do servidor por prop (identidade resolvida uma vez na
 * página) — nada de hook de sessão aqui. Serve só para não oferecer
 * "Remover" na própria linha; a recusa de verdade é da RPC.
 *
 * 🔴 `admins === null` é ERRO de leitura, não "nenhum admin": a tela mostra o
 * erro e esconde o formulário (adicionar às cegas, sem ver quem já é admin,
 * é o que gera duplicata de pedido e confusão).
 */
export function AdminsDoPrograma({
  admins,
  erroAdmins,
  historico,
  erroHistorico,
  meuEmail,
}: {
  admins: AdminDoPrograma[] | null;
  erroAdmins?: string;
  historico: EventoAdmin[] | null;
  erroHistorico?: string;
  meuEmail: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const [alvo, setAlvo] = useState<AdminDoPrograma | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const eu = (meuEmail ?? "").trim().toLowerCase();
  const ativos = (admins ?? []).filter((a) => a.ativo);
  const removidos = (admins ?? []).filter((a) => !a.ativo);

  function abrir(a: AdminDoPrograma) {
    setAlvo(a);
    setMotivo("");
    setErro(null);
  }

  function fechar() {
    if (pending) return;
    setAlvo(null);
  }

  function confirmar() {
    if (!alvo) return;
    if (!motivoValido(motivo)) {
      setErro("Escreva o motivo da remoção (mínimo de 3 caracteres).");
      return;
    }
    setErro(null);
    const pessoa = alvo;
    startTransition(async () => {
      const res = await definirAdminDoPrograma({
        email: pessoa.email,
        ativo: false,
        motivo,
      });
      if (!res.ok) {
        setErro(res.erro ?? "Não foi possível remover o admin.");
        return;
      }
      toast.success(`${pessoa.nome} deixou de ser admin do programa.`);
      setAlvo(null);
      router.refresh();
    });
  }

  return (
    <Secao
      titulo="Admins do programa"
      descricao="Admin vê e edita todos os parceiros. Vale só para este programa."
      classeConteudo="grid gap-4"
    >
      {erroAdmins || !admins ? (
        <p role="alert" className="corpo-sm text-destructive">
          {erroAdmins ?? "Não foi possível carregar a lista de admins."}
        </p>
      ) : (
        <>
          <AdicionarAdmin />

          <section aria-labelledby={`${uid}-ativos`}>
            <h3 id={`${uid}-ativos`} className="mb-1.5 corpo-sm font-medium text-foreground">
              Ativos ({ativos.length})
            </h3>
            {ativos.length === 0 ? (
              <p className="corpo-sm text-muted-foreground">Nenhum admin ativo.</p>
            ) : (
              <ul className="divide-y divide-borda-fina rounded-lg border border-borda-fina">
                {ativos.map((a) => (
                  <LinhaAdmin
                    key={a.userId}
                    admin={a}
                    souEu={a.email.toLowerCase() === eu}
                    onRemover={() => abrir(a)}
                  />
                ))}
              </ul>
            )}
          </section>

          {removidos.length > 0 ? (
            <details>
              <summary className="inline-flex min-h-6 cursor-pointer items-center py-1 corpo-sm font-medium text-foreground">
                Removidos ({removidos.length})
              </summary>
              <ul className="mt-2 divide-y divide-borda-fina rounded-lg border border-borda-fina">
                {removidos.map((a) => (
                  <li
                    key={a.userId}
                    className="grid gap-0.5 px-3 py-2 corpo-sm sm:grid-cols-[1fr_auto] sm:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">{a.nome}</span>
                      <span className="text-muted-foreground"> · {a.email}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {a.revogadoEm ? `removido em ${formatarData(a.revogadoEm)}` : "removido"}
                      {a.motivo ? ` · ${a.motivo}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 corpo-sm text-muted-foreground">
                Para reincluir, use “Adicionar admin” com o mesmo e-mail.
              </p>
            </details>
          ) : null}
        </>
      )}

      <HistoricoAdmins eventos={historico} erro={erroHistorico} />

      <DialogoConfirmacao
        aberto={alvo !== null}
        titulo="Remover admin do programa"
        descricao={alvo ? `${alvo.nome} · ${alvo.email}` : undefined}
        consequencia={
          alvo
            ? `${alvo.nome} deixa de ver e editar todos os alunos do programa. O acesso a outros sistemas do grupo não muda.`
            : ""
        }
        rotuloConfirmar="Remover admin"
        rotuloConfirmando="Removendo…"
        confirmando={pending}
        erro={erro}
        onConfirmar={confirmar}
        onCancelar={fechar}
      >
        <CampoMotivo
          id={`${uid}-motivo-remover`}
          valor={motivo}
          onChange={setMotivo}
          placeholder="Ex.: saiu da equipe"
        />
      </DialogoConfirmacao>
    </Secao>
  );
}

function LinhaAdmin({
  admin,
  souEu,
  onRemover,
}: {
  admin: AdminDoPrograma;
  souEu: boolean;
  onRemover: () => void;
}) {
  const desde = admin.concedidoEm ? formatarData(admin.concedidoEm) : null;
  return (
    <li className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium text-foreground">
          {admin.nome}
          {souEu ? <span className="font-normal text-muted-foreground"> (você)</span> : null}
        </span>
        <span className="truncate corpo-sm text-muted-foreground">{admin.email}</span>
      </div>
      <span className="corpo-sm text-muted-foreground sm:w-56 sm:text-right">
        {[desde ? `desde ${desde}` : null, admin.concedidoPorNome ? `por ${admin.concedidoPorNome}` : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <div className="shrink-0 sm:w-24 sm:text-right">
        {souEu ? (
          <span className="corpo-sm text-muted-foreground">—</span>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={onRemover}>
            Remover
          </Button>
        )}
      </div>
    </li>
  );
}
