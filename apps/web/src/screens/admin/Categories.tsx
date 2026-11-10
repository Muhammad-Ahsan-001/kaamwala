import { ArrowDown, ArrowUp, Check, Pencil, Plus, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { data, type Category, type CategoryInput } from "../../data";
import { rupees } from "../../data/labels";
import { useData } from "../../lib/useData";
import { Async } from "../../ui/async";
import { CATEGORY_ICONS, CategoryIcon } from "../../ui/CategoryIcon";
import { Button, Card, EmptyState, Field, IconButton, InlineError, ListSkeleton, Sheet, Switch, Tag, cx } from "../../ui/primitives";
import { AdminShell } from "./AdminShell";

const BLANK: CategoryInput = {
  nameUr: "",
  nameRoman: "",
  nameEn: "",
  icon: "wrench",
  keywords: [],
  skills: [],
  floorPrice: 500,
  step: 50,
  crewAllowed: false,
  active: true,
};

const splitList = (text: string) => text.split(/[,،\n]/).map((part) => part.trim()).filter(Boolean);
const withoutIds = ({ id: _id, sortOrder: _sortOrder, ...input }: Category): CategoryInput => input;

function CategoryForm({ initial, id, onClose, onSaved }: { initial: CategoryInput; id?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(initial);
  const [keywords, setKeywords] = useState(initial.keywords.join(", "));
  const [skills, setSkills] = useState(initial.skills.join(", "));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  const patch = (next: Partial<CategoryInput>) => setForm((f) => ({ ...f, ...next }));

  const save = async () => {
    const next: Record<string, string> = {};
    if (!form.nameUr.trim()) next.nameUr = "The Urdu name is required.";
    if (!form.nameRoman.trim()) next.nameRoman = "The Roman Urdu name is required.";
    if (!form.nameEn.trim()) next.nameEn = "The English name is required.";
    if (splitList(keywords).length === 0) next.keywords = "Add at least one keyword so Jev can match this trade.";
    if (!Number.isInteger(form.floorPrice) || form.floorPrice < 0) next.floorPrice = "Enter 0 or more.";
    if (!Number.isInteger(form.step) || form.step <= 0) next.step = "Enter more than 0.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    setFailed(false);
    try {
      await data.saveCategory({ ...form, keywords: splitList(keywords), skills: splitList(skills) }, id);
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={id ? "Edit category" : "New category"} onClose={onClose}>
      <div className="space-y-3" dir="ltr">
        <Field label="Urdu name" htmlFor="cat-ur" error={errors.nameUr}>
          <input id="cat-ur" dir="rtl" className="field ur" value={form.nameUr} onChange={(e) => patch({ nameUr: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Roman Urdu name" htmlFor="cat-roman" error={errors.nameRoman}>
            <input id="cat-roman" className="field" value={form.nameRoman} onChange={(e) => patch({ nameRoman: e.target.value })} />
          </Field>
          <Field label="English name" htmlFor="cat-en" error={errors.nameEn}>
            <input id="cat-en" className="field" value={form.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} />
          </Field>
        </div>

        <Field label="Icon">
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
            {Object.keys(CATEGORY_ICONS).map((name) => (
              <button key={name} type="button" aria-label={name} aria-pressed={form.icon === name} onClick={() => patch({ icon: name })} className={cx("flex h-12 items-center justify-center rounded-xl border transition active:scale-95", form.icon === name ? "border-brand-600 bg-brand-100 text-brand-700" : "border-line bg-surface")}>
                <CategoryIcon name={name} className="h-6 w-6" />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Jev keywords" htmlFor="cat-keywords" hint="Comma separated, in any script: maasi, kaam wali, ماسی" error={errors.keywords}>
          <textarea id="cat-keywords" rows={2} className="field resize-none" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
        <Field label="Skills" htmlFor="cat-skills" hint="Comma separated">
          <textarea id="cat-skills" rows={2} className="field resize-none" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Floor price per day (Rs)" htmlFor="cat-floor" error={errors.floorPrice}>
            <input id="cat-floor" type="number" min={0} inputMode="numeric" className="field" value={form.floorPrice} onChange={(e) => patch({ floorPrice: Number(e.target.value) })} />
          </Field>
          <Field label="Bargaining step (Rs)" htmlFor="cat-step" error={errors.step}>
            <input id="cat-step" type="number" min={1} inputMode="numeric" className="field" value={form.step} onChange={(e) => patch({ step: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-bold">Crew jobs allowed</span>
          <Switch checked={form.crewAllowed} onChange={(crewAllowed) => patch({ crewAllowed })} label="Crew jobs allowed" />
        </div>

        {failed && <InlineError>The category could not be saved.</InlineError>}

        <Button className="w-full" icon={Check} disabled={saving} onClick={() => void save()}>
          Save category
        </Button>
      </div>
    </Sheet>
  );
}

export function AdminCategories() {
  const loaded = useData(() => data.listCategories({ all: true }), []);
  const [editing, setEditing] = useState<{ category?: Category; initial: CategoryInput } | null>(null);
  const [order, setOrder] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loaded.data) setOrder(loaded.data);
  }, [loaded.data]);

  const selected = order.find((c) => c.id === selectedId) ?? order[0];

  const move = (index: number, direction: -1 | 1) => {
    const next = [...order];
    const target = index + direction;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setOrder(next);
    void data.reorderCategories(next.map((c) => c.id));
  };

  /** Flip at once and put it back if the save fails. */
  const toggle = (category: Category, patch: Partial<CategoryInput>) => {
    setFailed(false);
    const previous = order;
    setOrder(order.map((c) => (c.id === category.id ? { ...c, ...patch } : c)));
    data.saveCategory({ ...withoutIds(category), ...patch }, category.id).catch(() => {
      setOrder(previous);
      setFailed(true);
    });
  };

  return (
    <AdminShell
      title="Categories"
      action={
        <Button size="md" icon={Plus} onClick={() => setEditing({ initial: BLANK })}>
          New category
        </Button>
      }
    >
      <p className="mb-3 text-soft">Changes appear in sign-up, search, map filters and matching straight away, with no redeploy.</p>
      {failed && (
        <div className="mb-3">
          <InlineError>That change could not be saved.</InlineError>
        </div>
      )}

      <Async query={loaded} skeleton={<ListSkeleton />}>
        {() =>
          order.length === 0 ? (
            <EmptyState icon={Tags} title="No categories yet" body="Add the first trade to get started." />
          ) : (
            <div className="grid items-start gap-3 lg:grid-cols-[1fr_320px]">
              <Card className="divide-y divide-line p-0">
                {order.map((category, index) => (
                  <div key={category.id} className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 p-2 transition-colors", selected?.id === category.id && "bg-brand-50", !category.active && "opacity-60")}>
                    <button type="button" onClick={() => setSelectedId(category.id)} className="flex min-h-12 min-w-0 flex-1 basis-full items-center gap-2 text-start sm:basis-0">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                        <CategoryIcon name={category.icon} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{category.nameEn}</span>
                        <span className="block truncate text-sm text-soft">
                          {rupees(category.floorPrice)} · ±{category.step} · <span className="ur">{category.nameUr}</span>
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center">
                      <label className="flex items-center text-xs font-bold text-soft">
                        Crew
                        <Switch checked={category.crewAllowed} onChange={(crewAllowed) => toggle(category, { crewAllowed })} label={`${category.nameEn} crew jobs`} />
                      </label>
                      <label className="flex items-center text-xs font-bold text-soft">
                        On
                        <Switch checked={category.active} onChange={(active) => toggle(category, { active })} label={`${category.nameEn} active`} />
                      </label>
                      <IconButton icon={ArrowUp} label={`Move ${category.nameEn} up`} disabled={index === 0} onClick={() => move(index, -1)} />
                      <IconButton icon={ArrowDown} label={`Move ${category.nameEn} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)} />
                    </div>
                  </div>
                ))}
              </Card>

              {selected && (
                <Card className="lg:sticky lg:top-8">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-lg">
                      {selected.nameEn} · <span className="ur font-normal">{selected.nameUr}</span>
                    </h2>
                    <IconButton icon={Pencil} label={`Edit ${selected.nameEn}`} onClick={() => setEditing({ category: selected, initial: withoutIds(selected) })} />
                  </div>
                  <p className="mt-1 text-sm text-soft">Jev keywords (Urdu, Roman, English)</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selected.keywords.length === 0 ? <span className="text-soft">None yet</span> : selected.keywords.map((word) => (
                      <Tag key={word} tone="plain">
                        {word}
                      </Tag>
                    ))}
                  </div>
                  <dl className="m-0 mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-sm text-soft">Floor per day</dt>
                      <dd className="m-0 font-extrabold">{rupees(selected.floorPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-soft">Step</dt>
                      <dd className="m-0 font-extrabold">± {rupees(selected.step)}</dd>
                    </div>
                  </dl>
                </Card>
              )}
            </div>
          )
        }
      </Async>

      {editing && (
        <CategoryForm
          initial={editing.initial}
          id={editing.category?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loaded.reload();
          }}
        />
      )}
    </AdminShell>
  );
}
