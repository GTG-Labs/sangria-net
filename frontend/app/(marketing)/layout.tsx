import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import GitHubStarChip from "@/components/GitHubStarChip";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Navigation />
      {children}
      <Footer />
      <GitHubStarChip />
    </>
  );
}
