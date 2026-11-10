import { ArrowDown, ArrowUp, Check, Pencil, Plus, Sparkles, Tags } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { data, type Category, type CategoryInput } from "../../data";
import { errorText } from "../../data/errors";
import { categoryName } from "../../data/labels";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { toLatinDigits } from "../../lib/validate";
import { Async } from "../../ui/async";
import { CATEGORY_ICONS, CategoryIcon, iconKey } from "../../ui/CategoryIcon";
import { AiTag, Auto, Button, Card, EmptyState, Field, IconButton, InlineError, ListSkeleton, Switch, Tag, cx } from "../../ui/primitives";
import { AdminShell } from "./AdminShell";
import { AdminPanel, Latin, Money, Spinner, useFlash } from "./parts";

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

const MAX_WORDS = 300;
const MAX_WORD_LENGTH = 80;

const splitList = (text: string) => [...new Set(text.split(/[,،\n]/).map((part) => part.trim()).filter(Boolean))];
const withoutIds = ({ id: _id, sortOrder: _sortOrder, ...input }: Category): CategoryInput => input;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function WordsField({ id, label, hint, value, onChange, error }: { id: string; label: string; hint: string; value: string; onChange: (next: string) => void; error?: string }) {
  const { t } = useSettings();
  const count = splitList(value).length;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <textarea id={id} rows={3} dir="auto" className="field resize-y" value={value} onChange={(event) => onChange(event.target.value)} />
      <p className="mt-1 text-sm text-soft">
        <Latin className="font-bold">{count}</Latin> {t("الفاظ", "alfaaz", count === 1 ? "word" : "words")}
      </p>
    </Field>
  );
}

