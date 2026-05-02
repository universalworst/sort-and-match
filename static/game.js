// ── State ──────────────────────────────────────────────────────────
// groups: the raw data from the backend, e.g.
//   [{ name: "Philosophers", members: ["Kant", "Hume", ...] }, ...]
//
// tiles: the live board state — each tile is:
//   { group: "Philosophers", members: ["Kant"], done: false }
//
// selectedIndex: which tile index is currently highlighted (or null)

let groups = [];
let tiles = [];
let selectedIndex = null;
let firstMergeHappened = false;

// ── Boot ────────────────────────────────────────────────────────────
// Runs once when the page loads.
document.addEventListener("DOMContentLoaded", () => {
  newGame();
});

// ── New game ────────────────────────────────────────────────────────
// Fetches fresh group data from the Flask backend, then builds the board.
async function newGame() {
  selectedIndex = null;
  firstMergeHappened = false;
  setStatus("Loading…", "");
  hideWinBanner();

  try {
    const response = await fetch("/game-data");
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    groups = await response.json();
  } catch (err) {
    // If the backend isn't running yet, fall back to placeholder data
    // so you can still test the frontend on its own.
    console.warn("Could not reach /game-data, using fallback data.", err.message);
    groups = getFallbackGroups();
  }

  buildTiles();
  render();
  setStatus("Pick any button to start.", "");
}

// ── Build tiles ─────────────────────────────────────────────────────
// Turns the groups array into individual tile objects, then shuffles them.
function buildTiles() {
  tiles = [];
  groups.forEach(group => {
    group.members.forEach(member => {
      tiles.push({ group: group.name, members: [member], done: false });
    });
  });
  shuffle(tiles);
}

// ── Render ──────────────────────────────────────────────────────────
// Rebuilds the board DOM from the current tiles array.
function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  tiles.forEach((tile, i) => {
    const el = document.createElement("button");
    const allMembers = tile.members.join(", ");
    const preview = tile.members.slice(0, 2).join(", ");
    const hasMore = tile.members.length > 2;
    const classes = ["tile"];
    if (tile.done)          classes.push("done");
    if (selectedIndex === i) classes.push("selected");
    el.className = classes.join(" ");

    el.textContent = tile.members.join(", ");
    el.dataset.index = i;
    el.textContent = hasMore ? preview + "…" : allMembers;
    el.title = allMembers; // shows full list on hover as a tooltip

    if (!tile.done) {
      el.addEventListener("click", () => handleClick(i));
    }

    board.appendChild(el);
  });
}

// ── Click handler ───────────────────────────────────────────────────
function handleClick(i) {

  // Nothing selected yet — select this tile
  if (selectedIndex === null) {
    selectedIndex = i;
    render();
    if (!firstMergeHappened) {
    setStatus("Now click another button from the same group.", "");
  }
    return;
  }

  // Clicked the already-selected tile — deselect it
  if (selectedIndex === i) {
    selectedIndex = null;
    render();
    if (!firstMergeHappened) {
    setStatus("Pick any button to start.", "");
  }
    return;
  }

  const a = tiles[selectedIndex];
  const b = tiles[i];

  if (a.group === b.group) {
    handleCorrectMatch(selectedIndex, i);
  } else {
    handleWrongMatch(selectedIndex, i);
  }

  selectedIndex = null;
}

// ── Correct match ────────────────────────────────────────────────────
function handleCorrectMatch(idxA, idxB) {
  const a = tiles[idxA];
  const b = tiles[idxB];

  const groupSize = groups.find(g => g.name === a.group).members.length;
  const merged = {
    group: a.group,
    members: [...a.members, ...b.members],
    done: false
  };
  firstMergeHappened = true;

  const isComplete = merged.members.length === groupSize;
  if (isComplete) merged.done = true;

  const hi = Math.max(idxA, idxB);
  const lo = Math.min(idxA, idxB);
  tiles.splice(hi, 1);
  tiles.splice(lo, 1, merged);
  selectedIndex = null;

  render();

  // Animate the new front tile
  const allTileEls = document.querySelectorAll(".tile");

  if (isComplete) {
    animate(allTileEls[lo], "complete-pulse", 700);
    setStatus(`Group complete: "${merged.group}"!`, "good");
    notifyBackend("group_complete", { group: merged.group });

    if (tiles.every(t => t.done)) {
      setStatus("All groups complete — well done!", "good");
      showWinBanner();
      notifyBackend("game_complete", {});
    }

  } else {
    animate(allTileEls[lo], "just-merged", 400);
    const remaining = groupSize - merged.members.length;
    setStatus(`Merged! ${remaining} more to go in this category.`, "good");
    notifyBackend("merge", { group: merged.group, members: merged.members });
  }

  
}

// ── Wrong match ──────────────────────────────────────────────────────
function handleWrongMatch(idxA, idxB) {
  selectedIndex = null; // ← clear this FIRST
  render();             // ← one clean render with nothing selected

  const allTiles = document.querySelectorAll(".tile");
  animate(allTiles[idxA], "wrong", 400);
  animate(allTiles[idxB], "wrong", 400);

  setStatus("Different groups!", "bad");
}

// ── Hint ─────────────────────────────────────────────────────────────
function showHint() {
  const incomplete = tiles.filter(t => !t.done);
  if (!incomplete.length) return;
  const pick = incomplete[Math.floor(Math.random() * incomplete.length)];
  setStatus(`Hint: look for another "${pick.group}" button!`, "");
}

// ── Backend communication ─────────────────────────────────────────────
// Sends game events to your Flask backend.
// Falls back silently if the server isn't running yet.
async function notifyBackend(eventType, data) {
  try {
    const response = await fetch("/game-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: eventType, ...data })
    });
    const result = await response.json();
    console.log("Backend:", result);
    // You can use result here — e.g. result.valid to undo a bad move
  } catch (err) {
    console.log("Backend not reachable (ok during local dev):", err.message);
  }
}

// ── UI helpers ────────────────────────────────────────────────────────
function setStatus(text, type) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = "status" + (type ? ` ${type}` : "");
}

function showWinBanner() {
  document.getElementById("win-banner").hidden = false;
}

function hideWinBanner() {
  document.getElementById("win-banner").hidden = true;
}

// ── Animation helper ──────────────────────────────────────────────────
// Adds a CSS class, then removes it after `duration` ms.
function animate(el, className, duration) {
  if (!el) return;
  el.classList.add(className);
  setTimeout(() => el && el.classList.remove(className), duration);
}

// ── Shuffle (Fisher-Yates) ────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Fallback data ─────────────────────────────────────────────────────
// Used when the Flask backend isn't running yet.
// Mirrors the structure your /game-data route will return.
function getFallbackGroups() {
  return [
    {
      name: "Revolutionaries",
      members: ["Vladimir Lenin", "Che Guevara", "Fidel Castro", "Emiliano Zapata", "Toussaint L'Ouverture"]
    },
    {
      name: "Philosophers",
      members: ["Immanuel Kant", "Aristotle", "Socrates", "David Hume", "Friedrich Nietzsche"]
    }
  ];
}
