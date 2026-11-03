// Seat maps from "PTX. OPS. Seat Configuration. 2026 10 27.xlsx".
// Each bench is [seats on the driver-opposite side, seat in the aisle, seats on the driver side].
type Bench = [top: number, aisle: number, bottom: number];

export interface SeatCell {
  seatNo: number;
  bench: number; // 0 = front of the bus
  position: number; // 0-1 top side, 2 aisle, 3-5 bottom side
}

export interface SeatLayout {
  id: string;
  label: string;
  seats: number;
  benches: number;
  cells: SeatCell[];
}

function repeat(count: number, bench: Bench): Bench[] {
  return Array.from({ length: count }, () => bench);
}

function build(id: string, label: string, benches: Bench[]): SeatLayout {
  const cells: SeatCell[] = [];
  let seatNo = 0;
  benches.forEach(([top, aisle, bottom], bench) => {
    for (let i = 0; i < top; i++) cells.push({ seatNo: ++seatNo, bench, position: i });
    if (aisle) cells.push({ seatNo: ++seatNo, bench, position: 2 });
    // Bottom-side seats sit against the far edge, so a 2-seat bench leaves the aisle-side slot empty.
    for (let i = 0; i < bottom; i++) cells.push({ seatNo: ++seatNo, bench, position: 6 - bottom + i });
  });
  return { id, label, seats: seatNo, benches: benches.length, cells };
}

export const SEAT_LAYOUTS: SeatLayout[] = [
  build("26", "26 seater (2x1, 9 rows)", [
    ...repeat(3, [1, 0, 2]),
    ...repeat(2, [0, 0, 2]),
    ...repeat(3, [1, 0, 2]),
    [2, 0, 2],
  ]),
  build("36", "36 seater (2x1, 12 rows)", repeat(12, [1, 0, 2])),
  build("45", "45 seater (2x2, 11 rows)", [...repeat(10, [2, 0, 2]), [2, 1, 2]]),
  build("49", "49 seater (2x2, 12 rows)", [...repeat(11, [2, 0, 2]), [2, 1, 2]]),
  build("53", "53 seater (2x2, 13 rows)", [...repeat(12, [2, 0, 2]), [2, 1, 2]]),
  build("61", "61 seater (2x3, 12 rows)", [...repeat(11, [2, 0, 3]), [2, 1, 3]]),
  build("63", "63 seater (2x3, 13 rows)", [[2, 0, 0], ...repeat(11, [2, 0, 3]), [2, 1, 3]]),
  build("66", "66 seater (2x3, 13 rows)", [...repeat(12, [2, 0, 3]), [2, 1, 3]]),
];

export function getLayout(id: string | undefined): SeatLayout | undefined {
  return SEAT_LAYOUTS.find((l) => l.id === id);
}

/** Reads a list such as "44, 45" into the seat numbers that exist on the layout. */
export function parseBlockedSeats(value: string | undefined, layout: SeatLayout | undefined): Set<number> {
  const seats = (value ?? "")
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= (layout?.seats ?? 0));
  return new Set(seats);
}
