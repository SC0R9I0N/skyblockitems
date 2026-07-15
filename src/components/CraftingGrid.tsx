import { memo } from 'react';
import type { Recipe, SkyblockItem } from '../types';
import { ItemIcon } from './ItemIcon';
import { titleCase } from '../mc/format';

interface Props {
  recipe: Recipe;
  result: SkyblockItem;
  byId: Map<string, SkyblockItem>;
  onSelect: (id: string) => void;
}

/** 3x3 Minecraft crafting table layout with the result slot. */
export const CraftingGrid = memo(function CraftingGrid({ recipe, result, byId, onSelect }: Props) {
  return (
    <div className="crafting">
      <div className="crafting-grid">
        {recipe.slots.map((slot, i) => {
          const ing = slot ? byId.get(slot.id) : undefined;
          return (
            <div
              key={i}
              className={`mc-slot small${slot ? ' clickable' : ''}`}
              title={slot ? ing?.name ?? titleCase(slot.id) : undefined}
              onClick={() => slot && ing && onSelect(ing.id)}
            >
              {slot && (
                <>
                  <ItemIcon
                    id={slot.id}
                    name={ing?.name ?? slot.id}
                    kind={ing?.icon.kind ?? 'none'}
                    tint={ing?.tint}
                    size={32}
                  />
                  {slot.count > 1 && <span className="slot-count">{slot.count}</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="crafting-arrow">→</div>
      <div className="mc-slot small result">
        <ItemIcon
          id={result.id}
          name={result.name}
          kind={result.icon.kind}
          tint={result.tint}
          size={32}
        />
        {recipe.count > 1 && <span className="slot-count">{recipe.count}</span>}
      </div>
    </div>
  );
});
