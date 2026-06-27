const PALETTE = [
  "#E1F5EE",
  "#FDECEC",
  "#EEF2FF",
  "#FEF3C7",
  "#F3E8FF",
  "#E0F2FE",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Tint determinista a partir del nombre (solo estético). */
function tint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[hash];
}

export function ClientAvatar({
  name,
  size = 36,
}: {
  name: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-ink"
      style={{
        background: tint(name),
        width: size,
        height: size,
        fontSize: size * 0.32,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function ClientTag({ tag }: { tag: string }) {
  const isVip = tag === "VIP";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isVip ? "bg-[#E1F5EE] text-[#085041]" : "bg-background text-label"
      }`}
    >
      {tag}
    </span>
  );
}
