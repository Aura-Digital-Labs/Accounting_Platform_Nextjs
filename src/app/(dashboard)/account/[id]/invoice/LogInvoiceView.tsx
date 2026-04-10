"use client";

import { useEffect, useRef } from "react";
import { logInvoiceViewAction } from "./actions";

export default function LogInvoiceView({ accountId }: { accountId: number }) {
  const logged = useRef(false);

  useEffect(() => {
    if (!logged.current) {
      logged.current = true;
      logInvoiceViewAction(accountId).catch(console.error);
    }
  }, [accountId]);

  return null;
}