import { NextRequest } from "next/server";
import { getServerSession } from "@/lib/auth";

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

export function getAuditContext(req?: NextRequest | Request): AuditContext {
  if (!req) {
    return { ipAddress: "unknown", userAgent: "unknown" };
  }
  
  let ipAddress = "unknown";
  
  if ('headers' in req) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      ipAddress = forwarded.split(",")[0].trim();
    } else {
      ipAddress = req.headers.get("x-real-ip") || "unknown";
    }
  }

  const userAgent = req.headers.get("user-agent") || "unknown";

  return { ipAddress, userAgent };
}
