import { Users } from "lucide-react";

/**
 * Avisa o sócio (e o titular) que o ambiente é compartilhado — sem isso o
 * sócio não entende por que vê clientes que não cadastrou. Só aparece quando
 * há mais de um membro no ambiente (`qtdMembros > 1`). Mesmo padrão visual de
 * `ClienteEquipeBanner` (faixa discreta, sem estado, Server Component).
 */
export function AmbienteCompartilhadoBanner({
  nomeTitular,
  souSocio,
}: {
  nomeTitular: string | null;
  souSocio: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-2.5 text-sm">
      <Users className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">
        {souSocio ? (
          <>
            Ambiente de{" "}
            <span className="font-medium text-foreground">
              {nomeTitular ?? "outro aluno"}
            </span>{" "}
            — você está como sócio e compartilha os mesmos clientes e
            progresso.
          </>
        ) : (
          "Este ambiente é compartilhado com um sócio: os clientes e o progresso são os mesmos para os dois."
        )}
      </span>
    </div>
  );
}
