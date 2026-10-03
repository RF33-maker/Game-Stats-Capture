import logo from "@/assets/swish-assistant-logo.png";

/** The Swish hoop mark with the product wordmark — same logo as swishassistant.com. */
export function Brand({ size = "md", showTagline = true, className = "" }: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}) {
  const img = size === "lg" ? "h-12" : size === "sm" ? "h-7" : "h-9";
  const word = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src={logo} alt="" className={`${img} w-auto select-none`} draggable={false} />
      <span className="flex flex-col leading-none">
        <span className={`sa-display font-bold ${word} leading-none text-foreground`}>Swish Stats</span>
        {showTagline && (
          <span className="mt-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">by Swish Assistant</span>
        )}
      </span>
    </span>
  );
}

export function BrandMark({ className = "h-9" }: { className?: string }) {
  return <img src={logo} alt="Swish Assistant" className={`${className} w-auto select-none`} draggable={false} />;
}
