"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const useAdminTest = () => {
    setEmail("admin@example.com");
    setPassword("admin123");
    setError("");
  };

  const useUserTest = () => {
    setEmail("user@example.com");
    setPassword("user123");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email,
        password: password,
      });

      if (res?.error) {
        setError("Invalid credentials. Please try again.");
      } else if (res?.ok) {
        router.push("/");
        router.refresh(); // Refresh layout to show NavBar correctly
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Please enter your credentials to sign in</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email or Username</label>
            <div className={styles.inputWrapper}>
              <span className={styles.icon}>@</span>
              <input
                className={styles.input}
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com or username"
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <div className={styles.inputWrapper}>
              <span className={styles.icon}>🔒</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className={styles.testActions}>
            <button type="button" className={styles.testButton} onClick={useAdminTest}>
              Admin test
            </button>
            <button type="button" className={styles.testButton} onClick={useUserTest}>
              User test
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className={styles.footer}>
          By signing in, you agree to our{" "}
          <a href="#terms">Terms of Service</a> and{" "}
          <a href="#privacy">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
