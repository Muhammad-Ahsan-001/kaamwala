import { Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { data, type Category } from "../../data";
import { categoryName, phrase } from "../../data/labels";
import { useSettings } from "../../lib/settings";
import { CategoryIcon } from "../../ui/CategoryIcon";
import { Chip, IconButton } from "../../ui/primitives";

/** Choose trades from the admin-managed list, or type one and get a suggestion. */
export function TradePicker({
  categories,
  selected,
  tradeText,
  onSelected,
  onTradeText,
}: {
  categories: Category[];
  selected: string[];
  tradeText: string;
  onSelected: (ids: string[]) => void;
  onTradeText: (text: string) => void;
}) {
  const { lang, t } = useSettings();
  const [suggestion, setSuggestion] = useState<Category | null>(null);

  useEffect(() => {
    const text = tradeText.trim();
    if (text.length < 2) {
      setSuggestion(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void data.matchTrade(text).then((match) => {
        if (active) setSuggestion(match);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tradeText]);

  const toggle = (id: string) => onSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Chip key={category.id} active={selected.includes(category.id)} onClick={() => toggle(category.id)}>
            <CategoryIcon name={category.icon} className="h-5 w-5 shrink-0" />
            {categoryName(category, lang)}
          </Chip>
        ))}
      </div>
      <input
        dir="auto"
        aria-label={t("اپنا کام لکھیں", "Apna kaam likhein", "Type your trade")}
        value={tradeText}
        onChange={(event) => onTradeText(event.target.value)}
        placeholder={t("فہرست میں نہیں؟ یہاں لکھیں", "List mein nahi? Yahan likhein", "Not listed? Type it here")}
        className="field mt-2"
      />
      {suggestion && !selected.includes(suggestion.id) && (
        <button
          type="button"
          onClick={() => {
            onSelected([...selected, suggestion.id]);
            onTradeText("");
          }}
          className="mt-2 flex min-h-12 w-full items-center gap-2 rounded-2xl bg-amber-50 px-3 text-start font-bold text-amber-800"
        >
          <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">
            {t("کیا آپ کا کام یہ ہے؟", "Kya aap ka kaam ye hai?", "Did you mean")} {categoryName(suggestion, lang)}
          </span>
          <Plus className="h-5 w-5 shrink-0" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Choose skills suggested by the selected trades, or add your own. */
export function SkillsPicker({
  categories,
  categoryIds,
  skills,
  onChange,
}: {
  categories: Category[];
  categoryIds: string[];
  skills: string[];
  onChange: (skills: string[]) => void;
}) {
  const { lang, t } = useSettings();
  const [text, setText] = useState("");

  const options = useMemo(() => {
    const fromCategories = categories.filter((c) => categoryIds.includes(c.id)).flatMap((c) => c.skills);
    return [...new Set([...fromCategories, ...skills])];
  }, [categories, categoryIds, skills]);

  const toggle = (skill: string) => onChange(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill]);

  const add = () => {
    const skill = text.trim();
    if (!skill) return;
    if (!skills.includes(skill)) onChange([...skills, skill]);
    setText("");
  };

  return (
    <div>
      {options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {options.map((skill) => (
            <Chip key={skill} active={skills.includes(skill)} onClick={() => toggle(skill)}>
              {phrase(skill, lang)}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          dir="auto"
          aria-label={t("نیا ہنر لکھیں", "Naya hunar likhein", "Add a skill")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={t("اور ہنر لکھیں", "Aur hunar likhein", "Add another skill")}
          className="field"
        />
        <IconButton icon={Plus} label={t("شامل کریں", "Shamil karein", "Add")} tone="brand" className="h-14 w-14" onClick={add} />
      </div>
    </div>
  );
}
