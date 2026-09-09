import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * 404 sobre o `ErroPainel` (CD8): a estrutura era a mesma — selo, chip,
 * `h1`, descrição, ação — mas escrita à mão, com outro espaçamento e outra
 * largura máxima. Duas telas de saída do portal não podem ter dois layouts.
 *
 * `tom="neutro"`: endereço errado não é falha do sistema; o vermelho de
 * `destructive` alarmaria sem motivo.
 */
export default function NotFound() {
  return (
    <ErroPainel
      tom="neutro"
      icone={<Compass />}
      titulo="Página não encontrada"
      descricao="O endereço pode ter mudado. Volte ao início para continuar."
    >
      <Link href="/" className={buttonVariants()}>
        Ir para o início
      </Link>
    </ErroPainel>
  );
}
