import React from "react";
import styles from "./LoadingSpinner.module.css";

export default function LoadingSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={`${styles.container} ${fullScreen ? styles.fullScreen : ""}`}>
      <div className={styles.spinner}></div>
    </div>
  );
}