import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware();

export const config = {
  redirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
