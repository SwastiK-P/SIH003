import { app } from "./app.js";

const port = Number(process.env.API_PORT ?? 4100);
app.listen(port, () => console.log(`APAAR registry API on http://localhost:${port}`));
