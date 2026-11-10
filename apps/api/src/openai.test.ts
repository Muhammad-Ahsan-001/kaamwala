import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://unit:test@localhost:1/none";
  process.env.JWT_SECRET = "unit-test-secret-unit-test-secret";
  process.env.CNIC_SALT = "unit-test-salt-unit-test-salt-00";
  process.env.OPENAI_API_KEY = "sk-unit-test";
  process.env.OPENAI_MODEL = "chat-a";
  process.env.OPENAI_FALLBACK_MODELS = "chat-b";
  process.env.OPENAI_TRANSCRIBE_MODEL = "speech-a";
  process.env.OPENAI_TRANSCRIBE_FALLBACK_MODELS = "whisper-1";
  process.env.OPENAI_REASONING_EFFORT = "";
});

import { Type, type Schema } from "@google/genai";
import { generateWithOpenAi, toJsonSchema } from "./openai";

const audio = { inlineData: { mimeType: "audio/webm", data: Buffer.from("voice").toString("base64") } };
const jpeg = { inlineData: { mimeType: "image/jpeg", data: "abc" } };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const chat = (content: unknown) => reply({ choices: [{ message: { content: JSON.stringify(content) } }] });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const transcriptSchema: Schema = {
  type: Type.OBJECT,
  properties: { transcript: { type: Type.STRING } },
  required: ["transcript"],
};
const transcriptOnly = z.object({ transcript: z.string() });

const profileSchema: Schema = {
  type: Type.OBJECT,
  properties: { transcript: { type: Type.STRING }, name: { type: Type.STRING, nullable: true } },
  required: ["transcript"],
};
const profile = z.object({ transcript: z.string(), name: z.string().nullable() });

afterEach(() => vi.unstubAllGlobals());

describe("toJsonSchema", () => {
  it("lists every property as required, forbids extras and makes optional fields nullable", () => {
    const result = toJsonSchema({
      type: Type.OBJECT,
      properties: {
        a: { type: Type.STRING },
        b: { type: Type.INTEGER },
        c: { type: Type.ARRAY, items: { type: Type.STRING } },
        d: { type: Type.STRING, enum: ["x", "y"] },
      },
      required: ["a", "c", "d"],
    });
    expect(result).toEqual({
      type: "object",
      required: ["a", "b", "c", "d"],
      additionalProperties: false,
      properties: {
        a: { type: "string" },
        b: { type: ["integer", "null"] },
        c: { type: "array", items: { type: "string" } },
        d: { type: "string", enum: ["x", "y"] },
      },
    });
  });
});

