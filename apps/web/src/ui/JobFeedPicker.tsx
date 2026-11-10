import { Check, ChevronLeft, ListChecks, Volume2 } from "lucide-react";
import { useState } from "react";
import { data, type Category, type WorkerSelf } from "../data";
import { errorText } from "../data/errors";
import { categoryName } from "../data/labels";
import { cue, speakUrdu } from "../lib/audio";
import { useSettings, type Lang } from "../lib/settings";
import { CategoryIcon } from "./CategoryIcon";
import { Button, IconButton, InlineError, Sheet, Tag, cx } from "./primitives";

type Translate = (ur: string, roman: string, en: string) => string;

export const JOB_FEED_QUESTION = ["کون سے کام دیکھنے ہیں؟", "Kaun se kaam dekhne hain?", "Which jobs do you want to see?"] as const;

const SPOKEN_QUESTION = "کون سے کام دیکھنے ہیں؟ جو کام دیکھنے ہیں، انہیں چنیں۔";

/** The server's rule, for showing it: what they chose, otherwise their own. A copy saved offline earlier may have no choice on it. */
function chosenTrades(worker: WorkerSelf, categories: Category[]): string[] {
  const active = (ids: string[]) => categories.filter((c) => ids.includes(c.id)).map((c) => c.id);
  const chosen = worker.feedCategoryIds?.length ? active(worker.feedCategoryIds) : [];
  return chosen.length > 0 ? chosen : active(worker.categoryIds);
}

export function feedSummary(worker: WorkerSelf, categories: Category[], lang: Lang, t: Translate): string {
  const names = chosenTrades(worker, categories).map((id) => categoryName(categories.find((c) => c.id === id), lang));
  const shown = names.slice(0, 2).join(lang === "ur" ? "، " : ", ");
  const more = names.length - 2;
  return more > 0 ? t(`${shown} اور ${more}`, `${shown} aur ${more}`, `${shown} +${more}`) : shown;
}

export function JobFeedButton({ worker, categories, disabled, onClick }: { worker: WorkerSelf; categories: Category[]; disabled?: boolean; onClick: () => void }) {
  const { t, lang } = useSettings();
  const summary = feedSummary(worker, categories, lang, t);
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2 text-start transition active:scale-[0.99] disabled:opacity-45">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
        <ListChecks className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{t(...JOB_FEED_QUESTION)}</span>
        {summary && <span className="block truncate text-sm text-soft">{summary}</span>}
      </span>
      <ChevronLeft className="h-5 w-5 shrink-0 text-faint ltr:rotate-180" aria-hidden />
    </button>
  );
}

/** Every active trade as a big tile. What the worker saves decides which open jobs reach them. */
export function JobFeedSheet({ worker, categories, onClose, onSaved }: { worker: WorkerSelf; categories: Category[]; onClose: () => void; onSaved: (worker: WorkerSelf) => void }) {
  const { t, lang, audioCues } = useSettings();
  const [initial] = useState(() => chosenTrades(worker, categories));
  const [selected, setSelected] = useState(initial);
  const [needOne, setNeedOne] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setError(null);
    if (selected.includes(id) && selected.length === 1) {
      setNeedOne(true);
      cue("down", audioCues);
      return;
    }
    setNeedOne(false);
    cue("tap", audioCues);
    setSelected(selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id]);
  };

  const save = async () => {
    const feedCategoryIds = categories.filter((c) => selected.includes(c.id)).map((c) => c.id);
    if (feedCategoryIds.length === 0) {
      setNeedOne(true);
      return;
    }
    // Saving no change keeps a worker who never chose on "my own trades", which follows their profile.
    if (selected.length === initial.length && selected.every((id) => initial.includes(id))) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await data.updateMyWorker({ feedCategoryIds });
      cue("success", audioCues);
      onSaved(saved);
    } catch (failure) {
      setError(errorText(failure, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={t(...JOB_FEED_QUESTION)} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-soft">{t("جو کام دیکھنے ہیں انہیں چنیں", "Jo kaam dekhne hain unhein chunein", "Tap the kinds of jobs you want")}</p>
        <IconButton icon={Volume2} tone="brand" label={t("سوال سنیں", "Sawal sunein", "Listen to the question")} className="rounded-full" onClick={() => speakUrdu(SPOKEN_QUESTION)} />
      </div>

      <div className="grid auto-rows-fr grid-cols-2 gap-2">
        {categories.map((category) => {
          const on = selected.includes(category.id);
          return (
            <button key={category.id} type="button" aria-pressed={on} onClick={() => toggle(category.id)} className={cx("relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border-2 px-2 py-3 text-center transition active:scale-[0.97]", on ? "border-brand-600 bg-brand-50" : "border-line bg-surface")}>
              <span className={cx("absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface")} aria-hidden>
                {on && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <span className={cx("flex h-12 w-12 items-center justify-center rounded-2xl", on ? "bg-brand-100 text-brand-700" : "bg-sunken text-soft")}>
                <CategoryIcon name={category.icon} className="h-7 w-7" />
              </span>
              <span className="font-bold">{categoryName(category, lang)}</span>
              {worker.categoryIds.includes(category.id) && <Tag>{t("آپ کا شعبہ", "Aap ka shoba", "Your trade")}</Tag>}
            </button>
          );
        })}
      </div>

      {/* The sheet's bottom padding can leave a strip under a stuck footer, so the footer paints over it. */}
      <div className="sticky bottom-0 -mx-5 mt-3 border-t border-line bg-surface px-5 pb-1 pt-3 after:absolute after:inset-x-0 after:top-full after:h-8 after:bg-surface">
        {needOne && (
          <p role="status" className="mb-2 animate-rise rounded-2xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">
            {t("کم از کم ایک کام چنا رہنا چاہیے، ورنہ آپ کو کوئی کام نظر نہیں آئے گا۔", "Kam az kam aik kaam chuna rehna chahiye, warna aap ko koi kaam nazar nahi aayega.", "Keep at least one selected, or you would not see any jobs.")}
          </p>
        )}
        {error && (
          <div className="mb-2">
            <InlineError>{error}</InlineError>
          </div>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="secondary" size="xl" onClick={onClose}>
            {t("واپس", "Wapas", "Back")}
          </Button>
          <Button size="xl" icon={Check} disabled={saving} onClick={() => void save()}>
            {t("محفوظ کریں", "Mehfooz karein", "Save")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
