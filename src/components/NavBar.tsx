"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import styles from "./NavBar.module.css";

export default function NavBar() {
  const { data: session } = useSession();
  const pathname = usePathname();

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
        {session.user.role === "admin" && (
          <Link
            href="/accounts/closed"
            className={pathname === "/accounts/closed" ? styles.active : ""}
          >
            Closed Accounts
          </Link>
        )}
      </div>

      <div className={styles.userSection}>
        <span className={styles.userRole}>{session.user.role}</span>
        <span className={styles.userEmail}>{session.user.email}</span>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className={styles.logoutBtn}>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
