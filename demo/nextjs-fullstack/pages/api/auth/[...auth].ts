/**
 * Catch-all API route for awesome-node-auth — handles all auth endpoints.
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * POST /api/auth/refresh
 * GET  /api/auth/me
 * …and more (see awesome-node-auth docs)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth, registerUser } from '../../../lib/auth';

// Let awesome-node-auth's Express middleware parse the body
export const config = { api: { bodyParser: false } };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const router = getAuth().router({
    onRegister: registerUser,
  });

  // Strip /api/auth prefix so the inner router sees paths starting from /
  req.url = req.url!.replace(/^\/api\/auth/, '') || '/';

  // Next.js req/res are compatible with Express but have slightly different types.
  // The `as any` cast is the standard way to bridge the two — used throughout
  // the Next.js ecosystem and in the awesome-node-auth example files.
  router(req as any, res as any, () => res.status(404).json({ error: 'Not found' }));
}
