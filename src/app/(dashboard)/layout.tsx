import NavBar from "@/components/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <NavBar />
      <main>{children}</main>
    </div>
  );
}