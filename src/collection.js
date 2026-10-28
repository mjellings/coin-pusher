// The Collection Book: themed collectables that turn up on the board now and then. Push one off
// the front to add it to the book; finish a set for a coin shower and a bigger free-coin top-up.

export const SETS = [
  {
    id: "pirate",
    name: "Pirate Cove",
    color: "#2fb8c9",
    items: [
      { id: "anchor", name: "Anchor", icon: "⚓", weight: 5 },
      { id: "parrot", name: "Parrot", icon: "🦜", weight: 4 },
      { id: "map", name: "Treasure Map", icon: "🗺️", weight: 3 },
      { id: "skull", name: "Skull", icon: "💀", weight: 2 },
      { id: "chest", name: "Treasure Bag", icon: "💰", weight: 1 },
    ],
  },
  {
    id: "space",
    name: "Deep Space",
    color: "#8c6bff",
    items: [
      { id: "star", name: "Star", icon: "⭐", weight: 5 },
      { id: "planet", name: "Planet", icon: "🪐", weight: 4 },
      { id: "rocket", name: "Rocket", icon: "🚀", weight: 3 },
      { id: "ufo", name: "UFO", icon: "🛸", weight: 2 },
      { id: "alien", name: "Alien", icon: "👽", weight: 1 },
    ],
  },
  {
    id: "sweets",
    name: "Sweet Shop",
    color: "#ff5fa8",
    items: [
      { id: "candy", name: "Candy", icon: "🍬", weight: 5 },
      { id: "donut", name: "Donut", icon: "🍩", weight: 4 },
      { id: "icecream", name: "Ice Cream", icon: "🍦", weight: 3 },
      { id: "cupcake", name: "Cupcake", icon: "🧁", weight: 2 },
      { id: "cake", name: "Birthday Cake", icon: "🎂", weight: 1 },
    ],
  },
];

export const ITEMS = Object.fromEntries(
  SETS.flatMap((set) => set.items.map((item) => [item.id, { ...item, set }])),
);

// Coins paid for a collectable you already have.
export const DUPLICATE_VALUE = 5;
// Coins rained onto the upper tier when a set is finished.
export const SET_SHOWER = 25;

// A random item, rarer ones less often. Items you're missing are a little more likely, so the
// last piece of a set doesn't take forever.
export function randomItem(collection) {
  const all = Object.values(ITEMS);
  const weightOf = (item) => item.weight * (collection[item.id] ? 1 : 1.5);
  let roll = Math.random() * all.reduce((sum, item) => sum + weightOf(item), 0);
  for (const item of all) {
    roll -= weightOf(item);
    if (roll <= 0) return item.id;
  }
  return all[all.length - 1].id;
}

export function isSetComplete(set, collection) {
  return set.items.every((item) => collection[item.id] > 0);
}

export function completedSets(collection) {
  return SETS.filter((set) => isSetComplete(set, collection));
}
