"use client";

/** The one helper every admin panel uses to talk to the API. */
export async function sendJson(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "PATCH",
): Promise<{ ok: boolean; status: number; message: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Saved" : (data.error ?? "The change was not saved"),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Not saved, try again. The station PC could not be reached.",
    };
  }
}
