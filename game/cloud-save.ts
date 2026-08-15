import type { SaveGameV3 } from "./types";

async function responseJson(response: Response) {
  const body = await response.json() as { error?: string; save?: SaveGameV3; updatedAt?: string; ok?: boolean };
  if (!response.ok) throw new Error(body.error ?? `Błąd synchronizacji (${response.status})`);
  return body;
}

export const CloudSaveRepository = {
  async upload<TCareer>(save: SaveGameV3<TCareer>) {
    return responseJson(await fetch("/api/cloud-save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(save) }));
  },
  async download<TCareer>() {
    return responseJson(await fetch("/api/cloud-save", { method: "GET" })) as Promise<{ save?: SaveGameV3<TCareer>; updatedAt?: string }>;
  },
};
