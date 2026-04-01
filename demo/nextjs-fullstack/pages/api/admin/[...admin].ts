/**
 * Admin panel catch-all route.
 * GET /api/admin  → HTML admin UI  (first user auto-granted access)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminRouter } from '../../../lib/auth';

export const config = { api: { bodyParser: false } };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const adminRouter = getAdminRouter();
  req.url = req.url!.replace(/^\/api\/admin/, '') || '/';
  // Next.js req/res are compatible with Express but have slightly different types.
  adminRouter(req as any, res as any, () => res.status(404).json({ error: 'Not found' }));
}
