import { rmSync } from "node:fs";
import type EmbeddedPostgres from "embedded-postgres";

export default async function globalTeardown() {
  const state = (globalThis as { __HTX_PG__?: { pg: EmbeddedPostgres; dataDir: string } }).__HTX_PG__;
  await state?.pg.stop();
  if (state) rmSync(state.dataDir, { recursive: true, force: true });
}
