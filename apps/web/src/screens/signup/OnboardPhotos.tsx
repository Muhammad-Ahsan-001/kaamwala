import { Camera, Check, IdCard, Image as ImageIcon, ShieldCheck, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { data } from "../../data";
import { errorCode } from "../../data/errors";
import { cue } from "../../lib/audio";
import { compressImage } from "../../lib/images";
import { useData } from "../../lib/useData";
import { useSettings } from "../../lib/settings";
import { Async } from "../../ui/async";
import { Button, Card, InlineError } from "../../ui/primitives";
import { Headline, Screen } from "../../ui/shell";
import { draftProblems, useDraft } from "./draft";
import { AgentBanner, AgentFeeCard, SelfSignupFree } from "./parts";

function PhotoTile({ icon: Icon, label, onPick }: { icon: LucideIcon; label: string; onPick: (file: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
    onPick(file);
  };

  return (
    <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-faint bg-surface p-1 text-center text-sm font-semibold text-soft">
      {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <Icon className="h-7 w-7 text-brand-600" aria-hidden />}
      {!preview && <span>{label}</span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={label} onChange={pick} />
    </label>
  );
}

export function OnboardPhotos() {
  const { t, audioCues } = useSettings();
  const navigate = useNavigate();
  const { worker, agentFor, setAgentFor, resetWorker } = useDraft();
  const settings = useData(() => data.getPublicSettings(), []);
  const [cnic, setCnic] = useState<File | null>(null);
  const [profile, setProfile] = useState<File | null>(null);
  const [work, setWork] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (draftProblems(worker).length > 0) return <Navigate to="/app/onboard" replace />;

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await data.createWorker({
        name: worker.name.trim(),
        categoryIds: worker.categoryIds,
        trade: worker.tradeText.trim() || undefined,
        skills: worker.skills,
        years: worker.years ? Number(worker.years) : null,
        rate: worker.rate ? Number(worker.rate) : null,
        area: worker.area.trim(),
        workingHours: worker.workingHours.trim() || null,
        forPhone: agentFor?.phone,
      });
      if (cnic) await data.uploadCnic(await compressImage(cnic));
      if (profile) await data.uploadPhoto("profile", await compressImage(profile));
      if (work) await data.uploadPhoto("work", await compressImage(work));
      cue("success", audioCues);
      resetWorker();
      if (agentFor) {
        setAgentFor(null);
        navigate("/app/agent/new?done=1");
      } else {
        navigate("/app/worker");
      }
    } catch (err) {
      const code = errorCode(err);
      if (code === "TRADE_NOT_RECOGNISED") {
        navigate("/app/onboard/type?problem=trade");
        return;
      }
      setError(
        code === "CNIC_DUPLICATE"
          ? t("یہ شناختی کارڈ پہلے سے رجسٹر ہے۔", "Ye CNIC pehle se registered hai.", "This CNIC is already registered.")
          : t("محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔", "Mehfooz nahi ho saka. Dobara koshish karein.", "Could not save. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      back="/app/onboard"
      steps={{ total: 3, current: 3 }}
      speak="تصویریں لگانا اختیاری ہے۔"
      footer={
        <Button className="w-full" size="xl" icon={Check} disabled={saving} onClick={() => void finish()}>
          {agentFor ? t("تصدیق کریں اور بنائیں", "Tasdeeq karein aur banayein", "Confirm and create") : t("پروفائل بنائیں", "Profile banayein", "Create my profile")}
        </Button>
      }
    >
      <AgentBanner />
      <Headline ur="تصویریں لگائیں" roman="Ye sab ikhtiyari hai" en="Add photos" />
      <div className="mt-1">
        <SelfSignupFree />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <PhotoTile icon={IdCard} label={t("شناختی کارڈ", "CNIC", "CNIC")} onPick={setCnic} />
        <PhotoTile icon={Camera} label={t("آپ کی تصویر", "Aapki tasveer", "Your photo")} onPick={setProfile} />
        <PhotoTile icon={ImageIcon} label={t("پرانا کام", "Pichla kaam", "Past work")} onPick={setWork} />
      </div>

      <Card className="mt-3 flex gap-2 bg-sunken">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
        <p className="text-sm text-soft">
          {t(
            "شناختی کارڈ سے صرف ایک ہی شخص کے دو اکاؤنٹ روکے جاتے ہیں۔ نمبر خفیہ شکل میں رکھا جاتا ہے۔ یہ سرکاری تصدیق نہیں ہے۔",
            "CNIC se sirf duplicate account roke jate hain. Number hash ki shakal mein rehta hai. Ye sarkari tasdeeq nahi hai.",
            "The CNIC is used only to stop duplicate accounts. Only a salted hash is stored. This is not government verification.",
          )}
        </p>
      </Card>

      {agentFor && (
        <div className="mt-3">
          <Async query={settings}>{(value) => <AgentFeeCard settings={value} />}</Async>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      )}
    </Screen>
  );
}