describe("generateWithOpenAi", () => {
  it("transcribes a voice note in one call, with a file name the API can read", async () => {
    const fetchMock = mockFetch(reply({ text: "  پنکھا خراب ہے " }));
    const result = await generateWithOpenAi([audio, { text: "rules" }], transcriptSchema, transcriptOnly);
    expect(result).toEqual({ transcript: "پنکھا خراب ہے" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/audio/transcriptions");
    const form = init.body as FormData;
    expect((form.get("file") as File).name).toBe("speech.webm");
    expect(form.get("language")).toBe("ur");
    expect(form.get("model")).toBe("speech-a");
    expect(form.get("chunking_strategy")).toBe("auto");
    expect(form.get("prompt")).toBeTruthy();
  });

  it("retries on the next speech model when the words come back in Hindi script", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockFetch(reply({ text: "पंखा खराब है" }), reply({ text: "پنکھا خراب ہے" }));
    const result = await generateWithOpenAi([audio], transcriptSchema, transcriptOnly);
    expect(result).toEqual({ transcript: "پنکھا خراب ہے" });
    const retry = fetchMock.mock.calls[1]![1].body as FormData;
    expect(retry.get("model")).toBe("whisper-1");
    expect(retry.has("chunking_strategy")).toBe(false);
    warn.mockRestore();
  });

  it.each([
    ["another language invented from noise", "我是外星人。"],
    ["the hint echoed back", "یہ اردو زبان میں گفتگو ہے۔"],
    ["the hint echoed twice", "یہ اردو زبان میں گفتگو ہے۔ یہ اردو زبان میں گفتگو ہے۔"],
    ["the hint reworded", "یہ اردو زبان میں گفتگو ہے۔ یہ جملہ اردو زبان میں ہے۔"],
  ])("never returns %s, and asks the next model instead", async (_label, text) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockFetch(reply({ text }), reply({ text: "میرا نام علی ہے" }));
    await expect(generateWithOpenAi([audio], transcriptSchema, transcriptOnly)).resolves.toEqual({ transcript: "میرا نام علی ہے" });
    const retry = fetchMock.mock.calls[1]![1].body as FormData;
    expect(retry.get("model")).toBe("whisper-1");
    expect(retry.has("prompt")).toBe(false);
    warn.mockRestore();
  });

  it("treats a result with no letters as silence", async () => {
    mockFetch(reply({ text: "۔۔۔۔۔۔" }));
    await expect(generateWithOpenAi([audio], transcriptSchema, transcriptOnly)).resolves.toEqual({ transcript: "" });
  });

  it("does not return a Hindi-script transcript when every speech model gives one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockFetch(reply({ text: "पंखा" }), reply({ text: "पंखा" }));
    await expect(generateWithOpenAi([audio], transcriptSchema, transcriptOnly)).rejects.toThrow();
    warn.mockRestore();
  });

  it("keeps what the speech model heard instead of the chat model's rewording", async () => {
    mockFetch(reply({ text: "میرا نام اسلم ہے" }), chat({ transcript: "reworded", name: "Aslam" }));
    const result = await generateWithOpenAi([audio, { text: "rules" }], profileSchema, profile);
    expect(result).toEqual({ transcript: "میرا نام اسلم ہے", name: "Aslam" });
  });

  it("tells the chat model when the recording had no speech", async () => {
    const fetchMock = mockFetch(reply({ text: "" }), chat({ transcript: "invented", name: null }));
    const result = await generateWithOpenAi([audio, { text: "rules" }], profileSchema, profile);
    expect(result.transcript).toBe("");
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(body.messages[0].content[0].text).toContain("no intelligible speech");
  });

  it("sends images as data URLs with a strict schema and storage off", async () => {
    const fetchMock = mockFetch(chat({ transcript: "x", name: null }));
    await generateWithOpenAi([jpeg, { text: "look" }], profileSchema, profile);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.store).toBe(false);
    expect(body.model).toBe("chat-a");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,abc" } });
    expect(body).not.toHaveProperty("temperature");
  });

  it("sends a PDF as a file content part and keeps storage off", async () => {
    const fetchMock = mockFetch(chat({ transcript: "x", name: null }));
    const pdf = { inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } };
    await generateWithOpenAi([pdf, { text: "read the number" }], profileSchema, profile);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.store).toBe(false);
    expect(body.messages[0].content[0]).toEqual({
      type: "file",
      file: { filename: "document.pdf", file_data: "data:application/pdf;base64,JVBERi0=" },
    });
  });

  it("moves to the next model when the first one fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = mockFetch(reply({ error: { code: "server_error" } }, 500), chat({ transcript: "ok", name: null }));
    const result = await generateWithOpenAi([{ text: "hello" }], profileSchema, profile);
    expect(result.transcript).toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string).model).toBe("chat-b");
    warn.mockRestore();
  });

  it("refuses image types the API cannot read without calling it", async () => {
    const fetchMock = mockFetch();
    const heic = { inlineData: { mimeType: "image/heic", data: "abc" } };
    await expect(generateWithOpenAi([heic], profileSchema, profile)).rejects.toThrow("not supported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when both models refuse or return the wrong shape", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockFetch(reply({ choices: [{ message: { content: null, refusal: "no" } }] }), chat({ wrong: true }));
    await expect(generateWithOpenAi([{ text: "hello" }], profileSchema, profile)).rejects.toThrow();
    warn.mockRestore();
  });
});
