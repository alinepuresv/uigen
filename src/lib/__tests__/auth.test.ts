// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: mockCookieSet, get: mockCookieGet }),
}));

beforeEach(() => {
  mockCookieSet.mockClear();
  mockCookieGet.mockClear();
});

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function getSetCall() {
  const [name, token, options] = mockCookieSet.mock.calls[0];
  return { name, token, options };
}

test("createSession sets a cookie named auth-token", async () => {
  const { createSession } = await import("@/lib/auth");
  await createSession("user-1", "user@example.com");

  expect(mockCookieSet).toHaveBeenCalledOnce();
  const { name } = await getSetCall();
  expect(name).toBe("auth-token");
});

test("createSession sets httpOnly, sameSite, and path cookie options", async () => {
  const { createSession } = await import("@/lib/auth");
  await createSession("user-1", "user@example.com");

  const { options } = await getSetCall();
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
});

test("createSession sets cookie expiry ~7 days from now", async () => {
  const before = Date.now();
  const { createSession } = await import("@/lib/auth");
  await createSession("user-1", "user@example.com");
  const after = Date.now();

  const { options } = await getSetCall();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const expiresMs = options.expires.getTime();

  expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("createSession token contains correct userId and email", async () => {
  const { createSession } = await import("@/lib/auth");
  await createSession("user-42", "test@example.com");

  const { token } = await getSetCall();
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("test@example.com");
});

test("createSession sets secure: false outside production", async () => {
  vi.stubEnv("NODE_ENV", "test");
  const { createSession } = await import("@/lib/auth");
  await createSession("user-1", "user@example.com");

  const { options } = await getSetCall();
  expect(options.secure).toBe(false);
  vi.unstubAllEnvs();
});

async function makeToken(
  payload: object,
  expiresIn: string = "7d"
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

test("getSession returns null when no cookie is present", async () => {
  mockCookieGet.mockReturnValue(undefined);
  const { getSession } = await import("@/lib/auth");

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns the session payload for a valid token", async () => {
  const token = await makeToken({
    userId: "user-1",
    email: "user@example.com",
  });
  mockCookieGet.mockReturnValue({ value: token });
  const { getSession } = await import("@/lib/auth");

  const session = await getSession();
  expect(session?.userId).toBe("user-1");
  expect(session?.email).toBe("user@example.com");
});

test("getSession returns null for a malformed token", async () => {
  mockCookieGet.mockReturnValue({ value: "not-a-valid-jwt" });
  const { getSession } = await import("@/lib/auth");

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for an expired token", async () => {
  const token = await makeToken(
    { userId: "user-1", email: "user@example.com" },
    "-1s"
  );
  mockCookieGet.mockReturnValue({ value: token });
  const { getSession } = await import("@/lib/auth");

  const session = await getSession();
  expect(session).toBeNull();
});
