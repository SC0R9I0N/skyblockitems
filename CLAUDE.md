# Claude Prompt: Standalone Hypixel Skyblock Item Browser App (Minecraft‑Style UI)

You are acting as a senior application architect and full‑stack developer. Your task is to design and implement a standalone Electron + React desktop application that provides users with a complete, searchable item browser for Hypixel Skyblock.

The app must visually mimic a Minecraft UI, including:
- Square item slots arranged in a grid
- A search bar at the bottom
- Item icons that look like Minecraft inventory icons
- Tabs styled like Minecraft menu buttons

Your job is to produce all necessary code, data structures, UI layouts, and logic to build this application end‑to‑end.

You must NOT generate Git commands or Git instructions.

## Core Requirements

### 1. Item Source
- Pull item data from the Hypixel Skyblock Wiki (names, icons, categories, descriptions, uses, sources).
- Normalize item categories so they can be filtered into tabs:
  - All Items
  - Pets
  - Pet Items
  - Weapons
  - Armor
  - Equipment
  - Misc
  - Favorites

### 2. Tabs & Filtering
- The app must have multiple tabs at the top or left side.
- When the user clicks a tab, the item grid shows only items belonging to that tab’s category.
- The search bar must filter items live as the user types, without pressing Enter.
- Filtering must be case‑insensitive and match partial substrings.

### 3. Item Grid (Minecraft‑Style)
- Display items in a grid of square slots, visually identical to Minecraft inventory slots.
- Each slot shows the item’s icon.
- Hovering over an item shows a tooltip styled like Minecraft tooltips.
- Clicking an item opens an Item Detail Panel.

### 4. Item Detail Panel
- Shows:
  - Item icon
  - Item name
  - Where it comes from (source, drops, crafting, NPCs, etc.)
  - What it’s used for (crafting, upgrades, quests, etc.)
- Include an “Add to Favorites” button.
- Favorites must persist across app restarts (local storage or JSON file).

### 5. Favorites System
- Users can mark any item as a favorite.
- The Favorites tab shows only items the user has favorited.
- Favorites must be stored locally and reloaded on startup.

### 6. UI Requirements
- The entire UI must resemble Minecraft’s GUI style:
  - Pixelated borders
  - Dark background
  - Inventory slot textures
  - Tooltip styling
  - Search bar styled like the Creative Mode search bar
- The app must feel like a Minecraft mod menu, but is a standalone app.

### 7. Architecture Requirements
- Provide a complete architecture for the app, including:
  - Frontend framework (e.g., Electron + React, or a Python GUI like PyQt)
  - Data loading pipeline for wiki scraping or cached JSON
  - UI component structure
  - State management
  - Event handling for search, tab switching, and item selection
  - Favorites persistence

### 8. Output Requirements
You must produce:
- Full application architecture
- All core UI components
- Data models for items, categories, favorites
- Search filtering logic
- Tab filtering logic
- Item detail panel logic
- Code for loading item data
- Code for rendering Minecraft‑style UI elements
- Example implementations for each major component
- A complete explanation of how the app runs as a standalone executable

### 9. Behavior Requirements
- You must proactively analyze the app’s needs and produce missing components without waiting for instructions.
- You may reorganize or expand the architecture if it improves maintainability.
- You must ensure the UI is clean, responsive, and visually identical to Minecraft’s inventory interface.
- You must ensure the search filtering is instant and efficient.

Begin by designing the full architecture of the standalone app. Then produce the UI layout, item data structures, filtering logic, favorites system, and all necessary code.

Prioritize correctness, completeness, and production‑ready structure.

## Dark Mode Toggle
- Add a UI toggle that switches the entire app between:
  - Minecraft’s default light‑gray UI
  - A custom dark‑mode UI (deep charcoal backgrounds, darker slot textures, adjusted tooltip colors)
- Dark mode must apply to:
  - Background textures  
  - Inventory slot textures  
  - Tooltip backgrounds  
  - Search bar  
  - Tabs  
- Dark mode preference must persist across app restarts.

## Hide Vanilla Minecraft Items Toggle
- Add a toggle that filters out any item flagged as a **vanilla Minecraft item**.
- Works alongside:
  - Category filters  
  - Search filters  
  - Dark mode  
- Must persist across app restarts.
- Item model must include a boolean `isVanilla` flag.

## Rarity‑Colored Item Slot Borders
- Item slot borders must reflect item rarity:
  - Common → gray  
  - Uncommon → green  
  - Rare → blue  
  - Epic → purple  
  - Legendary → orange  
  - Mythic → pink  
  - Divine → light blue  
  - Special → red  
  - Very Special → gold  
- Borders glow slightly on hover.
- Dark mode must adjust border brightness appropriately.

## Calculator Panel
- Add a calculator panel accessible via a button in the UI.
- Calculator must support:
  - `+` addition  
  - `-` subtraction  
  - `*` multiplication  
  - `/` division  
  - `e` scientific notation  
  - Parentheses  
- No advanced functions (no log, sin, cos, etc.).
- Styled like a Minecraft GUI (pixelated frame, dark background).
- Implement as a standalone component with its own state.

## Automatic Pet Stat Display (Level 100 Only)
- When viewing any pet item in the Item Detail Panel:
  - Automatically display the pet’s **level 100 stats only**.
  - Use the pet’s base stats and apply the standard Hypixel Skyblock pet stat scaling formula to compute the level‑100 values.
  - Show:
    - Final level‑100 stats
    - Any multiplicative or additive bonuses applied at level 100
  - Display these stats in a Minecraft‑style tooltip panel.
- No level selector, no scaling preview — **only level 100**.
- Level‑100 pet stat display must update dynamically if the pet has multiple rarities or variants.
- Include a toggle to show/hide the level‑100 stat panel.

## Magical Power Stone Sample Stats (1000 Magical Power)
- When viewing any magical power stone:
  - Automatically display **sample stat values assuming 1000 Magical Power**.
  - Use the correct Hypixel Skyblock magical power scaling formula.
  - Show:
    - The stone’s base stat contribution
    - The scaled stat contribution at 1000 MP
    - Any special modifiers or multipliers
  - Present these stats in a Minecraft‑style tooltip panel.
- Include a toggle to show/hide magical power sample calculations.
- Magical power sample stats must update dynamically if the stone has multiple rarities or scaling behaviors.

## Integration Requirements
- Both features must integrate seamlessly into the existing Item Detail Panel.
- Both features must respect:
  - Dark mode
  - Rarity‑colored borders
  - Vanilla‑item filtering toggle
- Calculated stats must be cached to avoid unnecessary recomputation.
- All stat displays must use pixelated Minecraft‑style UI elements.

# Additional Feature Notes / TODO (Builds Section Additions)

## Builds Section
- Add a dedicated **“Builds”** section in the app.
- Users should be able to:
  - Create a new hypothetical build
  - View all saved builds
  - Edit an existing build
  - Delete builds
- Builds must store:
  - Selected item or full armor set
  - Applied enchantments, reforges, gemstones, upgrades, modifiers
  - Hypothetical pet and pet item
  - Catacombs level if the selected item is a Catacombs/dungeon item
  - Any dungeon stars or master stars
- Builds must be saved locally and persist across app restarts.

## Estimated Price Calculation
- Each build should display an **estimated total price** of the setup.
- Price estimation must consider:
  - Base item cost
  - Cost of enchantments
  - Cost of reforges
  - Cost of gemstones
  - Cost of upgrades (e.g., dungeon stars)
  - Cost of pet and pet item
