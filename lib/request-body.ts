export class JsonBodyTooLargeError extends Error {
  maxBytes: number;

  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
    this.name = "JsonBodyTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export class JsonBodyParseError extends Error {
  constructor() {
    super("Request body must be valid JSON.");
    this.name = "JsonBodyParseError";
  }
}

export async function readJsonBodyWithLimit(request: Request, maxBytes: number) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    throw new JsonBodyTooLargeError(maxBytes);
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new JsonBodyParseError();
  }
}
