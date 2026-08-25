import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** 400 with per-field messages so client forms can highlight the offending inputs. */
export function validationError(error: ZodError) {
  return NextResponse.json(
    {
      error: error.issues[0]?.message ?? "Invalid input",
      fieldErrors: error.flatten().fieldErrors,
    },
    { status: 400 }
  );
}

export function notFound(what = "Resource") {
  return NextResponse.json({ error: `${what} not found` }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Parses a JSON body, returning null instead of throwing on malformed input. */
export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}
