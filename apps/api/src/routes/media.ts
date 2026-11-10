import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { forbidden } from "../errors";
import { AUDIO_FILE_NAME } from "../media";
import { audioLinkValid, uploadRoot } from "../uploads";

const Params = z.object({ name: z.string() });
const Query = z.object({ exp: z.coerce.number().int(), sig: z.string() });

export async function mediaRoutes(app: FastifyInstance) {
  /**
   * Voice notes from private chats. An <audio> tag cannot send a token, so the API hands out links
   * only to people entitled to the message, and each link stops working after an hour.
   */
  app.get("/media/audio/:name", async (req, reply) => {
    const { name } = Params.parse(req.params);
    const { exp, sig } = Query.parse(req.query);
    if (!AUDIO_FILE_NAME.test(name) || !audioLinkValid(name, exp, sig)) throw forbidden("This link has expired.");
    return reply.sendFile(name, uploadRoot);
  });
}
