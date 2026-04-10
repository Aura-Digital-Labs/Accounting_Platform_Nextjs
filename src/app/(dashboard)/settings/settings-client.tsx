"use client";

import Link from "next/link";import toast from 'react-hot-toast';

import { FormEvent, useState } from "react";
import styles from "./settings.module.css";

type Mode = "admin" | "financial_officer" | "employee" | "project_manager" | "client";

type UserFormState = {
  fullName: string;
  email: string;
  password: string;
};

const EMPTY_FORM: UserFormState = {
  fullName: "",
  email: "",
  password: "",
};

export default function AdminSettingsClient({ heading = "Admin" }: { heading?: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearStatus = () => {
    setError("");
    setSuccess("");
  };

  const submitStandardUser = async (
    role: "admin" | "financial_officer" | "employee" | "client"
  ) => {
    const res = await fetch("/api/users", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.fullName,
        email: form.email,
        password: form.password,
        role,
      }),
    });

    const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
    if (!res.ok) {
      throw new Error(payload?.detail || "Failed to create user");
    }
  };

  const submitProjectManager = async () => {
    const res = await fetch("/api/users/project-managers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.fullName,
        email: form.email,
        password: form.password,
      }),
    });

    const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
    if (!res.ok) {
      throw new Error(payload?.detail || "Failed to create project manager");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearStatus();

    if (!mode) {
      toast.error("Select what you want to create first."); setError("Select what you want to create first.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "admin") {
        await submitStandardUser("admin");
        toast.success("Admin created successfully."); setSuccess("Admin created successfully.");
      } else if (mode === "financial_officer") {
        await submitStandardUser("financial_officer");
        toast.success("Financial officer created successfully."); setSuccess("Financial officer created successfully.");
      } else if (mode === "employee") {
        await submitStandardUser("employee");
        toast.success("Employee created successfully."); setSuccess("Employee created successfully.");
      } else if (mode === "client") {
        await submitStandardUser("client");
        toast.success("Client created successfully."); setSuccess("Client created successfully.");
      } else {
        await submitProjectManager();
        toast.success("Project manager created successfully."); setSuccess("Project manager created successfully.");
      }

      setForm(EMPTY_FORM);
    } catch (submitError) {
      const errMsg = submitError instanceof Error ? submitError.message : "Failed to create user"; toast.error(errMsg); setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{heading} Settings</h1>
          <p className={styles.subtitle}>Create admin, financial officer, employee, project manager, and client accounts.</p>
        </div>
        <Link href="/" className={styles.backLink}>
          Back to Dashboard
        </Link>
      </header>

      {(error || success) && (
        <section className={styles.statusCard}>
          {error && <p className={styles.errorText}>{error}</p>}
          {success && <p className={styles.successText}>{success}</p>}
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={mode === "admin" ? styles.buttonActive : styles.button}
            onClick={() => {
              clearStatus();
              setMode("admin");
            }}
          >
            Create Admin
          </button>
          <button
            type="button"
            className={mode === "financial_officer" ? styles.buttonActive : styles.button}
            onClick={() => {
              clearStatus();
              setMode("financial_officer");
            }}
          >
            Create Financial Officer
          </button>
          <button
            type="button"
            className={mode === "employee" ? styles.buttonActive : styles.button}
            onClick={() => {
              clearStatus();
              setMode("employee");
            }}
          >
            Create Employee
          </button>
          <button
            type="button"
            className={mode === "project_manager" ? styles.buttonActive : styles.button}
            onClick={() => {
              clearStatus();
              setMode("project_manager");
            }}
          >
            Create Project Manager
          </button>
          <button
            type="button"
            className={mode === "client" ? styles.buttonActive : styles.button}
            onClick={() => {
              clearStatus();
              setMode("client");
            }}
          >
            Create Client
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          {mode === "admin" && "Create Admin"}
          {mode === "financial_officer" && "Create Financial Officer"}
          {mode === "employee" && "Create Employee"}
          {mode === "project_manager" && "Create Project Manager"}
          {mode === "client" && "Create Client"}
          {!mode && "Select an action to start"}
        </h2>

        {mode && (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label}>
              Full Name
              <input
                className={styles.input}
                value={form.fullName}
                onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Jane Doe"
                required
              />
            </label>

            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="jane@example.com"
                required
              />
            </label>

            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter password"
                required
                minLength={6}
              />
            </label>

            <div className={styles.actionsRow}>
              <button className={styles.submitButton} type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
