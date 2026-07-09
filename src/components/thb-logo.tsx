import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Selo do Time Holding Brasil (`public/logo-thb.svg`, mesmo asset do sip).
 *
 * `unoptimized` porque o otimizador de imagens do Next recusa SVG por padrão;
 * o arquivo é estático e pequeno, então servir direto é o caminho certo.
 */
export function ThbLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const px = size === "md" ? 48 : 36;
  return (
    <Image
      src="/logo-thb.svg"
      alt=""
      aria-hidden
      width={px}
      height={px}
      unoptimized
      priority
      className={cn(
        "shrink-0 rounded-full",
        size === "md" ? "size-12" : "size-9",
        className,
      )}
    />
  );
}
