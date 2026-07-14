const styles: Record<string, string> = {
  green: "bg-[#eafaf3] text-[#0f7a47]",
  orange: "bg-[#fff4e6] text-[#b85c00]",
  red: "bg-[#fef0f0] text-[#c0392b]",
  blue: "bg-[#eef1ff] text-accent",
};

export default function Badge({
  color,
  children,
}: {
  color: "green" | "orange" | "red" | "blue";
  children: React.ReactNode;
}) {
  return <span className={`badge ${styles[color]}`}>{children}</span>;
}
