import type { DataApi } from "../api";
import { ApiError } from "../errors";
import type { CustomerDraft, OnboardField, ProblemAnalysis, WorkerProfileDraft } from "../types";
import { AI_TIMEOUT_MS, audioForm, request, requestBlob } from "./http";

const nothingHeard = () => new ApiError("NOTHING_HEARD", "No speech was heard in that recording.");

const readDraft = (form: FormData) => request<WorkerProfileDraft>("POST", "/ai/onboard", { form, timeoutMs: AI_TIMEOUT_MS });

/** The answer to one question, as text for that field. Empty when the model could not find it. */
function fieldValue(field: OnboardField, draft: WorkerProfileDraft): string {
  switch (field) {
    case "name":
      return draft.name ?? "";
    case "years":
      return draft.years === null ? "" : String(draft.years);
    case "rate":
      return draft.rate === null ? "" : String(draft.rate);
    case "area":
      return draft.area ?? "";
    case "workingHours":
      return draft.workingHours ?? "";
    case "skills":
      return draft.skills.join("، ");
    case "trade":
      return draft.transcript;
  }
}

export const aiApi: Pick<DataApi, "transcribeOnboarding" | "transcribeField" | "transcribeCustomer" | "analyzeProblem" | "readBackLine" | "speak" | "placeNear" | "findPlace"> = {
  speak: (text) => requestBlob("/ai/speak", { text }),
  placeNear: async ({ lat, lng }) => (await request<{ name: string }>("GET", `/places/near?lat=${lat}&lng=${lng}`)).name,
  findPlace: async (text) => (await request<{ place: { lat: number; lng: number; listed: boolean } | null }>("GET", `/places/find?q=${encodeURIComponent(text)}`)).place,

  transcribeOnboarding: async (audio, field) => {
    const draft = await readDraft(audioForm(audio, field ? { field } : {}));
    if (!draft.transcript.trim()) throw nothingHeard();
    return draft;
  },

  transcribeField: async (field, audio) => {
    const value = fieldValue(field, await readDraft(audioForm(audio, { field })));
    if (!value.trim()) throw nothingHeard();
    return value;
  },

  transcribeCustomer: async (audio) => {
    const draft = await request<CustomerDraft>("POST", "/ai/customer", { form: audioForm(audio), timeoutMs: AI_TIMEOUT_MS });
    if (!draft.transcript.trim()) throw nothingHeard();
    return { name: draft.name ?? "", area: draft.area ?? "", address: draft.address ?? "", transcript: draft.transcript };
  },

  analyzeProblem: (input) => {
    const text = input.text?.trim();
    if (!input.audio && !input.image) return request<ProblemAnalysis>("POST", "/ai/problem", { body: { text }, timeoutMs: AI_TIMEOUT_MS });
    const form = new FormData();
    if (text) form.append("text", text);
    if (input.audio) form.append("audio", input.audio, "voice.webm");
    if (input.image) form.append("image", input.image, "photo.jpg");
    return request<ProblemAnalysis>("POST", "/ai/problem", { form, timeoutMs: AI_TIMEOUT_MS });
  },

  readBackLine: async (draft) => (await request<{ text: string }>("POST", "/ai/tts-text", { body: { draft } })).text,
};
