import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
if (!redirectUri) {
  throw new Error("Missing required env var: NEXT_PUBLIC_WORKOS_REDIRECT_URI");
}

export default authkitMiddleware({
  redirectUri,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
