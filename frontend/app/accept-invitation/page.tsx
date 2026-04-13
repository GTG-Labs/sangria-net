import { Suspense } from "react";
import AcceptInvitationContent from "./AcceptInvitationContent";

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>}>
        <AcceptInvitationContent />
      </Suspense>
    </div>
  );
}