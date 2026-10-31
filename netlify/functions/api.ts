import serverless from "serverless-http";
import { app } from "../../server/src/app.js";

/** The whole Express API as one Netlify Function; /api/* is routed here by netlify.toml. */
export const handler = serverless(app, {
  request(req: { url: string }) { req.url = req.url.replace(/^\/\.netlify\/functions\/api/, "/api"); },
});
