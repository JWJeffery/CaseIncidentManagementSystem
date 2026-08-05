// server/routes/attachments.js
//
// ============================================================
// PROTOTYPE ONLY -- see the header comment in server/db.js above the
// document_attachments table for the full list of what this does NOT do
// (no encryption at rest, no access control, no durable storage). Do not
// point this at real confidential documents.
// ============================================================
//
// Generic, polymorphic (recordType/recordId) so the same route file can
// be copied into case-management later for injury report / investigation
// attachments without a redesign.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Allowlist: license/insurance documents are photos or PDFs. Rejecting
// everything else is a cheap, real safety measure even in a prototype --
// no reason to accept arbitrary executables just because nothing else is
// locked down yet.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    // Stored filename is a fresh UUID, not the original -- avoids path
    // traversal and collision entirely. Original filename is preserved
    // only as metadata in the DB row, never used to construct a path.
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`File type "${file.mimetype}" not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`));
    }
    cb(null, true);
  },
});

// GET /api/attachments?recordType=X&recordId=Y
router.get('/', (req, res) => {
  const { recordType, recordId } = req.query;
  if (!recordType || !recordId) {
    return res.status(400).json({ error: 'recordType and recordId are required.' });
  }
  const rows = db.prepare(
    `SELECT id, recordType, recordId, documentType, originalFilename, mimeType,
       fileSizeBytes, uploadedBy, classification, createdAt
     FROM document_attachments WHERE recordType = ? AND recordId = ? ORDER BY createdAt DESC`
  ).all(recordType, recordId);
  res.json(rows);
});

// GET /api/attachments/:id/file
// PROTOTYPE: serves the raw file with zero access control. Anyone who
// can reach this API and knows/guesses an attachment id can view it.
router.get('/:id/file', (req, res) => {
  const row = db.prepare('SELECT * FROM document_attachments WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(UPLOAD_DIR, row.storedFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(410).json({ error: 'File metadata exists but the file itself is missing from disk (prototype storage is not durable).' });
  }
  res.setHeader('Content-Type', row.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.originalFilename)}"`);
  fs.createReadStream(filePath).pipe(res);
});

// POST /api/attachments
// multipart/form-data: file, recordType, recordId, documentType, uploadedBy
router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'file is required.' });
    const { recordType, recordId, documentType, uploadedBy } = req.body;
    if (!recordType || !recordId) {
      fs.unlink(req.file.path, () => {}); // don't leave an orphaned file on disk
      return res.status(400).json({ error: 'recordType and recordId are required.' });
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO document_attachments (id, recordType, recordId, documentType,
          originalFilename, storedFilename, mimeType, fileSizeBytes, uploadedBy, classification, createdAt)
        VALUES ($id, $recordType, $recordId, $documentType,
          $originalFilename, $storedFilename, $mimeType, $fileSizeBytes, $uploadedBy, $classification, $createdAt)
      `).run({
        id, recordType, recordId, documentType: documentType || 'Other',
        originalFilename: req.file.originalname, storedFilename: req.file.filename,
        mimeType: req.file.mimetype, fileSizeBytes: req.file.size,
        uploadedBy: uploadedBy || '', classification: 'Prototype -- Unclassified',
        createdAt: now,
      });
      res.json({ id });
    } catch (dbErr) {
      fs.unlink(req.file.path, () => {});
      console.error('POST /api/attachments DB insert failed:', dbErr);
      res.status(500).json({ error: 'Internal error saving attachment metadata.', detail: dbErr.message });
    }
  });
});

// DELETE /api/attachments/:id
// PROTOTYPE: unrestricted delete, no audit trail beyond the console log.
// A production version needs to decide whether attachments on records
// involving real people should ever be hard-deletable at all, versus
// soft-deleted/retained per records-schedule requirements.
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM document_attachments WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(UPLOAD_DIR, row.storedFilename);
  fs.unlink(filePath, () => {}); // ignore ENOENT -- metadata row is the source of truth for the API response either way
  db.prepare('DELETE FROM document_attachments WHERE id = ?').run(req.params.id);
  console.warn(`PROTOTYPE: attachment ${req.params.id} (${row.originalFilename}) deleted, no audit trail beyond this log line.`);
  res.json({ ok: true });
});

module.exports = router;
