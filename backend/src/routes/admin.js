const router     = require('express').Router();
const multer     = require('multer');
const unzipper   = require('unzipper');
const path       = require('path');
const fs         = require('fs');
const db         = require('../db');
const { verifyJWT, requireSuperAdmin } = require('../middleware/auth');

// multer: store ZIP in memory (max 100 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith('.zip')) {
      return cb(new Error('Only .zip files are accepted'));
    }
    cb(null, true);
  },
});

// GET /api/admin/version  (public — no auth required)
router.get('/version', async (req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM app_config WHERE key = 'version'");
    res.json({ version: rows[0]?.value ?? '1.0' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/update  (super_admin only)
router.post(
  '/update',
  verifyJWT,
  requireSuperAdmin,
  upload.single('dist'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ZIP file required (field name: dist)' });

    const DEST = process.env.FRONTEND_DIST || '/html';

    try {
      // Parse ZIP from buffer and validate it contains index.html
      const directory = await unzipper.Open.buffer(req.file.buffer);
      const hasIndex  = directory.files.some(f => f.path === 'index.html' || f.path.endsWith('/index.html'));

      if (!hasIndex) {
        return res.status(422).json({ error: 'Invalid ZIP — index.html not found at root level' });
      }

      // Ensure destination exists
      if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

      let filesUpdated = 0;

      // Extract all files
      for (const file of directory.files) {
        if (file.type === 'Directory') continue;
        const destPath = path.join(DEST, file.path);
        const destDir  = path.dirname(destPath);

        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const content = await file.buffer();
        fs.writeFileSync(destPath, content);
        filesUpdated++;
      }

      // Bump version +0.1 in DB
      const versionRes = await db.query(
        "UPDATE app_config SET value = (ROUND(CAST(value AS NUMERIC) + 0.1, 1))::TEXT WHERE key = 'version' RETURNING value"
      );
      const newVersion = versionRes.rows[0]?.value ?? 'unknown';

      res.json({ version: newVersion, files_updated: filesUpdated });
    } catch (err) {
      console.error('Code updater error:', err);
      res.status(500).json({ error: err.message || 'Extraction failed' });
    }
  }
);

module.exports = router;
