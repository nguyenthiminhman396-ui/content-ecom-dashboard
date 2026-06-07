// Test script for concurrent append SQL — chạy local với Neon DB.
// Sử dụng: node --env-file=.env.local scripts/test_sql.mjs
// Đã verify OK với PGlite ngày 2026-05-15: idempotent append, concurrent ops không mất data.
