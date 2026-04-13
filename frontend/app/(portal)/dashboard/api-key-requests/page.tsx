import { withAuth } from "@workos-inc/authkit-nextjs";
import APIKeyRequestsContent from "./APIKeyRequestsContent";

export default async function APIKeyRequestsPage() {
  await withAuth({ ensureSignedIn: true });

  return <APIKeyRequestsContent />;
}