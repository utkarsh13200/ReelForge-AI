export const DEMO_COOKIE = "reelforge_demo";
export const DEMO_USER_ID = "00000000-0000-0000-0000-0000000000demo";
export const DEMO_PROJECT_ID = "00000000-0000-0000-0000-0000000000proj";
export const DEMO_EMAIL = "local studio";
export const DEMO_NAME = "Creator";

export function isDemoCookieValue(value: string | undefined) {
  return value === "1";
}

export const demoCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
