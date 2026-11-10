import type { AppSettings as AppSettingsDto } from "@kaamwala/contracts";
import type { AppSettings } from "@prisma/client";
import { prisma, type Tx } from "../db";

const SETTINGS_ID = 1;

/** The migration inserts the single row. The upsert also covers a database restored without it. */
export function readSettings(client: Tx | typeof prisma = prisma): Promise<AppSettings> {
  return client.appSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} });
}

export async function updateSettings(data: Partial<AppSettingsDto>): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
}

export const toSettings = (s: AppSettings): AppSettingsDto => ({
  agentSignupFee: s.agentSignupFee,
  agentSharePercent: s.agentSharePercent,
});
