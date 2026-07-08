import { cn } from "@/lib/utils";

export function GpsLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-primary font-bold tracking-tight text-primary-foreground shadow-sm",
        size === "md" ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm",
        className,
      )}
      aria-hidden
    >
      GPS
    </div>
  );
}
