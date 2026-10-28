// The bonus wheel. A coin that drops out of the peg board through the sliding bonus gate spins
// it. Each bonus's slice of the wheel is as wide as its chance of coming up, so the jackpot is a
// thin gold sliver.

export const BONUSES = [
  { id: "shower", name: "Coin Shower", short: "SHOWER", detail: "20 coins rain down", icon: "🌧️", color: "#e8962a", weight: 24 },
  { id: "bag", name: "Coin Bag", short: "+15", detail: "+15 coins", icon: "🪙", color: "#ff4fb8", weight: 20 },
  { id: "prizes", name: "Prize Coins", short: "PRIZES", detail: "Three ×5 prize coins drop in", icon: "🏅", color: "#8c6bff", weight: 16 },
  { id: "collectable", name: "Mystery Collectable", short: "MYSTERY", detail: "A collectable drops in", icon: "🎁", color: "#2fb8c9", weight: 14 },
  { id: "guards", name: "Side Guards", short: "GUARDS", detail: "No coins lost down the sides for 60s", icon: "🛡️", color: "#3fbf6a", weight: 12 },
  { id: "refills", name: "Quick Refills", short: "REFILLS", detail: "Free coins twice as fast for 30 min", icon: "⏱️", color: "#4f7dff", weight: 11 },
  { id: "jackpot", name: "Mega Jackpot", short: "JACKPOT", detail: "100-coin shower, a gem and a new collectable", icon: "👑", color: "#ffd84a", weight: 3 },
];

export const BONUS = Object.fromEntries(BONUSES.map((bonus) => [bonus.id, bonus]));

export const SHOWER_BONUS = 20;
export const BAG_BONUS = 15;
export const PRIZE_BONUS = 3;
export const JACKPOT_SHOWER = 100;
export const GUARDS_SECONDS = 60;
export const QUICK_REFILL_MS = 30 * 60 * 1000;

// The wheel's slices, in order round the rim. Every bonus but the jackpot appears twice, on
// opposite sides, so the colours mix. Angles are fractions of a turn.
export const SLICES = (() => {
  const halves = BONUSES.filter((bonus) => bonus.id !== "jackpot");
  const order = [...halves, BONUS.jackpot, ...halves];
  const total = order.reduce((sum, bonus) => sum + (bonus.id === "jackpot" ? bonus.weight : bonus.weight / 2), 0);
  let start = 0;
  return order.map((bonus) => {
    const size = (bonus.id === "jackpot" ? bonus.weight : bonus.weight / 2) / total;
    const slice = { bonus, start, size };
    start += size;
    return slice;
  });
})();

// Picks where the wheel stops, as a fraction of a turn, and the slice it lands in.
export function spinResult() {
  const at = Math.random();
  const slice = SLICES.find((s) => at < s.start + s.size) ?? SLICES[SLICES.length - 1];
  return { at, slice };
}

// Lands somewhere inside one of a bonus's slices. Used by the debug panel.
export function spinTo(id) {
  const slices = SLICES.filter((s) => s.bonus.id === id);
  const slice = slices[Math.floor(Math.random() * slices.length)];
  return { at: slice.start + slice.size * (0.2 + Math.random() * 0.6), slice };
}
