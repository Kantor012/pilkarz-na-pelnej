import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { careerSaves } from "../../../db/schema";

const unavailable = (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Synchronizacja chmurowa jest niedostępna." }, { status: 503 });

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Zaloguj się, aby pobrać zapis." }, { status: 401 });
  try {
    const [row] = await getDb().select().from(careerSaves).where(eq(careerSaves.userId, user.userId)).limit(1);
    return Response.json({ save: row ? JSON.parse(row.payload) : null, updatedAt: row?.updatedAt ?? null });
  } catch (error) { return unavailable(error); }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Zaloguj się, aby zapisać karierę." }, { status: 401 });
  try {
    const save = await request.json();
    if (!save || save.version !== 3 || typeof save.seed !== "number" || !save.career || !save.world) return Response.json({ error: "Nieprawidłowy SaveGameV3." }, { status: 400 });
    const payload = JSON.stringify(save);
    if (payload.length > 5_000_000) return Response.json({ error: "Zapis przekracza limit 5 MB." }, { status: 413 });
    const updatedAt = new Date();
    await getDb().insert(careerSaves).values({ userId: user.userId, version: 3, payload, updatedAt }).onConflictDoUpdate({ target: careerSaves.userId, set: { version: 3, payload, updatedAt } });
    return Response.json({ ok: true, updatedAt });
  } catch (error) { return unavailable(error); }
}
