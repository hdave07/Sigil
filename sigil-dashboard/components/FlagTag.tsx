import { FlagType } from "@/lib/types";

// "Not permitted" is the plain permission-block case — flat red, same
// treatment as any other block. "Off-mission" is the more interesting case
// (the action is allowed, it just doesn't fit the job), so it gets the
// accent/highlight treatment instead of red, to read as its own category
// rather than another flavor of "blocked."
export default function FlagTag({ flagType }: { flagType?: FlagType }) {
  if (!flagType) return null;
  if (flagType === "off_mission") {
    return (
      <span className="badge bg-accent text-white shrink-0 shadow-[0_2px_8px_-2px_rgba(74,78,105,0.55)]">
        Off-mission
      </span>
    );
  }
  return <span className="badge bg-red/12 text-red shrink-0">Not permitted</span>;
}
