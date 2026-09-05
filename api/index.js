// Vercel serverless entrypoint.
// Any request routed here (see vercel.json) is handled by the same
// Express app used for local dev / Render — this is what was missing
// before, which caused every /api/* call in production to fall through
// to the static catch-all route and return HTML/empty body instead of
// JSON (the "Unexpected end of JSON data" error in frontend/api.js).
import app from '../backend/src/index.js';

export default app
