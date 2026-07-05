import { MODULES } from "@/lib/modules";
import { HiveCell } from "./HiveCell";

const CELL = 128;
const GAP = 8;

const AXIAL: Array<[number, number]> = [
  [0, 0],
  [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
  [2, -2], [2, -1], [2, 0], [1, 1], [0, 2], [-1, 2],
  [-2, 2], [-2, 1], [-2, 0], [-1, -1], [0, -2], [1, -2],
];

export function Hive() {
  const w = CELL + GAP;
  const h = CELL * 1.1547 + GAP;
  const positions = AXIAL.map(([q, r]) => ({
    x: w * (q + r / 2),
    y: h * 0.75 * r,
  }));

  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const boardW = Math.max(...xs) - minX + CELL;
  const boardH = Math.max(...ys) - minY + CELL * 1.1547;

  return (
    <div
      className="relative mx-auto"
      style={{ width: boardW, height: boardH }}
      role="navigation"
      aria-label="BUR Hive"
    >
      {positions.map((p, i) => {
        const module = MODULES[i] ?? {
          slug: `ghost-${i}`,
          name: "",
          tagline: "",
          description: "",
          status: "soon" as const,
        };
        return (
          <HiveCell
            key={module.slug + i}
            module={module}
            x={p.x - minX}
            y={p.y - minY}
            size={CELL}
          />
        );
      })}
    </div>
  );
}
