import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("card-hover rounded-lg border border-line bg-white", className)}
      {...props}
    />
  );
}

export function CardHighlight({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("card-hover rounded-lg border border-line bg-ink text-paper", className)}
      {...props}
    />
  );
}