function CategoryForm({ initial, id, others, onClose, onSaved }: { initial: CategoryInput; id?: string; others: Category[]; onClose: () => void; onSaved: (saved: Category) => void }) {
  const { t, lang } = useSettings();
  const [form, setForm] = useState(initial);
  const [floor, setFloor] = useState(String(initial.floorPrice));
  const [step, setStep] = useState(String(initial.step));
  const [keywords, setKeywords] = useState(initial.keywords.join("، "));
  const [skills, setSkills] = useState(initial.skills.join("، "));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const patch = (next: Partial<CategoryInput>) => setForm((current) => ({ ...current, ...next }));
  const floorNumber = Number(toLatinDigits(floor));
  const stepNumber = Number(toLatinDigits(step));

  const save = async () => {
    const next: Record<string, string> = {};
    const required = t("یہ ضروری ہے", "Ye zaroori hai", "This is required");
    if (!form.nameUr.trim()) next.nameUr = required;
    if (!form.nameRoman.trim()) next.nameRoman = required;
    if (!form.nameEn.trim()) next.nameEn = required;
    const taken = t("اس نام کا شعبہ پہلے سے ہے", "Is naam ka shoba pehle se hai", "A category with this name already exists");
    if (!next.nameRoman && others.some((c) => sameName(c.nameRoman, form.nameRoman))) next.nameRoman = taken;
    if (!next.nameEn && others.some((c) => sameName(c.nameEn, form.nameEn))) next.nameEn = taken;
    if (floor.trim() === "" || !Number.isInteger(floorNumber) || floorNumber < 0) next.floorPrice = t("0 یا زیادہ لکھیں", "0 ya zyada likhein", "Enter 0 or more");
    if (step.trim() === "" || !Number.isInteger(stepNumber) || stepNumber <= 0) next.step = t("0 سے زیادہ لکھیں", "0 se zyada likhein", "Enter more than 0");
    const words = splitList(keywords);
    const skillList = splitList(skills);
    const tooMany = t("فہرست بہت لمبی ہے", "Fehrist bohat lambi hai", "This list is too long");
    if (words.length > MAX_WORDS || words.some((word) => word.length > MAX_WORD_LENGTH)) next.keywords = tooMany;
    if (skillList.length > MAX_WORDS || skillList.some((word) => word.length > MAX_WORD_LENGTH)) next.skills = tooMany;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setFailure(null);
    try {
      const saved = await data.saveCategory({ ...form, nameUr: form.nameUr.trim(), nameRoman: form.nameRoman.trim(), nameEn: form.nameEn.trim(), floorPrice: floorNumber, step: stepNumber, keywords: words, skills: skillList }, id);
      onSaved(saved);
    } catch (err) {
      setFailure(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  const previewName = lang === "ur" ? form.nameUr : lang === "roman" ? form.nameRoman : form.nameEn;

  return (
    <AdminPanel
      title={id ? t("شعبہ بدلیں", "Shoba badlein", "Edit category") : t("نیا شعبہ", "Naya shoba", "New category")}
      onClose={onClose}
      footer={
        <Button className="w-full" icon={saving ? Spinner : Check} disabled={saving} onClick={() => void save()}>
          {t("محفوظ کریں", "Mehfooz karein", "Save category")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-sm text-soft">{t("گاہک کو ایسا نظر آئے گا", "Gahak ko aisa nazar aayega", "Customers will see")}</p>
          <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 font-semibold text-soft">
            <CategoryIcon name={form.icon} className="h-5 w-5" />
            {previewName.trim() ? <Auto text={previewName} /> : <span className="text-faint">{t("نام لکھیں", "Naam likhein", "Type a name")}</span>}
          </span>
        </div>

        <Field label={t("اردو نام", "Urdu naam", "Urdu name")} htmlFor="cat-ur" error={errors.nameUr}>
          <input id="cat-ur" dir="rtl" className="field ur" value={form.nameUr} onChange={(event) => patch({ nameUr: event.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("رومن نام", "Roman naam", "Roman Urdu name")} htmlFor="cat-roman" error={errors.nameRoman}>
            <input id="cat-roman" dir="ltr" className="field latin" value={form.nameRoman} onChange={(event) => patch({ nameRoman: event.target.value })} />
          </Field>
          <Field label={t("انگریزی نام", "English naam", "English name")} htmlFor="cat-en" error={errors.nameEn}>
            <input id="cat-en" dir="ltr" className="field latin" value={form.nameEn} onChange={(event) => patch({ nameEn: event.target.value })} />
          </Field>
        </div>

        <Field label={t("آئیکن", "Icon", "Icon")}>
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-7">
            {Object.keys(CATEGORY_ICONS).map((name) => (
              <button key={name} type="button" aria-label={name} aria-pressed={iconKey(form.icon) === name} onClick={() => patch({ icon: name })} className={cx("flex h-12 items-center justify-center rounded-xl border transition active:scale-95", iconKey(form.icon) === name ? "border-brand-600 bg-brand-100 text-brand-700" : "border-line bg-surface text-soft")}>
                <CategoryIcon name={name} className="h-6 w-6" />
              </button>
            ))}
          </div>
        </Field>

        <WordsField id="cat-keywords" label={t("Jev کے الفاظ", "Jev ke alfaaz", "Jev keywords")} hint={t("کوما سے الگ کریں، کسی بھی لکھائی میں: maasi، کام والی، maid", "Comma se alag karein, kisi bhi likhai mein: maasi, kaam wali, ماسی", "Comma separated, in any script: maasi, kaam wali, ماسی")} value={keywords} onChange={setKeywords} error={errors.keywords} />
        <WordsField id="cat-skills" label={t("ہنر", "Hunar", "Skills")} hint={t("کوما سے الگ کریں: کپڑے دھونا، صفائی", "Comma se alag karein: kapray dhona, safai", "Comma separated: laundry, cleaning")} value={skills} onChange={setSkills} error={errors.skills} />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("کم از کم فی دن", "Kam az kam fi din", "Floor per day (Rs)")} htmlFor="cat-floor" error={errors.floorPrice}>
            <input id="cat-floor" inputMode="numeric" dir="ltr" className="field latin" value={floor} onChange={(event) => setFloor(event.target.value)} />
          </Field>
          <Field label={t("بھاؤ کا قدم", "Bhao ka qadam", "Bargain step (Rs)")} htmlFor="cat-step" error={errors.step}>
            <input id="cat-step" inputMode="numeric" dir="ltr" className="field latin" value={step} onChange={(event) => setStep(event.target.value)} />
          </Field>
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line">
          <div className="flex items-center justify-between gap-2 ps-4">
            <span className="min-w-0 font-bold">{t("ٹیم کا کام ہو سکتا ہے", "Crew ka kaam ho sakta hai", "Crew jobs allowed")}</span>
            <Switch checked={form.crewAllowed} onChange={(crewAllowed) => patch({ crewAllowed })} label={t("ٹیم کا کام", "Crew ka kaam", "Crew jobs allowed")} />
          </div>
          <div className="flex items-center justify-between gap-2 ps-4">
            <span className="min-w-0 font-bold">{t("چالو ہے", "Chalu hai", "Active")}</span>
            <Switch checked={form.active} onChange={(active) => patch({ active })} label={t("چالو", "Chalu", "Active")} />
          </div>
        </div>

        {failure && <InlineError>{failure}</InlineError>}
      </div>
    </AdminPanel>
  );
}

/** Runs the real matcher, so an admin can check a new word right after saving it. Jev only, so no AI call. */
function TryJev({ refreshKey }: { refreshKey: unknown }) {
  const { t, lang } = useSettings();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ state: "idle" | "loading" } | { state: "done"; category: Category | null } | { state: "failed"; message: string }>({ state: "idle" });

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) {
      setResult({ state: "idle" });
      return;
    }
    let current = true;
    setResult({ state: "loading" });
    const timer = window.setTimeout(() => {
      data
        .matchTrade(query)
        .then((category) => {
          if (current) setResult({ state: "done", category });
        })
        .catch((err: unknown) => {
          if (current) setResult({ state: "failed", message: errorText(err, t) });
        });
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
    // t only changes with the language, and that should not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, refreshKey]);

  return (
    <Card className="min-w-0">
      <div className="grid items-center gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base">{t("Jev آزمائیں", "Jev azmayein", "Try Jev")}</h2>
            <AiTag label="Jev" icon={Sparkles} />
          </div>
          <p className="text-sm text-soft">{t("کوئی جملہ لکھیں اور دیکھیں کون سا شعبہ ملتا ہے", "Koi jumla likhein aur dekhein kaun sa shoba milta hai", "Type what a customer might say and see which trade it finds")}</p>
        </div>
        <input dir="auto" className="field" aria-label={t("Jev آزمائیں", "Jev azmayein", "Try Jev")} placeholder={t("مثلاً: پنکھا خراب ہے", "Maslan: pankha kharab hai", "For example: ceiling fan not working")} value={text} onChange={(event) => setText(event.target.value)} />
        <div className="flex min-h-12 items-center" role="status">
          {result.state === "loading" && <Spinner className="h-5 w-5 text-soft" aria-hidden />}
          {result.state === "failed" && <InlineError>{result.message}</InlineError>}
          {result.state === "done" &&
            (result.category ? (
              <span className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-100 px-4 font-bold text-brand-700">
                <CategoryIcon name={result.category.icon} className="h-5 w-5" />
                {categoryName(result.category, lang)}
              </span>
            ) : (
              <span className="font-semibold text-soft">{t("Jev کو کوئی شعبہ نہیں ملا", "Jev ko koi shoba nahi mila", "Jev found no matching trade")}</span>
            ))}
        </div>
      </div>
    </Card>
  );
}

export function AdminCategories() {
  const { t, lang } = useSettings();
  const loaded = useData(() => data.listCategories({ all: true }), [], { reloadOn: ["categories.changed"] });
  const [editing, setEditing] = useState<{ category?: Category; initial: CategoryInput } | null>(null);
  const [order, setOrder] = useState<Category[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const { flash, flashNode } = useFlash();

  // Taps can come faster than saves. Saves run one at a time and only the newest order is sent.
  const queuedOrder = useRef<string[] | null>(null);
  const orderSaving = useRef(false);

  useEffect(() => {
    if (loaded.data && !orderSaving.current && !queuedOrder.current) setOrder(loaded.data);
  }, [loaded.data]);

  const saveOrder = async () => {
    if (orderSaving.current) return;
    orderSaving.current = true;
    setSavingOrder(true);
    try {
      while (queuedOrder.current) {
        const ids = queuedOrder.current;
        queuedOrder.current = null;
        await data.reorderCategories(ids);
      }
    } catch (err) {
      queuedOrder.current = null;
      setFailure(errorText(err, t));
    } finally {
      orderSaving.current = false;
      setSavingOrder(false);
      loaded.reload();
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    setFailure(null);
    const next = [...order];
    const target = index + direction;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setOrder(next);
    queuedOrder.current = next.map((category) => category.id);
    void saveOrder();
  };

  /** Flip at once and put it back if the save fails. */
  const toggle = (category: Category, patch: Partial<CategoryInput>) => {
    setFailure(null);
    setOrder((current) => current.map((c) => (c.id === category.id ? { ...c, ...patch } : c)));
    data.saveCategory({ ...withoutIds(category), ...patch }, category.id).catch((err: unknown) => {
      setOrder((current) => current.map((c) => (c.id === category.id ? category : c)));
      setFailure(errorText(err, t));
    });
  };

  const edit = (category: Category) => setEditing({ category, initial: withoutIds(category) });

  const names = (category: Category) => (
    <>
      <span className="block break-words font-bold">{categoryName(category, lang)}</span>
      <span className="block break-words text-sm text-soft">
        <span className={lang === "ur" ? "latin" : "ur"}>{lang === "ur" ? category.nameEn : category.nameUr}</span>
        {lang === "ur" ? <span className="latin"> · {category.nameRoman}</span> : lang === "roman" ? <span className="latin"> · {category.nameEn}</span> : <span className="latin"> · {category.nameRoman}</span>}
      </span>
    </>
  );

  const arrows = (index: number, name: string) => (
    <div className="flex shrink-0">
      <IconButton icon={ArrowUp} label={t(`${name} اوپر`, `${name} upar`, `Move ${name} up`)} disabled={index === 0} onClick={() => move(index, -1)} />
      <IconButton icon={ArrowDown} label={t(`${name} نیچے`, `${name} neeche`, `Move ${name} down`)} disabled={index === order.length - 1} onClick={() => move(index, 1)} />
    </div>
  );

  const crewLabel = t("ٹیم", "Crew", "Crew");
  const activeLabel = t("چالو", "Chalu", "Active");

  return (
    <AdminShell
      title={t("شعبے", "Shobay", "Categories")}
      subtitle={t("تبدیلی فوراً سائن اپ، تلاش، نقشے اور میچنگ میں آ جاتی ہے", "Tabdeeli foran sign up, talaash, naqshay aur matching mein aa jati hai", "Changes reach sign-up, search, map filters and matching at once, with no redeploy")}
      action={
        <Button size="md" icon={Plus} onClick={() => setEditing({ initial: BLANK })}>
          {t("نیا شعبہ", "Naya shoba", "New category")}
        </Button>
      }
    >
      <div className="space-y-3">
        <TryJev refreshKey={loaded.data} />
        {failure && <InlineError>{failure}</InlineError>}

        <Async query={loaded} skeleton={<ListSkeleton rows={5} />}>
          {() =>
            order.length === 0 ? (
              <EmptyState icon={Tags} title={t("ابھی کوئی شعبہ نہیں", "Abhi koi shoba nahi", "No categories yet")} body={t("پہلا شعبہ شامل کریں", "Pehla shoba shamil karein", "Add the first trade to get started")} />
            ) : (
              <>
                {/* Phones: a stacked row each. */}
                <Card className="divide-y divide-line overflow-hidden p-0 lg:hidden">
                  {order.map((category, index) => (
                    <div key={category.id} className={cx("p-3", !category.active && "bg-sunken/60")}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                          <CategoryIcon name={category.icon} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">{names(category)}</div>
                        <IconButton icon={Pencil} label={t(`${category.nameEn} بدلیں`, `${category.nameEn} badlein`, `Edit ${category.nameEn}`)} onClick={() => edit(category)} />
                      </div>
                      <p className="mt-1 text-sm text-soft">
                        <Money value={category.floorPrice} className="font-bold text-ink" /> · <Latin>± {category.step}</Latin> · <Latin>{category.keywords.length}</Latin> {t("الفاظ", "alfaaz", "keywords")} · <Latin>{category.skills.length}</Latin> {t("ہنر", "hunar", "skills")}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        {arrows(index, category.nameEn)}
                        <div className="flex items-center">
                          <span className="text-sm font-bold text-soft">{crewLabel}</span>
                          <Switch checked={category.crewAllowed} onChange={(crewAllowed) => toggle(category, { crewAllowed })} label={`${category.nameEn} ${crewLabel}`} />
                          <span className="text-sm font-bold text-soft">{activeLabel}</span>
                          <Switch checked={category.active} onChange={(active) => toggle(category, { active })} label={`${category.nameEn} ${activeLabel}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>

                {/* Wide screens: a real table. */}
                <Card className="hidden overflow-hidden p-0 lg:block">
                  <table className="w-full border-collapse text-start">
                    <thead>
                      <tr className="border-b border-line text-sm font-bold text-soft">
                        <th className="w-28 px-3 py-2 text-start font-bold">{t("ترتیب", "Tarteeb", "Order")}</th>
                        <th className="px-3 py-2 text-start font-bold">{t("شعبہ", "Shoba", "Trade")}</th>
                        <th className="px-3 py-2 text-start font-bold">{t("کم از کم", "Kam az kam", "Floor")}</th>
                        <th className="px-3 py-2 text-start font-bold">{t("قدم", "Qadam", "Step")}</th>
                        <th className="px-3 py-2 text-start font-bold">{t("الفاظ / ہنر", "Alfaaz / hunar", "Words / skills")}</th>
                        <th className="w-20 px-3 py-2 text-center font-bold">{crewLabel}</th>
                        <th className="w-20 px-3 py-2 text-center font-bold">{activeLabel}</th>
                        <th className="w-14 px-1 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {order.map((category, index) => (
                        <tr key={category.id} className={cx(!category.active && "bg-sunken/60")}>
                          <td className="px-1 py-1">{arrows(index, category.nameEn)}</td>
                          <td className="px-3 py-1">
                            <div className="flex items-center gap-3">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-brand-700">
                                <CategoryIcon name={category.icon} className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">{names(category)}</div>
                              {!category.active && <Tag tone="plain">{t("بند", "Band", "Disabled")}</Tag>}
                            </div>
                          </td>
                          <td className="px-3 py-1 font-bold">
                            <Money value={category.floorPrice} />
                          </td>
                          <td className="px-3 py-1">
                            <Latin>± {category.step}</Latin>
                          </td>
                          <td className="px-3 py-1 text-soft">
                            <Latin>{category.keywords.length} / {category.skills.length}</Latin>
                          </td>
                          <td className="px-3 py-1">
                            <div className="flex justify-center">
                              <Switch checked={category.crewAllowed} onChange={(crewAllowed) => toggle(category, { crewAllowed })} label={`${category.nameEn} ${crewLabel}`} />
                            </div>
                          </td>
                          <td className="px-3 py-1">
                            <div className="flex justify-center">
                              <Switch checked={category.active} onChange={(active) => toggle(category, { active })} label={`${category.nameEn} ${activeLabel}`} />
                            </div>
                          </td>
                          <td className="px-1 py-1">
                            <IconButton icon={Pencil} label={t(`${category.nameEn} بدلیں`, `${category.nameEn} badlein`, `Edit ${category.nameEn}`)} onClick={() => edit(category)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <p className="text-sm text-soft" role="status">
                  {savingOrder ? t("ترتیب محفوظ ہو رہی ہے", "Tarteeb mehfooz ho rahi hai", "Saving the new order") : t("بند شعبہ سائن اپ اور تلاش سے ہٹ جاتا ہے، پرانا کام اور کاریگر محفوظ رہتے ہیں۔", "Band shoba sign up aur talaash se hat jata hai, purana kaam aur kaarigar mehfooz rehte hain.", "A disabled trade leaves sign-up and search. Past jobs and workers are kept.")}
                </p>
              </>
            )
          }
        </Async>
      </div>

      {editing && (
        <CategoryForm
          initial={editing.initial}
          id={editing.category?.id}
          others={order.filter((category) => category.id !== editing.category?.id)}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            loaded.reload();
            flash(t(`${saved.nameUr} محفوظ ہو گیا`, `${saved.nameRoman} mehfooz ho gaya`, `${saved.nameEn} saved`));
          }}
        />
      )}
      {flashNode}
    </AdminShell>
  );
}
