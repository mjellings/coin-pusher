// The bonus slot machine. A coin that drops through the sliding bonus gate earns a credit; each
// credit pulls the three reels once, and a winning line pays one of these bonuses.

export const BONUSES = [
  { id: "pair", name: "Cherry Pair", detail: "+5 coins", icon: "🍒" },
  { id: "bag", name: "Coin Bag", detail: "+15 coins", icon: "🪙" },
  { id: "shower", name: "Coin Shower", detail: "20 coins rain down", icon: "🌧️" },
  { id: "collectable", name: "Mystery Collectable", detail: "A collectable drops in", icon: "🎁" },
  { id: "guards", name: "Side Guards", detail: "No coins lost down the sides for 60s", icon: "🛡️" },
  { id: "prizes", name: "Prize Coins", detail: "Three ×5 prize coins drop in", icon: "🏅" },
  { id: "refills", name: "Quick Refills", detail: "Free coins twice as fast for 30 min", icon: "⏱️" },
  { id: "jackpot", name: "Mega Jackpot", detail: "100-coin shower, a gem and a new collectable", icon: "👑" },
];

export const BONUS = Object.fromEntries(BONUSES.map((bonus) => [bonus.id, bonus]));

export const PAIR_BONUS = 5;
export const SHOWER_BONUS = 20;
export const BAG_BONUS = 15;
export const PRIZE_BONUS = 3;
export const JACKPOT_SHOWER = 100;
export const GUARDS_SECONDS = 60;
export const QUICK_REFILL_MS = 30 * 60 * 1000;

export const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣", "👑"];
const CHERRY = SYMBOLS[0];

// What each winning line pays and how often it comes up, in percent. Any two cherries is the
// small, common win; three crowns is the jackpot. Everything else is a loss.
export const PAYTABLE = [
  { line: ["👑", "👑", "👑"], bonus: "jackpot", chance: 0.5 },
  { line: ["7️⃣", "7️⃣", "7️⃣"], bonus: "refills", chance: 2.5 },
  { line: ["💎", "💎", "💎"], bonus: "prizes", chance: 4 },
  { line: ["⭐", "⭐", "⭐"], bonus: "guards", chance: 5 },
  { line: ["🔔", "🔔", "🔔"], bonus: "collectable", chance: 6 },
  { line: ["🍋", "🍋", "🍋"], bonus: "shower", chance: 9 },
  { line: ["🍒", "🍒", "🍒"], bonus: "bag", chance: 8 },
  { line: ["🍒", "🍒", "·"], bonus: "pair", chance: 15 },
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// The reels for a given result: a winning line, or for a loss (null) a line that pays nothing.
// Losses are often a near miss, two of a kind with the third just off.
export function reelsFor(bonus) {
  const entry = PAYTABLE.find((e) => e.bonus === bonus);
  if (entry && bonus !== "pair") return [...entry.line];
  if (bonus === "pair") {
    const reels = [CHERRY, CHERRY, pick(SYMBOLS.slice(1))];
    // Put the odd one out on a random reel.
    const odd = Math.floor(Math.random() * 3);
    [reels[2], reels[odd]] = [reels[odd], reels[2]];
    return reels;
  }
  const others = SYMBOLS.slice(1);
  if (Math.random() < 0.4) {
    const two = pick(others);
    const reels = [two, two, pick(others.filter((s) => s !== two))];
    if (Math.random() < 0.5) [reels[1], reels[2]] = [reels[2], reels[1]];
    return reels;
  }
  // Three different symbols, at most one of them a cherry.
  const reels = [];
  while (reels.length < 3) {
    const s = pick(SYMBOLS);
    if (!reels.includes(s)) reels.push(s);
  }
  return reels;
}

// One pull: which bonus it pays (null for a loss) and the symbols to show.
export function pull() {
  let roll = Math.random() * 100;
  for (const entry of PAYTABLE) {
    roll -= entry.chance;
    if (roll < 0) return { bonus: entry.bonus, reels: reelsFor(entry.bonus) };
  }
  return { bonus: null, reels: reelsFor(null) };
}

// A pull that lands on a chosen result. Used by the debug panel.
export function pullFor(bonus) {
  return { bonus, reels: reelsFor(bonus) };
}
