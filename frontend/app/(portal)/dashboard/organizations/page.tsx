import { withAuth } from "@workos-inc/authkit-nextjs";
import OrganizationsContent from "./OrganizationsContent";

export default async function OrganizationsPage() {
  await withAuth({ ensureSignedIn: true });

  return <OrganizationsContent />;
}