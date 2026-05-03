import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  const dbUrl = process.env.POSTGRES_URL || process.env.contentecom_POSTGRES_URL;
  if (!dbUrl) {
    console.error("No database URL found");
    return;
  }
  const sql = neon(dbUrl);
  
  await sql`
    CREATE TABLE IF NOT EXISTS global_store (
      key VARCHAR(255) PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log("Table global_store created successfully.");
}
main();
