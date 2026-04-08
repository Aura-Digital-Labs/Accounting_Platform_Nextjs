"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import styles from "./NavBar.module.css";

export default function NavBar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch {
      // Ignore network errors here; still proceed with sign-out.
    }

    await signOut({ callbackUrl: "/login" });
  };

  if (!session?.user) return null;

  return (
    <nav className={styles.navbar}>
      <div className={styles.brand}>
        <Image
          src="/aura-logo.webp"
          alt="Aura logo"
          width={28}
          height={28}
          className={styles.logo}
          priority
        />
        <span className={styles.name}>Accounting System</span>
      </div>

      <div className={styles.links}>
        <Link href="/" className={pathname === "/" ? styles.active : ""}>
          Dashboard
        </Link>
        {session.user.role === "client" && (
          <Link
            href="/client/payments"
            className={pathname === "/client/payments" ? styles.active : ""}
          >
            Payments
          </Link>
        )}
        {(session.user.role === "employee" || session.user.role === "project_manager") && (
          <Link
            href="/expenses/submit"
            className={pathname === "/expenses/submit" ? styles.active : ""}
          >
            Expenses
          </Link>
        )}
        {(session.user.role === "admin" || session.user.role === "financial_officer") && (
          <Link
            href={session.user.role === "financial_officer" ? "/financial-officer/settings" : "/settings"}
            className={
              pathname === "/settings" || pathname === "/financial-officer/settings"
                ? styles.active
                : ""
            }
          >
            Settings
          </Link>
        )}
        {(session.user.role === "admin" || session.user.role === "financial_officer") && (
          <Link
            href="/accounts/closed"
            className={pathname === "/accounts/closed" ? styles.active : ""}
          >
            Closed Accounts
          </Link>
        )}
        {(session.user.role === "admin" || session.user.role === "financial_officer") && (
          <Link
            href="/logs"
            className={pathname === "/logs" ? styles.active : ""}
          >
            System Logs
          </Link>
        )}
      </div>

      <div className={styles.userSection}>
        <span className={styles.userRole}>{session.user.role}</span>
        <span className={styles.userEmail}>{session.user.email}</span>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
