import { NextResponse } from "next/server.js";

export function jsonOk<T extends Record<string, unknown>>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: true,
      ...data,
    },
    init,
  );
}

export function jsonError(
  error: string,
  message: string,
  extra?: Record<string, unknown>,
  init?: ResponseInit,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message,
      ...(extra ?? {}),
    },
    init ?? { status: 200 },
  );
}

export function jsonControlled(data: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: false,
      controlled: true,
      ...data,
    },
    init ?? { status: 200 },
  );
}
