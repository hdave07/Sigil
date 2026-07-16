const styles: Record<string, string> = {
  green: "bg-green/15 text-green",
  orange: "bg-orange/15 text-orange",
  red: "bg-red/12 text-red",
  blue: "bg-accent/10 text-accent",
};

export default function Badge({
  color,
  children,
}: {
  color: "green" | "orange" | "red" | "blue";
  children: React.ReactNode;
}) {
  return <span className={`badge whitespace-nowrap ${styles[color]}`}>{children}</span>;
}
